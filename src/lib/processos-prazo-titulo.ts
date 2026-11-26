// Prazo de processo ↔ título a pagar (docs/processos-prd.md §8.3). Módulo LEVE de propósito:
// é importado pelo núcleo da baixa (src/lib/baixa-titulo.ts) e pelo estorno — não puxa
// contabilidade/permissões.
import type { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmtValor = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

type DbSync = Pick<Prisma.TransactionClient, "processoPrazo" | "processoAndamento" | "contaPagar" | "lancamentoFinanceiro">;

/**
 * Sincroniza os prazos ligados ao título com o status dele. Título PAGA → prazos PENDENTES viram
 * CUMPRIDOS (cumpridoPorPagamento) com andamento "Pagamento de R$ X em DD/MM (CP-xxxx)". Título
 * que deixou de estar PAGA (estorno) → reabre só os prazos que a quitação cumpriu.
 * Barato quando não há prazo ligado (1 consulta indexada) — por isso roda dentro da transação da
 * baixa/estorno. Idempotente.
 */
export async function sincronizarPrazosDoTitulo(db: DbSync, contaPagarId: string): Promise<number> {
  const prazos = await db.processoPrazo.findMany({
    where: { contaPagarId }, select: { id: true, processoId: true, status: true, cumpridoPorPagamento: true, descricao: true },
  });
  if (!prazos.length) return 0;
  const cp = await db.contaPagar.findUnique({ where: { id: contaPagarId }, select: { numero: true, status: true, valorPago: true, dataPagamento: true } });
  if (!cp) return 0;
  let mexeu = 0;
  if (cp.status === "PAGA") {
    const pendentes = prazos.filter((p) => p.status === "PENDENTE");
    if (!pendentes.length) return 0;
    const caixa = await db.lancamentoFinanceiro.findMany({ where: { contaPagarId, tipo: "DESPESA" }, select: { valor: true } });
    const total = caixa.length ? r2(caixa.reduce((s, l) => s + n(l.valor), 0)) : n(cp.valorPago);
    const quando = cp.dataPagamento ?? new Date();
    for (const p of pendentes) {
      await db.processoPrazo.update({ where: { id: p.id }, data: { status: "CUMPRIDO", cumpridoEm: quando, cumpridoPorPagamento: true, motivo: `Quitado pelo ${cp.numero}` } });
      await db.processoAndamento.create({
        data: { processoId: p.processoId, data: quando, tipo: "PAGAMENTO", usuario: "Sistema", descricao: `Pagamento de ${fmtValor(total)} em ${fmtDia(quando)} (${cp.numero}) — prazo “${p.descricao}” cumprido automaticamente.` },
      });
      mexeu++;
    }
  } else {
    const reabrir = prazos.filter((p) => p.status === "CUMPRIDO" && p.cumpridoPorPagamento);
    for (const p of reabrir) {
      await db.processoPrazo.update({ where: { id: p.id }, data: { status: "PENDENTE", cumpridoEm: null, cumpridoPorPagamento: false, motivo: null } });
      await db.processoAndamento.create({
        data: { processoId: p.processoId, data: new Date(new Date().toISOString().slice(0, 10)), tipo: "PAGAMENTO", usuario: "Sistema", descricao: `Pagamento do ${cp.numero} estornado — prazo “${p.descricao}” reaberto.` },
      });
      mexeu++;
    }
  }
  return mexeu;
}

/** Versão pós-commit, best-effort (nunca quebra o chamador). */
export async function sincronizarPrazosDoTituloSeguro(contaPagarIds: string[]) {
  for (const id of contaPagarIds) {
    await sincronizarPrazosDoTitulo(prismaSemEscopo, id).catch((e) => console.error("[processos-pagamento] sincronizar prazos do título", id, e));
  }
}

