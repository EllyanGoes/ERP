export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";
import { executarExclusaoColaborador, ENTIDADE_COLABORADOR, LINK_APROVACOES_EXCLUSAO } from "@/lib/exclusao-colaborador";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";

// POST /api/aprovacoes/exclusoes/[id]  { acao: "aprovar" | "reprovar", observacao? }
// Só o aprovador da solicitação decide. Aprovar executa a exclusão (com snapshot).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { acao, observacao } = await req.json().catch(() => ({}));
  if (acao !== "aprovar" && acao !== "reprovar") return NextResponse.json({ error: "Ação inválida" }, { status: 400 });

  const sol = await prismaSemEscopo.solicitacaoExclusao.findUnique({ where: { id: params.id } });
  if (!sol) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (sol.aprovadorId !== auth.session.sub) return NextResponse.json({ error: "Você não é o aprovador desta solicitação" }, { status: 403 });
  if (sol.status !== "PENDENTE") return NextResponse.json({ error: "Solicitação já decidida" }, { status: 409 });

  const obs = typeof observacao === "string" && observacao.trim() ? observacao.trim() : null;
  let snapshot: Prisma.InputJsonValue | undefined;
  if (acao === "aprovar" && sol.entidade === ENTIDADE_COLABORADOR) {
    const r = await executarExclusaoColaborador(sol.registroId);
    if (!r.ok && r.status !== 404) return NextResponse.json({ error: r.error }, { status: r.status });
    if (r.ok) snapshot = r.snapshot as Prisma.InputJsonValue;
  }
  await prismaSemEscopo.solicitacaoExclusao.update({
    where: { id: sol.id },
    data: { status: acao === "aprovar" ? "APROVADO" : "REPROVADO", observacao: obs, respondidoEm: new Date(), ...(snapshot ? { snapshot } : {}) },
  });
  await marcarNotificacoesLidasPorLink(auth.session.sub, LINK_APROVACOES_EXCLUSAO, "EXCLUSAO_COLABORADOR_SOLICITADA");
  if (sol.solicitadoPor) {
    await notificarUsuario({
      usuarioId: sol.solicitadoPor, tipo: acao === "aprovar" ? "EXCLUSAO_COLABORADOR_APROVADA" : "EXCLUSAO_COLABORADOR_REPROVADA",
      titulo: acao === "aprovar" ? "Exclusão aprovada" : "Exclusão reprovada",
      mensagem: `${sol.descricao}: ${acao === "aprovar" ? "excluído" : "mantido no cadastro"}${obs ? ` — ${obs}` : ""}.`,
      link: acao === "aprovar" ? "/empresa/colaboradores" : `/empresa/colaboradores/${sol.registroId}`,
    });
  }
  return NextResponse.json({ ok: true });
}
