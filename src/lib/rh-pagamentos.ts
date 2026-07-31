// Pagamentos de RH (folha mensal e diárias) — o financeiro enxerga UM título
// por folha; o pagamento é feito POR COLABORADOR dentro do módulo de RH.
//
// Cada chamada de pagamento:
//   • baixa PARCIALMENTE o título único (baixarTitulo — fluxo de caixa, status
//     PARCIAL→PAGA e guard otimista vêm de graça);
//   • carimba os itens pagos (data, conta, valor);
//   • pós-commit, posta UM lançamento contábil POR ITEM:
//     D conta do colaborador (2.1.6.x) / C banco — origemId `folhaitem-<id>` /
//     `diariaitem-<id>` (idempotente; o razão individual zera pessoa a pessoa).
// O título único tem `contabilizacaoExterna` — contabilizarTituloPagar o ignora,
// e a baixa manual pelo financeiro é bloqueada (pague pelo módulo de RH).
//
// Diárias: o FECHAMENTO (fecharDiariaFolha) posta a provisão — débito pelo
// custeio da classificação do colaborador (MOD→PEP-MOD, MOI→CIF a Apropriar,
// ADMIN/sem classificação→Despesa) e crédito na conta de cada colaborador — e
// cria o título único (categoria "Diárias", vencimento na data da folha).
import { prismaSemEscopo } from "@/lib/prisma";
import { baixarTitulo } from "@/lib/baixa-titulo";
import {
  registrarLancamento, contaDoBanco, apagarLancamentosContabeis,
  contaPorCodigo, type PartidaIn,
} from "@/lib/contabilidade";
import { garantirContaColaboradorNaEmpresa, garantirContaDespesaFallback } from "@/lib/conta-contabil";
import { decimalToNumber, generateSimpleDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";

const r2 = (n: number) => Math.round(n * 100) / 100;

export class RhPagamentoErro extends Error {
  status: number;
  constructor(msg: string, status = 422) { super(msg); this.status = status; }
}

type PagamentoInput = {
  itemIds: string[];
  dataPagamento: string; // YYYY-MM-DD
  contaBancariaId: string;
};

type ItemPago = { origemId: string; colaboradorId: string; nome: string; valor: number };

// Valida a conta bancária da empresa e resolve as contas contábeis do lançamento.
async function contasDoPagamento(empresaId: string, contaBancariaId: string) {
  const cb = await prismaSemEscopo.contaBancaria.findFirst({
    where: { id: contaBancariaId, empresaId },
    select: { id: true, nome: true },
  });
  if (!cb) throw new RhPagamentoErro("Conta bancária inválida para a empresa da folha.");
  const contaBanco = await contaDoBanco(empresaId, contaBancariaId);
  if (!contaBanco) throw new RhPagamentoErro("Conta contábil do banco não encontrada.");
  return { cb, contaBanco };
}

// Pós-commit: um lançamento POR ITEM pago — D conta do colaborador / C banco.
async function contabilizarPagamentos(
  empresaId: string, data: Date, contaBancoId: string, itens: ItemPago[], contexto: string,
) {
  for (const it of itens) {
    const contaColab = await garantirContaColaboradorNaEmpresa(empresaId, it.colaboradorId);
    if (!contaColab) continue;
    await registrarLancamento({
      empresaId, data,
      historico: `Pagamento — ${it.nome} (${contexto})`,
      origemTipo: "PAGAMENTO", origemId: it.origemId,
      partidas: [
        { contaId: contaColab.id, tipo: "DEBITO", valor: it.valor },
        { contaId: contaBancoId, tipo: "CREDITO", valor: it.valor },
      ],
    }).catch(() => null);
  }
}

/**
 * Paga o LÍQUIDO de um conjunto de colaboradores da folha mensal (folha FECHADA).
 * Baixa parcial no título único + carimbo nos itens + contábil por pessoa.
 */
export async function pagarItensFolha(folhaId: string, input: PagamentoInput) {
  const dataPag = new Date(`${input.dataPagamento.slice(0, 10)}T12:00:00`);

  const { empresaId, contaBancoId, pagos } = await prismaSemEscopo.$transaction(async (tx) => {
    const folha = await tx.folhaPagamento.findUnique({
      where: { id: folhaId },
      select: {
        id: true, empresaId: true, status: true, competencia: true,
        itens: { select: { id: true, colaboradorId: true, nome: true, liquido: true, dataPagamento: true } },
      },
    });
    if (!folha) throw new RhPagamentoErro("Folha não encontrada.", 404);
    if (folha.status !== "FECHADA") throw new RhPagamentoErro("A folha precisa estar FECHADA para registrar pagamentos.");

    const titulo = await tx.contaPagar.findFirst({
      where: { folhaId, contabilizacaoExterna: true, status: { not: "CANCELADA" } },
      select: { id: true },
    });
    if (!titulo) throw new RhPagamentoErro("Título único da folha não encontrado — feche a folha novamente.");

    const { contaBanco } = await contasDoPagamento(folha.empresaId, input.contaBancariaId);

    const alvo = folha.itens.filter((i) => input.itemIds.includes(i.id));
    if (alvo.length === 0) throw new RhPagamentoErro("Nenhum colaborador selecionado.");
    const jaPago = alvo.find((i) => i.dataPagamento);
    if (jaPago) throw new RhPagamentoErro(`${jaPago.nome} já está pago — recarregue a tela.`, 409);
    const semColab = alvo.find((i) => !i.colaboradorId);
    if (semColab) throw new RhPagamentoErro(`${semColab.nome} está sem colaborador vinculado.`);

    const itensPagar = alvo
      .map((i) => ({ id: i.id, colaboradorId: i.colaboradorId!, nome: i.nome, valor: r2(decimalToNumber(i.liquido)) }))
      .filter((i) => i.valor > 0);
    if (itensPagar.length === 0) throw new RhPagamentoErro("Os itens selecionados não têm líquido a pagar.");
    const total = r2(itensPagar.reduce((s, i) => s + i.valor, 0));

    const baixa = await baixarTitulo(tx, {
      tipo: "PAGAR", tituloId: titulo.id, dataPagamento: dataPag,
      linhas: [{ forma: null, contaBancariaId: input.contaBancariaId, valor: total }],
    });
    if (baixa.erro) throw new RhPagamentoErro(baixa.erro.msg, baixa.erro.status);

    for (const i of itensPagar) {
      await tx.folhaItem.update({
        where: { id: i.id },
        data: { dataPagamento: dataPag, contaBancariaId: input.contaBancariaId, valorPago: i.valor },
      });
    }

    return {
      empresaId: folha.empresaId, contaBancoId: contaBanco.id,
      pagos: itensPagar.map((i): ItemPago => ({ origemId: `folhaitem-${i.id}`, colaboradorId: i.colaboradorId, nome: i.nome, valor: i.valor })),
    };
  });

  await contabilizarPagamentos(empresaId, dataPag, contaBancoId, pagos, "folha");
  return { pagos: pagos.length, total: r2(pagos.reduce((s, p) => s + p.valor, 0)) };
}

/**
 * Paga diárias de um conjunto de diaristas (folha de diárias FECHADA).
 * Mesmo padrão da folha mensal.
 */
export async function pagarItensDiaria(diariaFolhaId: string, input: PagamentoInput) {
  const dataPag = new Date(`${input.dataPagamento.slice(0, 10)}T12:00:00`);

  const { empresaId, contaBancoId, pagos } = await prismaSemEscopo.$transaction(async (tx) => {
    const folha = await tx.diariaFolha.findUnique({
      where: { id: diariaFolhaId },
      select: {
        id: true, empresaId: true, status: true, data: true,
        grupos: { select: { itens: { select: { id: true, colaboradorId: true, valor: true, valorTotal: true, dataPagamento: true, colaborador: { select: { nome: true } } } } } },
      },
    });
    if (!folha) throw new RhPagamentoErro("Folha de diárias não encontrada.", 404);
    if (folha.status !== "FECHADA") throw new RhPagamentoErro("A folha de diárias precisa estar FECHADA para registrar pagamentos.");

    const titulo = await tx.contaPagar.findFirst({
      where: { diariaFolhaId, contabilizacaoExterna: true, status: { not: "CANCELADA" } },
      select: { id: true },
    });
    if (!titulo) throw new RhPagamentoErro("Título único da diária não encontrado — feche a folha novamente.");

    const { contaBanco } = await contasDoPagamento(folha.empresaId, input.contaBancariaId);

    const todos = folha.grupos.flatMap((g) => g.itens);
    const alvo = todos.filter((i) => input.itemIds.includes(i.id));
    if (alvo.length === 0) throw new RhPagamentoErro("Nenhum diarista selecionado.");
    const jaPago = alvo.find((i) => i.dataPagamento);
    if (jaPago) throw new RhPagamentoErro(`${jaPago.colaborador.nome} já está pago — recarregue a tela.`, 409);

    const itensPagar = alvo
      .map((i) => ({
        id: i.id, colaboradorId: i.colaboradorId, nome: i.colaborador.nome,
        valor: r2(decimalToNumber(i.valorTotal ?? 0) || decimalToNumber(i.valor)),
      }))
      .filter((i) => i.valor > 0);
    if (itensPagar.length === 0) throw new RhPagamentoErro("Os itens selecionados não têm valor a pagar.");
    const total = r2(itensPagar.reduce((s, i) => s + i.valor, 0));

    const baixa = await baixarTitulo(tx, {
      tipo: "PAGAR", tituloId: titulo.id, dataPagamento: dataPag,
      linhas: [{ forma: null, contaBancariaId: input.contaBancariaId, valor: total }],
    });
    if (baixa.erro) throw new RhPagamentoErro(baixa.erro.msg, baixa.erro.status);

    for (const i of itensPagar) {
      await tx.diariaItem.update({
        where: { id: i.id },
        data: { dataPagamento: dataPag, contaBancariaId: input.contaBancariaId, valorPago: i.valor },
      });
    }

    return {
      empresaId: folha.empresaId, contaBancoId: contaBanco.id,
      pagos: itensPagar.map((i): ItemPago => ({ origemId: `diariaitem-${i.id}`, colaboradorId: i.colaboradorId, nome: i.nome, valor: i.valor })),
    };
  });

  await contabilizarPagamentos(empresaId, dataPag, contaBancoId, pagos, "diária");
  return { pagos: pagos.length, total: r2(pagos.reduce((s, p) => s + p.valor, 0)) };
}

/**
 * Pagamento AGRUPADO POR PESSOA: paga diárias pendentes de várias folhas
 * (FECHADAS) de uma vez — o diarista acumula dias e recebe o total. Para cada
 * folha envolvida, baixa o título único proporcionalmente à soma dos itens
 * daquela folha; folha fechada ANTES da integração financeira (sem título)
 * ganha provisão + título na hora (fecharDiariaFolha é idempotente).
 */
export async function pagarDiariasAgrupadas(input: PagamentoInput) {
  const dataPag = new Date(`${input.dataPagamento.slice(0, 10)}T12:00:00`);

  // Folhas dos itens selecionados; as fechadas sem título ganham o financeiro
  // retroativo AGORA (provisão + CP) — fora da transação de pagamento.
  const prev = await prismaSemEscopo.diariaItem.findMany({
    where: { id: { in: input.itemIds } },
    select: { grupo: { select: { folha: { select: { id: true, status: true } } } } },
  });
  const folhaIds = Array.from(new Set(prev.map((i) => i.grupo.folha.id)));
  for (const fid of folhaIds) {
    const temTitulo = await prismaSemEscopo.contaPagar.count({
      where: { diariaFolhaId: fid, status: { not: "CANCELADA" } },
    });
    if (temTitulo === 0) await fecharDiariaFolha(fid);
  }

  const { empresaId, contaBancoId, pagos } = await prismaSemEscopo.$transaction(async (tx) => {
    const itens = await tx.diariaItem.findMany({
      where: { id: { in: input.itemIds } },
      select: {
        id: true, colaboradorId: true, valor: true, valorTotal: true, dataPagamento: true,
        colaborador: { select: { nome: true } },
        grupo: { select: { folha: { select: { id: true, empresaId: true, status: true } } } },
      },
    });
    if (itens.length === 0) throw new RhPagamentoErro("Nenhuma diária selecionada.");
    const empresaId = itens[0].grupo.folha.empresaId;
    if (itens.some((i) => i.grupo.folha.empresaId !== empresaId)) {
      throw new RhPagamentoErro("Selecione diárias de uma única empresa por pagamento.");
    }
    const jaPago = itens.find((i) => i.dataPagamento);
    if (jaPago) throw new RhPagamentoErro(`${jaPago.colaborador.nome} tem diária já paga na seleção — recarregue a tela.`, 409);
    const aberta = itens.find((i) => i.grupo.folha.status !== "FECHADA");
    if (aberta) throw new RhPagamentoErro("Há diária de folha ainda ABERTA na seleção — feche a folha antes de pagar.");

    const { contaBanco } = await contasDoPagamento(empresaId, input.contaBancariaId);

    const itensPagar = itens
      .map((i) => ({
        id: i.id, colaboradorId: i.colaboradorId, nome: i.colaborador.nome, folhaId: i.grupo.folha.id,
        valor: r2(decimalToNumber(i.valorTotal ?? 0) || decimalToNumber(i.valor)),
      }))
      .filter((i) => i.valor > 0);
    if (itensPagar.length === 0) throw new RhPagamentoErro("Os itens selecionados não têm valor a pagar.");

    // Uma baixa POR FOLHA envolvida (cada título recebe a soma dos seus itens).
    const porFolha = new Map<string, number>();
    for (const i of itensPagar) porFolha.set(i.folhaId, r2((porFolha.get(i.folhaId) ?? 0) + i.valor));
    for (const [fid, soma] of Array.from(porFolha.entries())) {
      const titulo = await tx.contaPagar.findFirst({
        where: { diariaFolhaId: fid, contabilizacaoExterna: true, status: { not: "CANCELADA" } },
        select: { id: true },
      });
      if (!titulo) throw new RhPagamentoErro("Título único de uma das folhas não foi encontrado — recarregue e tente de novo.");
      const baixa = await baixarTitulo(tx, {
        tipo: "PAGAR", tituloId: titulo.id, dataPagamento: dataPag,
        linhas: [{ forma: null, contaBancariaId: input.contaBancariaId, valor: soma }],
      });
      if (baixa.erro) throw new RhPagamentoErro(baixa.erro.msg, baixa.erro.status);
    }

    for (const i of itensPagar) {
      await tx.diariaItem.update({
        where: { id: i.id },
        data: { dataPagamento: dataPag, contaBancariaId: input.contaBancariaId, valorPago: i.valor },
      });
    }

    return {
      empresaId, contaBancoId: contaBanco.id,
      pagos: itensPagar.map((i): ItemPago => ({ origemId: `diariaitem-${i.id}`, colaboradorId: i.colaboradorId, nome: i.nome, valor: i.valor })),
    };
  });

  await contabilizarPagamentos(empresaId, dataPag, contaBancoId, pagos, "diária");
  return { pagos: pagos.length, total: r2(pagos.reduce((s, p) => s + p.valor, 0)) };
}

// ── Fechamento / reabertura da folha de diárias ─────────────────────────────

/**
 * Fecha a folha de diárias: posta a provisão (custeio pela classificação do
 * colaborador — MOD→PEP-MOD, MOI→CIF a Apropriar, senão Despesa — contra a
 * conta de cada colaborador) e cria o TÍTULO ÚNICO no financeiro (categoria
 * "Diárias", vencimento na data da folha). Idempotente por origem.
 */
export async function fecharDiariaFolha(diariaFolhaId: string) {
  const folha = await prismaSemEscopo.diariaFolha.findUnique({
    where: { id: diariaFolhaId },
    select: {
      id: true, empresaId: true, status: true, data: true, turno: true,
      grupos: { select: { itens: { select: {
        id: true, colaboradorId: true, valor: true, valorTotal: true,
        colaborador: { select: { id: true, nome: true, classificacaoCusto: true } },
      } } } },
    },
  });
  if (!folha) throw new RhPagamentoErro("Folha de diárias não encontrada.", 404);

  const itens = folha.grupos.flatMap((g) => g.itens)
    .map((i) => ({
      colaboradorId: i.colaboradorId, nome: i.colaborador.nome,
      classificacao: i.colaborador.classificacaoCusto ?? "ADMIN",
      valor: r2(decimalToNumber(i.valorTotal ?? 0) || decimalToNumber(i.valor)),
    }))
    .filter((i) => i.valor > 0);
  if (itens.length === 0) throw new RhPagamentoErro("A folha não tem diárias com valor para fechar.");
  const total = r2(itens.reduce((s, i) => s + i.valor, 0));
  const empresaId = folha.empresaId;

  // Débitos por classificação do colaborador (mesma regra da folha mensal).
  const [pepMod, cifAprop, despesaFb] = await Promise.all([
    contaPorCodigo(empresaId, "1.1.3.0005.0002"),
    contaPorCodigo(empresaId, "1.1.4.0001"),
    garantirContaDespesaFallback(empresaId),
  ]);
  if (!despesaFb) throw new RhPagamentoErro("Conta de despesa (3.3) não encontrada.");
  const contaDe = (cls: string) =>
    cls === "MOD" && pepMod ? pepMod : cls === "MOI" && cifAprop ? cifAprop : despesaFb;

  const debitos = new Map<string, number>();
  const creditos = new Map<string, { nome: string; valor: number }>();
  for (const i of itens) {
    const cd = contaDe(i.classificacao);
    debitos.set(cd.id, r2((debitos.get(cd.id) ?? 0) + i.valor));
    const cur = creditos.get(i.colaboradorId) ?? { nome: i.nome, valor: 0 };
    cur.valor = r2(cur.valor + i.valor);
    creditos.set(i.colaboradorId, cur);
  }

  const partidas: PartidaIn[] = [];
  for (const [contaId, valor] of Array.from(debitos.entries())) {
    partidas.push({ contaId, tipo: "DEBITO", valor });
  }
  for (const [colabId, c] of Array.from(creditos.entries())) {
    const contaColab = await garantirContaColaboradorNaEmpresa(empresaId, colabId);
    if (!contaColab) throw new RhPagamentoErro(`Não foi possível garantir a conta contábil de ${c.nome}.`);
    partidas.push({ contaId: contaColab.id, tipo: "CREDITO", valor: c.valor });
  }

  const dataStr = folha.data.toISOString().slice(0, 10).split("-").reverse().join("/");
  await registrarLancamento({
    empresaId, data: folha.data,
    historico: `Diárias ${dataStr} — ${folha.turno === "NOITE" ? "noite" : "dia"}`,
    origemTipo: "DIARIA", origemId: folha.id,
    partidas,
  });

  // Título único (idempotente: reaproveita o existente se fechar de novo).
  const existente = await prismaSemEscopo.contaPagar.findFirst({
    where: { diariaFolhaId: folha.id, status: { not: "CANCELADA" } },
    select: { id: true },
  });
  if (!existente) {
    const numero = generateSimpleDocNumber("CP", await proximaSequenciaDaEmpresa(empresaId, "CP"));
    await prismaSemEscopo.contaPagar.create({
      data: {
        empresaId, numero,
        descricao: `Diárias ${dataStr} — ${folha.turno === "NOITE" ? "noite" : "dia"}`,
        valorOriginal: total, dataVencimento: folha.data, dataCompetencia: folha.data,
        categoria: "Diárias", status: "ABERTA",
        semProvisao: true, contabilizacaoExterna: true, diariaFolhaId: folha.id,
      },
    });
  }

  await prismaSemEscopo.diariaFolha.update({ where: { id: folha.id }, data: { status: "FECHADA" } });
}

/**
 * Reabre a folha de diárias: só sem pagamento registrado — estorna a provisão
 * e remove o título único.
 */
export async function reabrirDiariaFolha(diariaFolhaId: string) {
  const folha = await prismaSemEscopo.diariaFolha.findUnique({
    where: { id: diariaFolhaId },
    select: { id: true, empresaId: true, status: true },
  });
  if (!folha) throw new RhPagamentoErro("Folha de diárias não encontrada.", 404);

  const titulo = await prismaSemEscopo.contaPagar.findFirst({
    where: { diariaFolhaId: folha.id, status: { not: "CANCELADA" } },
    select: { id: true, valorPago: true },
  });
  if (titulo && decimalToNumber(titulo.valorPago) > 0) {
    throw new RhPagamentoErro("A folha tem pagamentos registrados — não é possível reabrir.");
  }

  await apagarLancamentosContabeis({ empresaId: folha.empresaId, origemTipo: "DIARIA", origemId: folha.id });
  if (titulo) await prismaSemEscopo.contaPagar.delete({ where: { id: titulo.id } });
  await prismaSemEscopo.diariaFolha.update({ where: { id: folha.id }, data: { status: "ABERTA" } });
}
