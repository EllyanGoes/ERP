import { prismaSemEscopo } from "@/lib/prisma";
import { recontabilizarTituloReceber, recontabilizarTituloPagar } from "@/lib/contabilidade";
import { garantirContaContabilNatureza } from "@/lib/conta-contabil";
import type { NaturezaGrupo, NaturezaTipo } from "@prisma/client";

// ── Reorganização das naturezas financeiras da CIMENTO E MIX (jul/2026) ───────
// Aplica o plano de categorias padrão (referência Nibo, PDF 15/07/2026) SÓ na
// emp_cimentomix, com as decisões do dono:
//   • COMBUSTIVEL duplicado → "Combustível de operação" (custo) e
//     "Combustível administrativo" (despesa adm);
//   • CAMINHAO MUNCK JUQ3G04 → relançado em "Manutenção de frota";
//   • CAIXA ELLYELTON → relançado em "Retirada de capital";
//   • DESPESA ADMIN → "Outras despesas";
//   • SAUDE E SEGURANCA NO TRABALHO → "Salários, encargos e benefícios";
//   • famílias de retenção de impostos criadas TRAVADAS (sistema) — habilitam
//     a aba "Retenção de impostos" do Novo Lançamento no futuro.
// Idempotente: renomeia só se o nome antigo ainda existe, cria só o que falta
// (sistema por upsert na chave), merge remapeia e apaga só se a velha existe.
// Todo título remapeado é RECONTABILIZADO (apaga e refaz o razão pelo estado
// novo). Backup das naturezas e dos vínculos em _bkp_nat_cmb_20260715_*.

const EMP = "emp_cimentomix";
const BKP = "_bkp_nat_cmb_20260715";

type Def = {
  nome: string;
  tipo: NaturezaTipo;
  grupo: NaturezaGrupo;
  subgrupo?: string;
  sistemaChave?: string; // presente = natureza travada (cadeado)
};

// Subgrupos (pais das famílias no plano do Nibo).
const SUBGRUPOS: { nome: string; grupo: NaturezaGrupo }[] = [
  { nome: "Impostos retidos sobre a receita", grupo: "CUSTO_OPERACIONAL" },
  { nome: "Impostos retidos sobre pagamentos", grupo: "DESPESA_OPERACIONAL" },
  { nome: "Pagamento de impostos retidos", grupo: "DESPESA_OPERACIONAL" },
];

// Renomeios (nome atual → novo). Localizados por nome+grupo (o COMBUSTIVEL
// duplicado se distingue pelo grupo).
const RENAMES: { de: string; grupoDe?: NaturezaGrupo; para: string; subgrupoPara?: string }[] = [
  { de: "Venda de mercadorias", para: "Receita com vendas" },
  { de: "Venda de serviços", para: "Receita com serviços" },
  { de: "Compra de mercadorias", para: "Custos produto vendido" },
  { de: "Aluguel", para: "Aluguel e condomínio" },
  { de: "Impostos e taxas", para: "Taxas e contribuições" },
  { de: "Salários e encargos", para: "Salários, encargos e benefícios" },
  { de: "Multa Paga", para: "Multas Pagas" },
  { de: "Tarifa Bancária", para: "Tarifa bancária" },
  { de: "Captação de empréstimos", para: "Obtenção de empréstimo" },
  { de: "Pagamento de empréstimos", para: "Pagamento de empréstimo" },
  { de: "Compra de imobilizado", para: "Compra de ativo fixo" },
  { de: "COMBUSTIVEL", grupoDe: "CUSTO_OPERACIONAL", para: "Combustível de operação" },
  { de: "COMBUSTIVEL", grupoDe: "DESPESA_OPERACIONAL", para: "Combustível administrativo", subgrupoPara: "Despesas administrativas" },
];

// Criações (só o que não existir). Cadeado = sistemaChave.
const CREATES: Def[] = [
  // Receitas operacionais
  { nome: "Multas Recebidas", tipo: "ENTRADA", grupo: "RECEITA_OPERACIONAL", sistemaChave: "multas-recebidas" },
  { nome: "Descontos Concedidos", tipo: "SAIDA", grupo: "RECEITA_OPERACIONAL", sistemaChave: "descontos-concedidos" },
  { nome: "Outras receitas", tipo: "ENTRADA", grupo: "RECEITA_OPERACIONAL", sistemaChave: "outras-receitas" },
  // Custos operacionais
  { nome: "Custo serviço prestado", tipo: "SAIDA", grupo: "CUSTO_OPERACIONAL" },
  { nome: "Impostos sobre receita", tipo: "SAIDA", grupo: "CUSTO_OPERACIONAL" },
  ...["IRPJ", "COFINS", "INSS", "CSLL", "ISS", "PIS"].map((s): Def => ({
    nome: `${s} Retido sobre a Receita`, tipo: "SAIDA", grupo: "CUSTO_OPERACIONAL",
    subgrupo: "Impostos retidos sobre a receita", sistemaChave: `ret-receita-${s.toLowerCase()}`,
  })),
  { nome: "Outras Retenções sobre a Receita", tipo: "SAIDA", grupo: "CUSTO_OPERACIONAL", subgrupo: "Impostos retidos sobre a receita", sistemaChave: "ret-receita-outras" },
  // Despesas operacionais
  { nome: "Água", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL", subgrupo: "Despesas administrativas" },
  { nome: "Luz", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL", subgrupo: "Despesas administrativas" },
  { nome: "Telefone e Internet", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL", subgrupo: "Despesas administrativas" },
  { nome: "Material de escritório", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL", subgrupo: "Despesas administrativas" },
  { nome: "Serviços contratados", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL" },
  { nome: "Despesas financeiras", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL" },
  { nome: "Outras despesas", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL" },
  { nome: "Manutenção de frota", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL" },
  { nome: "Descontos Recebidos", tipo: "ENTRADA", grupo: "DESPESA_OPERACIONAL", sistemaChave: "descontos-recebidos" },
  ...["Outras", "PIS", "INSS", "IRPJ", "COFINS", "CSLL", "ISS"].map((s): Def => ({
    nome: s === "Outras" ? "Outras Retenções sobre Pagamentos" : `${s} Retido sobre Pagamentos`,
    tipo: "ENTRADA", grupo: "DESPESA_OPERACIONAL",
    subgrupo: "Impostos retidos sobre pagamentos", sistemaChave: `ret-pagto-${s.toLowerCase()}`,
  })),
  ...["Cofins", "IRPJ", "CSLL", "ISS", "INSS", "PIS"].map((s): Def => ({
    nome: `Pagamento de ${s} Retido`, tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL",
    subgrupo: "Pagamento de impostos retidos", sistemaChave: `pagto-ret-${s.toLowerCase()}`,
  })),
  { nome: "Pagamento de Outras retenções", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL", subgrupo: "Pagamento de impostos retidos", sistemaChave: "pagto-ret-outras" },
  // Investimento
  { nome: "Venda de ativo fixo", tipo: "ENTRADA", grupo: "INVESTIMENTO" },
  // Financiamento
  { nome: "Aporte de capital", tipo: "ENTRADA", grupo: "FINANCIAMENTO" },
  { nome: "Retirada de capital", tipo: "SAIDA", grupo: "FINANCIAMENTO" },
];

// Merges: tudo da natureza velha é relançado na nova (por NOME novo — que deve
// existir após renames/creates) e a velha é excluída.
const MERGES: { de: string; para: string }[] = [
  { de: "Insumos / matéria-prima", para: "Custos produto vendido" },
  { de: "DESPESA PESSOAL ADMIN", para: "Salários, encargos e benefícios" },
  { de: "SAUDE E SEGURANCA NO TRABALHO", para: "Salários, encargos e benefícios" },
  { de: "DESPESA ADMIN", para: "Outras despesas" },
  { de: "CAMINHAO MUNCK JUQ3G04", para: "Manutenção de frota" },
  { de: "CAIXA ELLYELTON", para: "Retirada de capital" },
  { de: "Energia, água e telefone", para: "Telefone e Internet" },
];

export type ResultadoReorganizacao = {
  dry: boolean;
  renomeadas: string[];
  criadas: string[];
  merges: { de: string; para: string; titulosCR: number; titulosCP: number; lancamentos: number }[];
  recontabilizados: number;
  errosRecontabilizacao: string[];
  avisos: string[];
};

async function contarRefs(natId: string) {
  const [cr, cp, lc] = await Promise.all([
    prismaSemEscopo.contaReceber.count({ where: { naturezaFinanceiraId: natId } }),
    prismaSemEscopo.contaPagar.count({ where: { naturezaFinanceiraId: natId } }),
    prismaSemEscopo.lancamentoFinanceiro.count({ where: { naturezaFinanceiraId: natId } }),
  ]);
  return { cr, cp, lc };
}

export async function executarReorganizacaoNaturezasCMB(dry: boolean): Promise<ResultadoReorganizacao> {
  const r: ResultadoReorganizacao = { dry, renomeadas: [], criadas: [], merges: [], recontabilizados: 0, errosRecontabilizacao: [], avisos: [] };

  const nat = (nome: string, grupo?: NaturezaGrupo) =>
    prismaSemEscopo.naturezaFinanceira.findFirst({ where: { empresaId: EMP, nome, ...(grupo ? { grupo } : {}) } });

  // 0) Backup (só na execução real): naturezas + vínculos de título/lançamento.
  if (!dry) {
    await prismaSemEscopo.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${BKP}_naturezas" AS SELECT * FROM "NaturezaFinanceira" WHERE "empresaId" = '${EMP}'`);
    await prismaSemEscopo.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${BKP}_vinculos" AS
         SELECT 'ContaReceber' AS tabela, id, "naturezaFinanceiraId" FROM "ContaReceber" WHERE "empresaId"='${EMP}' AND "naturezaFinanceiraId" IS NOT NULL
         UNION ALL SELECT 'ContaPagar', id, "naturezaFinanceiraId" FROM "ContaPagar" WHERE "empresaId"='${EMP}' AND "naturezaFinanceiraId" IS NOT NULL
         UNION ALL SELECT 'LancamentoCaixa', id, "naturezaFinanceiraId" FROM "LancamentoCaixa" WHERE "empresaId"='${EMP}' AND "naturezaFinanceiraId" IS NOT NULL`);
  }

  // 1) Subgrupos das famílias.
  const subIdPorNome = new Map<string, string>();
  for (const s of [...SUBGRUPOS, { nome: "Despesas administrativas", grupo: "DESPESA_OPERACIONAL" as NaturezaGrupo }]) {
    let sub = await prismaSemEscopo.naturezaSubgrupo.findFirst({ where: { empresaId: EMP, nome: s.nome } });
    if (!sub && !dry) sub = await prismaSemEscopo.naturezaSubgrupo.create({ data: { empresaId: EMP, nome: s.nome, grupo: s.grupo } });
    if (sub) subIdPorNome.set(s.nome, sub.id);
  }

  // 2) Renomeios.
  for (const rn of RENAMES) {
    const alvo = await nat(rn.de, rn.grupoDe);
    if (!alvo) continue; // já renomeada (ou não existe) — idempotente
    const jaExisteNovo = await nat(rn.para);
    if (jaExisteNovo && jaExisteNovo.id !== alvo.id) {
      r.avisos.push(`Rename pulado: "${rn.para}" já existe — "${rn.de}" precisa de merge manual.`);
      continue;
    }
    if (!dry) {
      await prismaSemEscopo.naturezaFinanceira.update({
        where: { id: alvo.id },
        data: {
          nome: rn.para,
          ...(rn.subgrupoPara && subIdPorNome.get(rn.subgrupoPara) ? { subgrupoId: subIdPorNome.get(rn.subgrupoPara)! } : {}),
        },
      });
      // A conta de RESULTADO vinculada acompanha o nome da natureza.
      await prismaSemEscopo.contaContabil.updateMany({
        where: { empresaId: EMP, naturezaFinanceiraId: alvo.id },
        data: { nome: rn.para },
      });
    }
    r.renomeadas.push(`${rn.de} → ${rn.para}`);
  }

  // 3) Criações.
  for (const c of CREATES) {
    const existente = c.sistemaChave
      ? await prismaSemEscopo.naturezaFinanceira.findFirst({ where: { empresaId: EMP, OR: [{ sistemaChave: c.sistemaChave }, { nome: c.nome }] } })
      : await nat(c.nome);
    if (existente) continue;
    if (!dry) {
      const nova = await prismaSemEscopo.naturezaFinanceira.create({
        data: {
          empresaId: EMP, nome: c.nome, tipo: c.tipo, grupo: c.grupo,
          subgrupoId: c.subgrupo ? (subIdPorNome.get(c.subgrupo) ?? null) : null,
          sistema: !!c.sistemaChave, sistemaChave: c.sistemaChave ?? null,
        },
      });
      await garantirContaContabilNatureza(nova.id).catch((e) => r.avisos.push(`Conta contábil de "${c.nome}": ${e instanceof Error ? e.message : e}`));
    }
    r.criadas.push(c.nome);
  }

  // 4) Merges: remapeia TODAS as referências e apaga a natureza velha.
  const recontabilizarCR = new Set<string>();
  const recontabilizarCP = new Set<string>();
  for (const m of MERGES) {
    const velha = await nat(m.de);
    if (!velha) continue; // já migrada
    const novaNat = await nat(m.para);
    if (!novaNat) { r.avisos.push(`Merge pulado: destino "${m.para}" não encontrado para "${m.de}".`); continue; }

    const contagem = await contarRefs(velha.id);
    r.merges.push({ de: m.de, para: m.para, titulosCR: contagem.cr, titulosCP: contagem.cp, lancamentos: contagem.lc });
    if (dry) continue;

    // Ids afetados ANTES do remap (para recontabilizar depois).
    const [crs, cps] = await Promise.all([
      prismaSemEscopo.contaReceber.findMany({ where: { naturezaFinanceiraId: velha.id }, select: { id: true } }),
      prismaSemEscopo.contaPagar.findMany({ where: { naturezaFinanceiraId: velha.id }, select: { id: true } }),
    ]);
    crs.forEach((x) => recontabilizarCR.add(x.id));
    cps.forEach((x) => recontabilizarCP.add(x.id));

    const de = velha.id, para = novaNat.id;
    await prismaSemEscopo.$transaction([
      prismaSemEscopo.contaReceber.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.contaReceber.updateMany({ where: { taxaNaturezaId: de }, data: { taxaNaturezaId: para } }),
      prismaSemEscopo.contaPagar.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.contaPagar.updateMany({ where: { taxaNaturezaId: de }, data: { taxaNaturezaId: para } }),
      prismaSemEscopo.lancamentoFinanceiro.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.contaPagarNatureza.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.contaReceberNatureza.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.recorrencia.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.pedidoVenda.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.conferenciaCompra.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.requisicaoMaterial.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.requisicaoMaterialItem.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      prismaSemEscopo.item.updateMany({ where: { naturezaPadraoId: de }, data: { naturezaPadraoId: para } }),
      prismaSemEscopo.partidaContabil.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: para } }),
      // Conta de resultado da velha fica desvinculada (a recontabilização move o
      // razão para a conta da nova; a conta órfã pode ser arrumada no plano depois).
      prismaSemEscopo.contaContabil.updateMany({ where: { naturezaFinanceiraId: de }, data: { naturezaFinanceiraId: null, ativo: false } }),
    ]);
    try {
      await prismaSemEscopo.naturezaFinanceira.delete({ where: { id: de } });
    } catch (e) {
      r.avisos.push(`"${m.de}" remapeada mas NÃO excluída (referência restante): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 5) Recontabiliza os títulos remapeados (apaga e refaz o razão de cada um).
  if (!dry) {
    for (const id of Array.from(recontabilizarCR)) {
      try { await recontabilizarTituloReceber(id); r.recontabilizados++; }
      catch (e) { r.errosRecontabilizacao.push(`CR ${id}: ${e instanceof Error ? e.message : e}`); }
    }
    for (const id of Array.from(recontabilizarCP)) {
      try { await recontabilizarTituloPagar(id); r.recontabilizados++; }
      catch (e) { r.errosRecontabilizacao.push(`CP ${id}: ${e instanceof Error ? e.message : e}`); }
    }
  }

  return r;
}
