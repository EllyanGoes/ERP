export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";

// GET /api/aprovacoes/exclusoes?status=PENDENTE — pedidos de exclusão do aprovador logado.
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const status = new URL(req.url).searchParams.get("status") ?? "PENDENTE";
  const where = { aprovadorId: auth.session.sub, ...(["PENDENTE", "APROVADO", "REPROVADO"].includes(status) ? { status: status as "PENDENTE" | "APROVADO" | "REPROVADO" } : {}) };
  const [data, pendingCount] = await Promise.all([
    prismaSemEscopo.solicitacaoExclusao.findMany({
      where, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, entidade: true, registroId: true, descricao: true, motivo: true, status: true, solicitadoPorNome: true, observacao: true, respondidoEm: true, createdAt: true },
    }),
    prismaSemEscopo.solicitacaoExclusao.count({ where: { aprovadorId: auth.session.sub, status: "PENDENTE" } }),
  ]);
  return NextResponse.json({ data, pendingCount });
}
