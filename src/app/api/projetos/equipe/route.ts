export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";

// GET /api/projetos/equipe[?projetoId=] — carga da equipe: cada pessoa (dono ou
// membro) dos projetos ATIVOS em que o usuário participa, com as tarefas abertas
// dela NESSES projetos. A classificação (sem tarefas / sem tarefa hoje /
// ocupado) é feita na tela, pela data local.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const userId = auth.session.sub;
  const projetoId = new URL(req.url).searchParams.get("projetoId") || undefined;

  const projetos = await prismaSemEscopo.projeto.findMany({
    where: {
      status: "ATIVO",
      OR: [{ donoId: userId }, { membros: { some: { usuarioId: userId } } }],
      ...(projetoId ? { id: projetoId } : {}),
    },
    select: {
      id: true, nome: true, cor: true,
      dono: { select: { id: true, nome: true, convidado: true, ativo: true } },
      membros: { select: { usuario: { select: { id: true, nome: true, convidado: true, ativo: true } } } },
    },
    orderBy: { nome: "asc" },
  });
  const ids = projetos.map((p) => p.id);

  const pessoas = new Map<string, { id: string; nome: string; convidado: boolean; projetos: string[] }>();
  for (const p of projetos) {
    for (const u of [p.dono, ...p.membros.map((m) => m.usuario)]) {
      if (!u.ativo) continue;
      const atual = pessoas.get(u.id) ?? { id: u.id, nome: u.nome, convidado: u.convidado, projetos: [] };
      if (!atual.projetos.includes(p.id)) atual.projetos.push(p.id);
      pessoas.set(u.id, atual);
    }
  }

  const tarefas = ids.length ? await prismaSemEscopo.tarefa.findMany({
    where: { projetoId: { in: ids }, arquivada: false, concluidaEm: null, coluna: { concluiTarefa: false } },
    select: {
      id: true, titulo: true, prioridade: true, dataInicio: true, prazo: true, prazoHora: true, projetoId: true,
      coluna: { select: { nome: true, categoria: true } },
      membros: { select: { usuarioId: true } },
    },
  }) : [];

  // Responsável que não é membro do projeto (ex.: saiu do quadro) também entra.
  const faltam = Array.from(new Set(tarefas.flatMap((t) => t.membros.map((m) => m.usuarioId)).filter((id) => !pessoas.has(id))));
  if (faltam.length) {
    const extras = await prismaSemEscopo.usuario.findMany({ where: { id: { in: faltam }, ativo: true }, select: { id: true, nome: true, convidado: true } });
    for (const u of extras) pessoas.set(u.id, { ...u, projetos: [] });
  }

  const porPessoa = new Map<string, typeof tarefas>();
  for (const t of tarefas) for (const m of t.membros) {
    if (!pessoas.has(m.usuarioId)) continue;
    porPessoa.set(m.usuarioId, [...(porPessoa.get(m.usuarioId) ?? []), t]);
  }

  return NextResponse.json({
    data: {
      projetos: projetos.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor })),
      pessoas: Array.from(pessoas.values()).sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => ({
        ...p,
        tarefas: (porPessoa.get(p.id) ?? []).map((t) => ({ id: t.id, titulo: t.titulo, prioridade: t.prioridade, dataInicio: t.dataInicio, prazo: t.prazo, prazoHora: t.prazoHora, projetoId: t.projetoId, coluna: t.coluna })),
      })),
      semResponsavel: tarefas.filter((t) => t.membros.length === 0).length,
    },
  });
}
