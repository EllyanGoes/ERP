export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarPedidoDeCotacao, finalizarMensagemAprovacaoCotacao } from "@/lib/aprovacao-cotacao";

// POST /api/suprimentos/cotacoes/[id]/aprovar
// Aprova a cotação e gera o Pedido de Compras (uma única aprovação). Quem pode:
// ADMIN, ou o aprovador configurado para PEDIDO_COMPRAS (a aprovação pendente
// desta cotação). Canal direto (in-app) — o canal remoto é o /aprovacoes.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const cfIdParam = body.cfId as string | undefined;

    // Gate: ADMIN sempre; senão, precisa ser o aprovador da pendência da cotação.
    if (session.perfil !== "ADMIN") {
      const pend = await prisma.aprovacaoSC.findFirst({
        where: { cotacaoId: params.id, status: "PENDENTE" },
        select: { aprovadorId: true },
      });
      if (!pend || pend.aprovadorId !== session.sub) {
        return NextResponse.json({ error: "Você não tem permissão para aprovar esta cotação" }, { status: 403 });
      }
    }

    // Pendência (para editar a mensagem do Telegram do aprovador após aprovar).
    const pendencia = await prisma.aprovacaoSC.findFirst({
      where: { cotacaoId: params.id, status: "PENDENTE" },
      select: { id: true, aprovador: { select: { nome: true } } },
    });

    const result = await prisma.$transaction(async (tx) => {
      const out = await gerarPedidoDeCotacao(tx, params.id, cfIdParam);
      // Marca como respondidas as pendências de aprovação desta cotação.
      await tx.aprovacaoSC.updateMany({
        where: { cotacaoId: params.id, status: "PENDENTE" },
        data: { status: "APROVADO", respondidoEm: new Date() },
      });
      return out;
    });

    // Atualiza a mensagem do aprovador (novo status, sem botões) — best-effort.
    if (pendencia) {
      await finalizarMensagemAprovacaoCotacao(
        pendencia.id, "APROVADO", pendencia.aprovador?.nome ?? "Aprovador", result.pedidoCompra.numero,
      );
    }

    return NextResponse.json({ data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
