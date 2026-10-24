export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

async function ordemEditavel(id: string) {
  const os = await prisma.manutOrdem.findUnique({ where: { id }, select: { status: true } });
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (["CONCLUIDA", "CANCELADA"].includes(os.status)) return NextResponse.json({ error: "OS concluída/cancelada — reabra para editar." }, { status: 422 });
  return null;
}

function campos(b: Record<string, unknown>): Prisma.ManutOrdemServicoUncheckedUpdateInput {
  const d: Prisma.ManutOrdemServicoUncheckedUpdateInput = {};
  if (typeof b.descricao === "string") d.descricao = b.descricao.trim() || "—";
  for (const k of ["servicoId", "sintomaId", "causaId"] as const) if (k in b) d[k] = (b[k] as string) || null;
  if ("executado" in b) d.executado = !!b.executado;
  if ("tempoHoras" in b) d.tempoHoras = b.tempoHoras === "" || b.tempoHoras == null ? null : Number(b.tempoHoras);
  if ("resposta" in b) {
    d.resposta = b.resposta == null ? null : String(b.resposta);
    d.executado = d.resposta != null && d.resposta !== "";
  }
  if ("conforme" in b) d.conforme = b.conforme == null ? null : !!b.conforme;
  return d;
}

// POST — novo serviço/registro de falha { descricao, servicoId?, sintomaId?, causaId?, executado?, tempoHoras? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const bloq = await ordemEditavel(id); if (bloq) return bloq;
  const b = await req.json().catch(() => ({}));
  const ult = await prismaSemEscopo.manutOrdemServico.aggregate({ where: { ordemId: id }, _max: { seq: true } });
  const c = campos(b) as Omit<Prisma.ManutOrdemServicoUncheckedCreateInput, "ordemId" | "descricao"> & { descricao?: string };
  const s = await prismaSemEscopo.manutOrdemServico.create({
    data: { ...c, descricao: c.descricao ?? "—", ordemId: id, seq: (ult._max.seq ?? 0) + 1 },
  });
  return NextResponse.json({ data: s }, { status: 201 });
}

// PATCH { linhaId, ...campos } — inclui resposta do checklist.
// Checklist NUMERO fora da faixa marca não conforme automaticamente.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const bloq = await ordemEditavel(id); if (bloq) return bloq;
  const b = await req.json().catch(() => ({}));
  const linha = await prismaSemEscopo.manutOrdemServico.findFirst({ where: { id: b.linhaId, ordemId: id } });
  if (!linha) return NextResponse.json({ error: "Linha não encontrada." }, { status: 404 });
  const d = campos(b);
  if ("resposta" in b && linha.tipoResposta === "NUMERO" && b.resposta !== "" && b.resposta != null) {
    const v = Number(b.resposta);
    const min = linha.faixaMin != null ? Number(linha.faixaMin) : -Infinity;
    const max = linha.faixaMax != null ? Number(linha.faixaMax) : Infinity;
    d.conforme = Number.isFinite(v) && v >= min && v <= max;
  }
  if ("resposta" in b && linha.tipoResposta === "OK_NOK") d.conforme = b.resposta === "OK" ? true : b.resposta === "NOK" ? false : null;
  const s = await prismaSemEscopo.manutOrdemServico.update({ where: { id: linha.id }, data: d });
  return NextResponse.json({ data: s });
}

// DELETE ?linhaId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const bloq = await ordemEditavel(id); if (bloq) return bloq;
  await prismaSemEscopo.manutOrdemServico.deleteMany({ where: { id: req.nextUrl.searchParams.get("linhaId") ?? "", ordemId: id } });
  return NextResponse.json({ ok: true });
}
