export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, propagarDependencias } from "@/lib/projetos";

async function contexto(session: { sub: string; perfil: "ADMIN" | "USUARIO" }, tarefaId: string) {
  const tarefa = await prismaSemEscopo.tarefa.findUnique({ where: { id: tarefaId }, select: { id: true, projetoId: true, titulo: true } });
  if (!tarefa) return null;
  const acesso = await nivelNoProjeto(session, tarefa.projetoId);
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return null;
  return { tarefa, acesso };
}

// Há caminho de `de` até `ate` pelas dependências? (evita ciclo A→B→A)
async function alcanca(de: string, ate: string, visitados = new Set<string>()): Promise<boolean> {
  if (de === ate) return true;
  if (visitados.has(de)) return false;
  visitados.add(de);
  const proximas = await prismaSemEscopo.tarefaDependencia.findMany({ where: { dependeDeId: de }, select: { tarefaId: true } });
  for (const p of proximas) if (await alcanca(p.tarefaId, ate, visitados)) return true;
  return false;
}

// POST /api/projetos/tarefas/[tarefaId]/dependencias { dependeDeId } — a tarefa
// passa a depender de outra do mesmo projeto.
export async function POST(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const ctx = await contexto(auth.session, params.tarefaId);
  if (!ctx) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const dependeDeId = String(body.dependeDeId ?? "");
  if (!dependeDeId || dependeDeId === params.tarefaId) return NextResponse.json({ error: "Dependência inválida." }, { status: 400 });
  const outra = await prismaSemEscopo.tarefa.findFirst({ where: { id: dependeDeId, projetoId: ctx.tarefa.projetoId }, select: { id: true, titulo: true } });
  if (!outra) return NextResponse.json({ error: "A outra tarefa precisa ser do mesmo projeto." }, { status: 400 });
  if (await alcanca(params.tarefaId, dependeDeId)) {
    return NextResponse.json({ error: "Isso criaria um ciclo de dependências." }, { status: 400 });
  }

  await prismaSemEscopo.tarefaDependencia.upsert({
    where: { tarefaId_dependeDeId: { tarefaId: params.tarefaId, dependeDeId } },
    create: { projetoId: ctx.tarefa.projetoId, tarefaId: params.tarefaId, dependeDeId },
    update: {},
  });
  await registrarAtividade({ projetoId: ctx.tarefa.projetoId, tarefaId: params.tarefaId, autorId: auth.session.sub, tipo: "DEPENDENCIA", detalhe: { dependeDe: outra.titulo } });
  // Já aplica a regra: a dependente não pode começar antes do fim da predecessora.
  await propagarDependencias(dependeDeId, null);
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/projetos/tarefas/[tarefaId]/dependencias?dependeDeId=
export async function DELETE(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const ctx = await contexto(auth.session, params.tarefaId);
  if (!ctx) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  const dependeDeId = new URL(req.url).searchParams.get("dependeDeId") ?? "";
  await prismaSemEscopo.tarefaDependencia.deleteMany({ where: { tarefaId: params.tarefaId, dependeDeId } });
  return NextResponse.json({ ok: true });
}
