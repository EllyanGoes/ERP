// Pagamentos em processos (docs/processos-prd.md §8.3):
//  • prazo ↔ título: quitar o CP ligado cumpre o prazo (andamento automático); estornar reabre;
//  • depósito judicial: CP com a natureza travada "deposito-judicial" (ATIVO 1.2.9001); cada
//    depósito tem SALDO = pago − destinos (levantado → CR; convertido → reclass. contábil);
//  • resumo por processo (já pago, depositado em juízo) — CPC 25 e painel.
// Tudo aqui é server-only e opera cross-empresa com ids explícitos (prismaSemEscopo).
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { getUserModulos, hasModulo, requireModulo } from "@/lib/permissions";
import { carregarProcesso, podeEditar } from "@/lib/processos";
import { generateDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { naturezaSistema } from "@/lib/natureza-sistema";
import { contaDepositosJudiciais, garantirContaContabilNatureza } from "@/lib/conta-contabil";
import { apagarLancamentosContabeis, contaDaNatureza, contabilizarTituloReceber, registrarLancamento } from "@/lib/contabilidade";

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmtValor = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const CHAVE_DEPOSITO = "deposito-judicial";
export const CHAVE_LEVANTAMENTO = "levantamento-deposito-judicial";

// ── Contexto de permissão das rotas financeiras do processo ─────────────────────
/** Processo visível + acesso ao Financeiro (ver) + editar processos (editar). */
export async function contextoFinanceiroProcesso(id: string) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return { ok: false as const, res: auth.response };
  const p = await carregarProcesso(auth.session, id);
  if (!p) return { ok: false as const, res: NextResponse.json({ error: "Processo não encontrado." }, { status: 404 }) };
  const fin = await temFinanceiro(auth.session);
  return { ok: true as const, auth, p, fin, editar: fin && !!(await podeEditar(auth.session)) };
}
export async function temFinanceiro(session: { sub: string; perfil: string }) {
  return session.perfil === "ADMIN" || hasModulo(await getUserModulos(session.sub), "financeiro");
}

// Prazo ↔ título: src/lib/processos-prazo-titulo.ts (leve — importado pela baixa).
export { sincronizarPrazosDoTitulo, sincronizarPrazosDoTituloSeguro } from "@/lib/processos-prazo-titulo";

// ── Depósitos judiciais ────────────────────────────────────────────────────────
export const ehDeposito = (t: { naturezaFinanceira?: { sistemaChave?: string | null } | null }) => t.naturezaFinanceira?.sistemaChave === CHAVE_DEPOSITO;

/** Destino conta no saldo? Levantamento cujo título foi CANCELADO não conta. */
const destinoVale = (d: { tipo: string; contaReceber: { status: string } | null }) => !(d.tipo === "LEVANTADO" && d.contaReceber?.status === "CANCELADA");

export const SELECT_DESTINO = {
  id: true, tipo: true, valor: true, data: true, observacao: true, criadoPor: true, createdAt: true, contaPagarId: true,
  naturezaFinanceira: { select: { codigo: true, nome: true } },
  contaReceber: { select: { id: true, numero: true, status: true, valorPago: true } },
} satisfies Prisma.ProcessoDepositoDestinoSelect;

/** Depósitos (CPs de natureza deposito-judicial) de um processo com destinos e saldo. */
export async function depositosDoProcesso(processoId: string) {
  const cps = await prismaSemEscopo.contaPagar.findMany({
    where: { processoId, status: { not: "CANCELADA" }, naturezaFinanceira: { sistemaChave: CHAVE_DEPOSITO } },
    orderBy: { dataVencimento: "asc" },
    select: { id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true, status: true, dataPagamento: true, depositoDestinos: { orderBy: { data: "asc" }, select: SELECT_DESTINO } },
  });
  return cps.map((c) => {
    const destinado = r2(c.depositoDestinos.filter(destinoVale).reduce((s, d) => s + n(d.valor), 0));
    return { ...c, depositado: n(c.valorPago), destinado, saldo: r2(n(c.valorPago) - destinado) };
  });
}

export type ResumoFinanceiroProcesso = { jaPago: number; depositado: number; convertido: number; levantado: number };

/**
 * Por processo: já pago (caixa dos títulos a pagar ligados, exceto depósitos, + depósitos
 * convertidos em pagamento) e depositado em juízo (pago em depósitos − destinos). `ate`
 * (exclusivo) limita às baixas/destinos até a data-base.
 */
export async function resumoFinanceiroProcessos(processoIds: string[], ate?: Date): Promise<Map<string, ResumoFinanceiroProcesso>> {
  const out = new Map<string, ResumoFinanceiroProcesso>();
  if (!processoIds.length) return out;
  const get = (id: string) => out.get(id) ?? (out.set(id, { jaPago: 0, depositado: 0, convertido: 0, levantado: 0 }), out.get(id)!);
  const [caixa, destinos] = await Promise.all([
    prismaSemEscopo.lancamentoFinanceiro.findMany({
      where: { tipo: "DESPESA", contaPagar: { processoId: { in: processoIds }, status: { not: "CANCELADA" } }, ...(ate ? { dataLancamento: { lt: ate } } : {}) },
      select: { valor: true, contaPagar: { select: { processoId: true, naturezaFinanceira: { select: { sistemaChave: true } } } } },
    }),
    prismaSemEscopo.processoDepositoDestino.findMany({
      where: { processoId: { in: processoIds }, ...(ate ? { data: { lt: ate } } : {}) },
      select: { processoId: true, tipo: true, valor: true, contaReceber: { select: { status: true } } },
    }),
  ]);
  for (const l of caixa) {
    const r = get(l.contaPagar!.processoId!);
    if (ehDeposito(l.contaPagar!)) r.depositado += n(l.valor); else r.jaPago += n(l.valor);
  }
  for (const d of destinos.filter(destinoVale)) {
    const r = get(d.processoId);
    r.depositado -= n(d.valor);
    if (d.tipo === "CONVERTIDO") { r.convertido += n(d.valor); r.jaPago += n(d.valor); } else r.levantado += n(d.valor);
  }
  for (const r of Array.from(out.values())) { r.jaPago = r2(r.jaPago); r.depositado = r2(r.depositado); r.convertido = r2(r.convertido); r.levantado = r2(r.levantado); }
  return out;
}

export type ErroDestino = { erro: string; status: number };

/**
 * Registra o destino de (parte de) um depósito judicial:
 *  • LEVANTADO: cria o título a RECEBER (natureza travada de levantamento, ligado ao processo).
 *    O recebimento dele contabiliza D Banco / C Depósitos Judiciais (sem receita);
 *  • CONVERTIDO: lançamento D despesa (natureza escolhida) / C Depósitos Judiciais, origem
 *    PROCESSO_DEPOSITO + id do destino (excluir o destino apaga o lançamento).
 */
export async function registrarDestinoDeposito(input: {
  processo: { id: string; codigo: string; empresaId: string };
  contaPagarId: string; tipo: "LEVANTADO" | "CONVERTIDO"; valor: number; data: Date;
  naturezaFinanceiraId?: string | null; vencimento?: Date | null; observacao?: string | null; usuario: string;
}): Promise<{ id: string; contaReceber?: { id: string; numero: string } } | ErroDestino> {
  const { processo: proc } = input;
  const valor = r2(input.valor);
  if (!(valor > 0)) return { erro: "Informe o valor.", status: 400 };
  if (isNaN(+input.data)) return { erro: "Informe a data.", status: 400 };
  const dep = (await depositosDoProcesso(proc.id)).find((d) => d.id === input.contaPagarId);
  if (!dep) return { erro: "Depósito não encontrado neste processo.", status: 404 };
  if (valor > dep.saldo + 0.005) return { erro: `O valor passa do saldo do depósito (${fmtValor(dep.saldo)}).`, status: 422 };
  const ref = `${proc.codigo} (${dep.numero})`;

  if (input.tipo === "LEVANTADO") {
    const nat = await naturezaSistema(null, proc.empresaId, CHAVE_LEVANTAMENTO);
    if (!nat) return { erro: "A natureza travada de Levantamento de depósitos judiciais não existe nesta empresa.", status: 422 };
    const numero = generateDocNumber("CR", await proximaSequenciaDaEmpresa(proc.empresaId, "CR"));
    const r = await prismaSemEscopo.$transaction(async (tx) => {
      const cr = await tx.contaReceber.create({
        data: {
          empresaId: proc.empresaId, numero, descricao: `Levantamento de depósito judicial — ${ref}`,
          valorOriginal: valor, valorPago: 0, status: "ABERTA", dataVencimento: input.vencimento ?? input.data,
          dataCompetencia: input.data, dataEmissao: input.data, naturezaFinanceiraId: nat.id, processoId: proc.id,
          observacoes: input.observacao ?? null,
        },
        select: { id: true, numero: true },
      });
      const d = await tx.processoDepositoDestino.create({
        data: { empresaId: proc.empresaId, processoId: proc.id, contaPagarId: dep.id, tipo: "LEVANTADO", valor, data: input.data, contaReceberId: cr.id, observacao: input.observacao ?? null, criadoPor: input.usuario },
        select: { id: true },
      });
      await tx.processoAndamento.create({ data: { processoId: proc.id, data: input.data, tipo: "PAGAMENTO", usuario: input.usuario, descricao: `Levantamento de ${fmtValor(valor)} do depósito ${dep.numero} — a receber ${cr.numero}.` } });
      return { id: d.id, contaReceber: cr };
    });
    // Sem perna VENDA (levantamento): só garante idempotência/rastreio pós-commit.
    await contabilizarTituloReceber(r.contaReceber.id).catch((e) => console.error("[processos-pagamento] contabilizar levantamento:", e));
    return r;
  }

  // CONVERTIDO
  const natId = input.naturezaFinanceiraId ?? "";
  const nat = await prismaSemEscopo.naturezaFinanceira.findFirst({
    where: { id: natId, empresaId: proc.empresaId }, select: { id: true, nome: true, codigo: true, tipo: true, ativo: true, afetaResultado: true, sistemaChave: true },
  });
  if (!nat) return { erro: "Escolha a natureza da despesa (multa, condenação, custas…).", status: 400 };
  if (!nat.ativo || nat.tipo === "ENTRADA" || !nat.afetaResultado || nat.sistemaChave === CHAVE_DEPOSITO) {
    return { erro: "A natureza da conversão precisa ser uma despesa ativa (que afeta o resultado).", status: 422 };
  }
  const [contaDesp, contaDep] = await Promise.all([
    (async () => (await contaDaNatureza(proc.empresaId, nat.id)) ?? (await garantirContaContabilNatureza(nat.id)))(),
    contaDepositosJudiciais(proc.empresaId),
  ]);
  if (!contaDesp || !contaDep) return { erro: "Plano de contas incompleto (conta da natureza ou Depósitos Judiciais).", status: 422 };
  try {
    return await prismaSemEscopo.$transaction(async (tx) => {
      const d = await tx.processoDepositoDestino.create({
        data: { empresaId: proc.empresaId, processoId: proc.id, contaPagarId: dep.id, tipo: "CONVERTIDO", valor, data: input.data, naturezaFinanceiraId: nat.id, observacao: input.observacao ?? null, criadoPor: input.usuario },
        select: { id: true },
      });
      await registrarLancamento({
        empresaId: proc.empresaId, data: input.data, origemTipo: "PROCESSO_DEPOSITO", origemId: d.id, criadoPor: input.usuario,
        historico: `Depósito judicial convertido em pagamento — ${ref} · ${nat.codigo ? `${nat.codigo} ` : ""}${nat.nome}`,
        partidas: [
          { contaId: contaDesp.id, tipo: "DEBITO", valor, naturezaId: nat.id },
          { contaId: contaDep.id, tipo: "CREDITO", valor },
        ],
      }, tx);
      await tx.processoAndamento.create({ data: { processoId: proc.id, data: input.data, tipo: "PAGAMENTO", usuario: input.usuario, descricao: `Depósito ${dep.numero}: ${fmtValor(valor)} convertido em pagamento (${nat.nome}).` } });
      return { id: d.id };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { erro: /exerc[ií]cio|fechad/i.test(msg) ? msg : `Não foi possível registrar: ${msg}`, status: 422 };
  }
}

/** Desfaz um destino: conversão apaga o lançamento; levantamento exclui o título a receber (só se ainda não recebido). */
export async function excluirDestinoDeposito(processoId: string, destinoId: string): Promise<{ ok: true } | ErroDestino> {
  const d = await prismaSemEscopo.processoDepositoDestino.findFirst({
    where: { id: destinoId, processoId }, select: { id: true, empresaId: true, tipo: true, contaReceber: { select: { id: true, numero: true, status: true, valorPago: true } } },
  });
  if (!d) return { erro: "Destino não encontrado.", status: 404 };
  const cr = d.contaReceber;
  if (cr && cr.status !== "CANCELADA" && (cr.status !== "ABERTA" || n(cr.valorPago) > 0)) {
    return { erro: `O ${cr.numero} já teve recebimento — estorne o recebimento no Contas a Receber antes.`, status: 409 };
  }
  try {
    await prismaSemEscopo.$transaction(async (tx) => {
      if (d.tipo === "CONVERTIDO") await apagarLancamentosContabeis({ empresaId: d.empresaId, origemTipo: "PROCESSO_DEPOSITO", origemId: d.id }, tx);
      await tx.processoDepositoDestino.delete({ where: { id: d.id } });
      if (cr && cr.status !== "CANCELADA") {
        await apagarLancamentosContabeis({ empresaId: d.empresaId, origemTipo: { in: ["VENDA", "RECEBIMENTO"] }, origemId: cr.id }, tx);
        await tx.contaReceber.delete({ where: { id: cr.id } });
      }
    });
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro ao desfazer.", status: 422 };
  }
  return { ok: true };
}
