export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, renormalizarColuna, ORDEM_GAP } from "@/lib/projetos";

// POST /api/projetos/tarefas/[tarefaId]/mover — { colunaId, aposTarefaId? }
// Posiciona a tarefa na coluna destino após `aposTarefaId` (ou no topo).
// Coluna com concluiTarefa marca/desmarca a conclusão (fonte única de status).
export async function POST(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const tarefa = await prismaSemEscopo.tarefa.findUnique({
    where: { id: params.tarefaId },
    select: { id: true, projetoId: true, colunaId: true, titulo: true, concluidaEm: true, coluna: { select: { nome: true } } },
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  const acesso = await nivelNoProjeto(auth.session, tarefa.projetoId);
  if (!acesso) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  if (!podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });

  const body = await req.json();
  const destino = await prismaSemEscopo.projetoColuna.findFirst({
    where: { id: String(body.colunaId ?? ""), projetoId: tarefa.projetoId, arquivada: false },
    select: { id: true, nome: true, concluiTarefa: true },
  });
  if (!destino) return NextResponse.json({ error: "Coluna inválida." }, { status: 400 });

  // Nova ordem: entre `aposTarefaId` e a seguinte; sem `aposTarefaId` → topo.
  // Se a folga entre vizinhas acabou, renormaliza a coluna e recomputa.
  const calcularOrdem = async (): Promise<number> => {
    const vizinhas = await prismaSemEscopo.tarefa.findMany({
      where: { colunaId: destino.id, arquivada: false, id: { not: tarefa.id } },
      orderBy: { ordem: "asc" },
      select: { id: true, ordem: true },
    });
    if (body.aposTarefaId) {
      const idx = vizinhas.findIndex((v) => v.id === body.aposTarefaId);
      if (idx === -1) return (vizinhas[vizinhas.length - 1]?.ordem ?? 0) + ORDEM_GAP;
      const antes = vizinhas[idx].ordem;
      const depois = vizinhas[idx + 1]?.ordem ?? antes + 2 * ORDEM_GAP;
      const meio = Math.floor((antes + depois) / 2);
      return meio > antes ? meio : NaN;
    }
    const primeira = vizinhas[0]?.ordem ?? 2 * ORDEM_GAP;
    const topo = Math.floor(primeira / 2);
    return topo >= 1 ? topo : NaN;
  };
  let novaOrdem = await calcularOrdem();
  if (Number.isNaN(novaOrdem)) {
    await renormalizarColuna(destino.id);
    novaOrdem = await calcularOrdem();
    if (Number.isNaN(novaOrdem)) novaOrdem = ORDEM_GAP; // coluna renormalizada — não deve acontecer
  }

  const mudouColuna = destino.id !== tarefa.colunaId;
  const concluiu = destino.concluiTarefa && !tarefa.concluidaEm;
  const reabriu = !destino.concluiTarefa && !!tarefa.concluidaEm;

  await prismaSemEscopo.tarefa.update({
    where: { id: tarefa.id },
    data: {
      colunaId: destino.id,
      ordem: novaOrdem,
      concluidaEm: destino.concluiTarefa ? (tarefa.concluidaEm ?? new Date()) : null,
    },
  });

  if (mudouColuna) {
    await registrarAtividade({
      projetoId: tarefa.projetoId, tarefaId: tarefa.id, autorId: auth.session.sub,
      tipo: concluiu ? "CONCLUIU" : reabriu ? "REABRIU" : "MOVEU",
      detalhe: { de: tarefa.coluna.nome, para: destino.nome },
    });
  }
  return NextResponse.json({ ok: true, concluidaEm: destino.concluiTarefa ? (tarefa.concluidaEm ?? new Date()) : null });
}
