export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTituloReceber, contabilizarTituloPagar, contabilizarEntradaEstoque, contabilizarCmvMinuta, contabilizarReceitaMinuta, contabilizarVendaPedido, contabilizarSaldoInicialEstoque } from "@/lib/contabilidade";

// POST /api/contabilidade/backfill
// Gera (idempotente) os lançamentos contábeis retroativos a partir dos títulos
// já existentes — contas a receber (venda + recebimento) e a pagar (compra +
// pagamento). Reusa os mesmos helpers dos hooks ao vivo.
export async function POST() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  let processados = 0;
  const erros: string[] = [];

  // 0) Saldo de abertura de estoque por empresa (D Estoque / C Saldos de Abertura)
  //    — antes das saídas, para o estoque contábil não ficar negativo.
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true } });
  for (const e of empresas) {
    try { await contabilizarSaldoInicialEstoque(e.id); processados++; }
    catch (err) { erros.push(`Abertura estoque ${e.id}: ${(err as Error).message}`); }
  }

  // 1) Entradas de estoque (conferências concluídas) — ANTES das CPs, para o
  //    fornecedor já estar creditado (a CP de estoque pula a perna COMPRA).
  const confs = await prismaSemEscopo.conferenciaCompra.findMany({
    where: { status: "CONCLUIDA" },
    select: { id: true, numero: true },
  });
  for (const c of confs) {
    try { await contabilizarEntradaEstoque(c.id); processados++; }
    catch (e) { erros.push(`Conf ${c.numero}: ${(e as Error).message}`); }
  }

  // Venda pelo PEDIDO (D Clientes / C Material a Entregar) — todo pedido
  // confirmado/em agendamento/concluído, faturado ou não.
  const pedidos = await prismaSemEscopo.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] }, intragrupo: false },
    select: { id: true, numero: true },
  });
  for (const p of pedidos) {
    try { await contabilizarVendaPedido(p.id); processados++; }
    catch (e) { erros.push(`Pedido ${p.numero}: ${(e as Error).message}`); }
  }

  const crs = await prismaSemEscopo.contaReceber.findMany({
    where: { status: { not: "CANCELADA" } },
    select: { id: true, numero: true },
  });
  for (const cr of crs) {
    try { await contabilizarTituloReceber(cr.id); processados++; }
    catch (e) { erros.push(`CR ${cr.numero}: ${(e as Error).message}`); }
  }

  const cps = await prismaSemEscopo.contaPagar.findMany({
    where: { status: { not: "CANCELADA" }, fornecedorId: { not: null } },
    select: { id: true, numero: true },
  });
  for (const cp of cps) {
    try { await contabilizarTituloPagar(cp.id); processados++; }
    catch (e) { erros.push(`CP ${cp.numero}: ${(e as Error).message}`); }
  }

  // 2) CMV das vendas (minutas com saída de estoque).
  const minutas = await prismaSemEscopo.minuta.findMany({
    where: { status: { in: ["SAIU_PARA_ENTREGA", "ENTREGUE"] } },
    select: { id: true, numero: true },
  });
  for (const m of minutas) {
    try { await contabilizarCmvMinuta(m.id); processados++; }
    catch (e) { erros.push(`Minuta ${m.numero}: ${(e as Error).message}`); }
    // Receita na entrega (Material a Entregar → Receita) — só ENTREGUE (guard interno).
    try { await contabilizarReceitaMinuta(m.id); }
    catch (e) { erros.push(`Receita minuta ${m.numero}: ${(e as Error).message}`); }
  }

  return NextResponse.json({ ok: true, processados, erros: erros.slice(0, 20) });
}
