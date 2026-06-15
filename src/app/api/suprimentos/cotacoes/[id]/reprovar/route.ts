export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/suprimentos/cotacoes/[id]/reprovar
// O gerente reprova a cotação: volta para EM_ANALISE (o comprador revê) com o
// motivo. Quem pode: ADMIN, ou o aprovador configurado da pendência.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const motivo: string | undefined = body.motivo?.trim() || undefined;

    if (session.perfil !== "ADMIN") {
      const pend = await prisma.aprovacaoSC.findFirst({
        where: { cotacaoId: params.id, status: "PENDENTE" },
        select: { aprovadorId: true },
      });
      if (!pend || pend.aprovadorId !== session.sub) {
        return NextResponse.json({ error: "Você não tem permissão para reprovar esta cotação" }, { status: 403 });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.cotacaoCompra.update({
        where: { id: params.id },
        data: { status: "EM_ANALISE", motivoReprovacao: motivo ?? null },
      });
      await tx.aprovacaoSC.updateMany({
        where: { cotacaoId: params.id, status: "PENDENTE" },
        data: { status: "REPROVADO", observacao: motivo ?? null, respondidoEm: new Date() },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
