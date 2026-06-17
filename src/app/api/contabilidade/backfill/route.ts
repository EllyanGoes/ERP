export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";
import {
  registrarLancamento, contaDoCliente, contaDoFornecedor, contaPorCodigo,
} from "@/lib/contabilidade";

// POST /api/contabilidade/backfill
// Gera (idempotente) os lançamentos contábeis retroativos a partir dos títulos
// já existentes — contas a receber (venda + recebimento) e a pagar (compra +
// pagamento). Cada empresa usa seu próprio plano de contas.
export async function POST() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  let lancamentos = 0;
  let pulados = 0;
  const erros: string[] = [];

  // Cache das contas de resultado/caixa por empresa.
  const cacheCodigo = new Map<string, string | null>();
  async function codigo(empresaId: string, cod: string): Promise<string | null> {
    const k = `${empresaId}:${cod}`;
    if (!cacheCodigo.has(k)) cacheCodigo.set(k, (await contaPorCodigo(empresaId, cod))?.id ?? null);
    return cacheCodigo.get(k)!;
  }

  // ── Contas a receber → VENDA + RECEBIMENTO ──────────────────────────────────
  const crs = await prismaSemEscopo.contaReceber.findMany({
    where: { status: { not: "CANCELADA" } },
    select: { id: true, empresaId: true, clienteId: true, numero: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true },
  });
  for (const cr of crs) {
    try {
      const contaCli = await contaDoCliente(cr.empresaId, cr.clienteId);
      const contaReceita = await codigo(cr.empresaId, "3.1");
      if (!contaCli || !contaReceita) { pulados++; continue; }
      const valor = decimalToNumber(cr.valorOriginal);
      if (valor > 0) {
        await registrarLancamento({
          empresaId: cr.empresaId, data: cr.dataCompetencia ?? cr.createdAt,
          historico: `Venda — título ${cr.numero}`, origemTipo: "VENDA", origemId: cr.id,
          partidas: [
            { contaId: contaCli.id, tipo: "DEBITO", valor, clienteId: cr.clienteId },
            { contaId: contaReceita, tipo: "CREDITO", valor },
          ],
        });
        lancamentos++;
      }
      const pago = decimalToNumber(cr.valorPago);
      const contaCaixa = await codigo(cr.empresaId, "1.1.1");
      if (pago > 0 && contaCaixa) {
        await registrarLancamento({
          empresaId: cr.empresaId, data: cr.dataPagamento ?? cr.createdAt,
          historico: `Recebimento — título ${cr.numero}`, origemTipo: "RECEBIMENTO", origemId: cr.id,
          partidas: [
            { contaId: contaCaixa, tipo: "DEBITO", valor: pago },
            { contaId: contaCli.id, tipo: "CREDITO", valor: pago, clienteId: cr.clienteId },
          ],
        });
        lancamentos++;
      }
    } catch (e) { erros.push(`CR ${cr.numero}: ${(e as Error).message}`); }
  }

  // ── Contas a pagar → COMPRA + PAGAMENTO (só com fornecedor) ─────────────────
  const cps = await prismaSemEscopo.contaPagar.findMany({
    where: { status: { not: "CANCELADA" }, fornecedorId: { not: null } },
    select: { id: true, empresaId: true, fornecedorId: true, numero: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true },
  });
  for (const cp of cps) {
    if (!cp.fornecedorId) { pulados++; continue; }
    try {
      const contaForn = await contaDoFornecedor(cp.empresaId, cp.fornecedorId);
      const contaDespesa = await codigo(cp.empresaId, "3.3");
      if (!contaForn || !contaDespesa) { pulados++; continue; }
      const valor = decimalToNumber(cp.valorOriginal);
      if (valor > 0) {
        await registrarLancamento({
          empresaId: cp.empresaId, data: cp.dataCompetencia ?? cp.createdAt,
          historico: `Compra — título ${cp.numero}`, origemTipo: "COMPRA", origemId: cp.id,
          partidas: [
            { contaId: contaDespesa, tipo: "DEBITO", valor },
            { contaId: contaForn.id, tipo: "CREDITO", valor, fornecedorId: cp.fornecedorId },
          ],
        });
        lancamentos++;
      }
      const pago = decimalToNumber(cp.valorPago);
      const contaCaixa = await codigo(cp.empresaId, "1.1.1");
      if (pago > 0 && contaCaixa) {
        await registrarLancamento({
          empresaId: cp.empresaId, data: cp.dataPagamento ?? cp.createdAt,
          historico: `Pagamento — título ${cp.numero}`, origemTipo: "PAGAMENTO", origemId: cp.id,
          partidas: [
            { contaId: contaForn.id, tipo: "DEBITO", valor: pago, fornecedorId: cp.fornecedorId },
            { contaId: contaCaixa, tipo: "CREDITO", valor: pago },
          ],
        });
        lancamentos++;
      }
    } catch (e) { erros.push(`CP ${cp.numero}: ${(e as Error).message}`); }
  }

  return NextResponse.json({ ok: true, lancamentos, pulados, erros: erros.slice(0, 20) });
}
