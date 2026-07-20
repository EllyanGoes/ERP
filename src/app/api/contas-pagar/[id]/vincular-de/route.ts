export const dynamic = "force-dynamic";
// Vincula (ou desvincula) um Contas a Pagar MANUAL a um Documento de Entrada —
// espelho do fluxo DE→PC. O ajuste essencial é CONTÁBIL: um CP manual provisiona
// (D natureza · C Fornecedor); a entrada do DE também credita o Fornecedor
// (D Estoque · C Fornecedor). Ao vincular, o título vira `semProvisao=true`
// (a provisão passa a ser a entrada) e é recontabilizado — sem isso o
// fornecedor seria creditado em dobro. Desvincular reverte.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recontabilizarTituloPagar } from "@/lib/contabilidade";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const conferenciaId: string | null = body.conferenciaId ?? null;

  const cp = await prisma.contaPagar.findUnique({
    where: { id: params.id },
    select: {
      id: true, empresaId: true, status: true, fornecedorId: true,
      pedidoCompraId: true, conferenciaId: true, folhaId: true, compensacaoOrigemId: true,
    },
  });
  if (!cp) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  if (cp.status === "CANCELADA") {
    return NextResponse.json({ error: "Título cancelado não pode ser vinculado." }, { status: 422 });
  }
  if (cp.pedidoCompraId) {
    return NextResponse.json({ error: "Título de pedido de compra já está vinculado ao processo — o vínculo com o DE vem do pedido." }, { status: 422 });
  }
  if (cp.folhaId || cp.compensacaoOrigemId) {
    return NextResponse.json({ error: "Título de folha/encontro de contas não aceita vínculo com Documento de Entrada." }, { status: 422 });
  }

  // ── Desvincular ────────────────────────────────────────────────────────────
  if (!conferenciaId) {
    if (!cp.conferenciaId) {
      return NextResponse.json({ error: "Título não está vinculado a um Documento de Entrada." }, { status: 422 });
    }
    await prisma.contaPagar.update({
      where: { id: cp.id },
      // Volta a ser título manual: reprovisiona (a entrada do DE deixa de ser a provisão dele).
      data: { conferenciaId: null, semProvisao: false },
    });
    await recontabilizarTituloPagar(cp.id).catch((e) => console.error("[vincular-de] recontabilizar:", e));
    return NextResponse.json({ ok: true, vinculado: null });
  }

  // ── Vincular ───────────────────────────────────────────────────────────────
  const de = await prisma.conferenciaCompra.findUnique({
    where: { id: conferenciaId },
    select: {
      id: true, numero: true, empresaId: true, status: true, fornecedorId: true,
      pedido: { select: { fornecedorId: true, contasPagar: { select: { id: true } } } },
      contasPagar: { select: { id: true } },
    },
  });
  if (!de) return NextResponse.json({ error: "Documento de Entrada não encontrado" }, { status: 404 });
  if (de.empresaId !== cp.empresaId) {
    return NextResponse.json({ error: "O Documento de Entrada pertence a outra empresa." }, { status: 422 });
  }
  const outrosCps = de.contasPagar.filter((t) => t.id !== cp.id);
  if (outrosCps.length > 0 || (de.pedido?.contasPagar.length ?? 0) > 0) {
    return NextResponse.json({ error: `O ${de.numero} já tem título de contas a pagar vinculado.` }, { status: 422 });
  }
  const fornecedorDE = de.fornecedorId ?? de.pedido?.fornecedorId ?? null;
  if (cp.fornecedorId && fornecedorDE && cp.fornecedorId !== fornecedorDE) {
    return NextResponse.json({ error: "O fornecedor do título é diferente do fornecedor do Documento de Entrada." }, { status: 422 });
  }

  await prisma.contaPagar.update({
    where: { id: cp.id },
    // A provisão contábil passa a ser a entrada de estoque do DE — o título
    // deixa de reprovisionar (mesmo comportamento do CP nascido de DE avulsa).
    data: { conferenciaId: de.id, semProvisao: true },
  });
  await recontabilizarTituloPagar(cp.id).catch((e) => console.error("[vincular-de] recontabilizar:", e));
  return NextResponse.json({ ok: true, vinculado: de.numero });
}
