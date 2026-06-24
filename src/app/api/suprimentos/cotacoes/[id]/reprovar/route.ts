export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizarMensagemAprovacaoCotacao } from "@/lib/aprovacao-cotacao";
import { notificarUsuario } from "@/lib/notificacoes";

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

    const pendencia = await prisma.aprovacaoSC.findFirst({
      where: { cotacaoId: params.id, status: "PENDENTE" },
      select: { id: true, solicitadoPor: true, aprovador: { select: { nome: true } } },
    });
    const cot = await prisma.cotacaoCompra.findUnique({ where: { id: params.id }, select: { nome: true, numero: true } });

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

    // Atualiza a mensagem do aprovador (reprovada, sem botões) — best-effort.
    if (pendencia) {
      await finalizarMensagemAprovacaoCotacao(pendencia.id, "REPROVADO", pendencia.aprovador?.nome ?? "Aprovador");
    }

    // Notificação in-app (toast) para o solicitante: cotação reprovada.
    if (pendencia?.solicitadoPor) {
      const ref = cot?.nome || cot?.numero || "";
      await notificarUsuario({
        usuarioId: pendencia.solicitadoPor,
        tipo: "COTACAO_REPROVADA",
        titulo: "Cotação reprovada",
        mensagem: `Sua cotação ${ref} foi reprovada${motivo ? `: ${motivo}` : "."}`,
        link: `/suprimentos/cotacoes/${params.id}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
