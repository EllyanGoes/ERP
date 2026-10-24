export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { criarSolicitacao } from "@/lib/manutencao/solicitacao";

// POST — abre uma Solicitação de Serviço na Manutenção a partir do SST
// (inspeção não conforme ou incidente com máquina). A SS guarda origem/origemId
// para o SST mostrar o andamento (SS → OS) na própria tela.
// Body: { origem: "SST_INSPECAO" | "SST_INCIDENTE", origemId, ativoId?, descricao, ativoParado?, prioridade? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const origem = b.origem === "SST_INSPECAO" || b.origem === "SST_INCIDENTE" ? b.origem : null;
  const origemId = String(b.origemId ?? "");
  const descricao = String(b.descricao ?? "").trim();
  if (!origem || !origemId) return NextResponse.json({ error: "Origem inválida." }, { status: 400 });
  if (!descricao) return NextResponse.json({ error: "Descreva o problema." }, { status: 400 });

  // Registro de origem (na empresa ativa) — dá o "onde" quando a máquina não tem ativo ligado.
  let localTexto: string | null = null;
  if (origem === "SST_INSPECAO") {
    const ins = await prisma.sstInspecao.findUnique({ where: { id: origemId }, select: { descricao: true, maquina: { select: { nome: true, local: true } } } });
    if (!ins) return NextResponse.json({ error: "Inspeção não encontrada." }, { status: 404 });
    localTexto = ins.maquina ? [ins.maquina.nome, ins.maquina.local].filter(Boolean).join(" · ") : ins.descricao;
  } else {
    const inc = await prisma.sstIncidente.findUnique({ where: { id: origemId }, select: { numero: true, local: true, maquina: { select: { nome: true, local: true } } } });
    if (!inc) return NextResponse.json({ error: "Ocorrência não encontrada." }, { status: 404 });
    localTexto = inc.maquina ? [inc.maquina.nome, inc.maquina.local].filter(Boolean).join(" · ") : inc.local || `Ocorrência ${inc.numero}`;
  }

  if (b.ativoId) {
    const a = await prisma.manutAtivo.findUnique({ where: { id: b.ativoId }, select: { id: true } });
    if (!a) return NextResponse.json({ error: "Equipamento não encontrado." }, { status: 404 });
  }

  // Uma SS viva por registro de origem (recusada pode ser reaberta).
  const existente = await prisma.manutSolicitacao.findFirst({ where: { origem, origemId, status: { not: "RECUSADA" } }, select: { numero: true } });
  if (existente) return NextResponse.json({ error: `Já existe a solicitação ${existente.numero} para este registro.` }, { status: 409 });

  const ss = await criarSolicitacao({
    empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
    ativoId: b.ativoId || null,
    localTexto: b.ativoId ? null : localTexto,
    descricao,
    ativoParado: !!b.ativoParado,
    prioridade: b.prioridade,
    solicitanteId: auth.session.sub,
    solicitanteNome: auth.session.nome,
    origem,
    origemId,
  });
  return NextResponse.json({ data: ss }, { status: 201 });
}
