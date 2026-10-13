export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, ORDEM_GAP } from "@/lib/projetos";

// POST { projetoId } — cria a tarefa de adequação no projeto (1ª coluna) e
// guarda o vínculo. Concluir a tarefa NÃO muda o status da máquina: quem muda
// é o técnico, com evidência (executar ≠ comprovar).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const m = await prisma.sstMaquina.findUnique({ where: { id: params.id }, select: { id: true, nome: true, local: true, tarefaId: true, protecoes: { where: { conforme: false }, select: { descricao: true } } } });
  if (!m) return NextResponse.json({ error: "Máquina não encontrada" }, { status: 404 });
  if (m.tarefaId) return NextResponse.json({ error: "A máquina já tem tarefa vinculada." }, { status: 400 });
  const acesso = await nivelNoProjeto(auth.session, String(b.projetoId ?? ""));
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem acesso a esse projeto." }, { status: 403 });
  const coluna = await prismaSemEscopo.projetoColuna.findFirst({ where: { projetoId: acesso.projeto.id, arquivada: false }, orderBy: { ordem: "asc" }, select: { id: true } });
  if (!coluna) return NextResponse.json({ error: "Projeto sem colunas." }, { status: 400 });
  const ultima = await prismaSemEscopo.tarefa.findFirst({ where: { colunaId: coluna.id, arquivada: false }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const descricao = [`Adequação NR-12 — ${m.nome}${m.local ? ` (${m.local})` : ""}.`, m.protecoes.length ? `Proteções pendentes:\n${m.protecoes.map((p) => `• ${p.descricao}`).join("\n")}` : "", `Ficha da máquina: /sst/maquinas/${m.id}`].filter(Boolean).join("\n\n");
  const tarefa = await prismaSemEscopo.tarefa.create({
    data: { projetoId: acesso.projeto.id, colunaId: coluna.id, titulo: `NR-12: ${m.nome}`, descricao, ordem: (ultima?.ordem ?? 0) + ORDEM_GAP, criadoPor: auth.session.nome },
    select: { id: true, titulo: true },
  });
  await registrarAtividade({ projetoId: acesso.projeto.id, tarefaId: tarefa.id, autorId: auth.session.sub, tipo: "CRIOU" });
  await prisma.sstMaquina.update({ where: { id: m.id }, data: { tarefaId: tarefa.id, status: "EM_ADEQUACAO" } });
  return NextResponse.json({ data: { tarefaId: tarefa.id, projetoId: acesso.projeto.id } }, { status: 201 });
}
