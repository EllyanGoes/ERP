export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const RESPOSTAS = ["NENHUMA", "OK_NOK", "NUMERO", "TEXTO"];

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const p = await prisma.manutPlano.findUnique({
    where: { id },
    include: {
      tipo: true,
      equipe: { select: { id: true, nome: true } },
      tarefas: { orderBy: { seq: "asc" }, include: { ativo: { select: { tag: true, nome: true } } } },
      materiais: { include: { item: { select: { id: true, codigo: true, descricao: true } } } },
      ativos: {
        include: {
          ativoRef: { select: { id: true, tag: true, nome: true, medidores: { where: { ativo: true }, select: { id: true, nome: true, unidade: true, acumulado: true } } } },
          medidor: { select: { id: true, nome: true, unidade: true, acumulado: true } },
        },
        orderBy: { proximoVencimento: "asc" },
      },
      ordens: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, numero: true, status: true, createdAt: true, programadaPara: true, concluidaEm: true, ativo: { select: { tag: true } } } },
    },
  });
  if (!p) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  return NextResponse.json({ data: p });
}

// PATCH — cabeçalho e, se vierem, substitui o checklist (tarefas) e o kit (materiais).
// tarefas: [{ descricao, tipoResposta, faixaMin?, faixaMax?, servicoId?, ativoId? }]
// materiais: [{ itemId, quantidade }]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const atual = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!atual) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const data: Prisma.ManutPlanoUncheckedUpdateInput = {};
  for (const k of ["codigo", "nome"] as const) if (typeof b[k] === "string" && b[k].trim()) data[k] = b[k].trim();
  if (b.tipoId) data.tipoId = b.tipoId;
  if ("equipeId" in b) data.equipeId = b.equipeId || null;
  if ("horasEstimadas" in b) data.horasEstimadas = b.horasEstimadas === "" || b.horasEstimadas == null ? null : Number(b.horasEstimadas);
  for (const k of ["antecedenciaDias", "toleranciaPct"] as const) if (k in b && b[k] !== "" && b[k] != null) data[k] = Math.max(0, Math.round(Number(b[k])));
  for (const k of ["exigeParada", "baseNaConclusao", "ativo"] as const) if (k in b) data[k] = !!b[k];
  if ("observacoes" in b) data.observacoes = b.observacoes?.trim() || null;
  try {
    await prismaSemEscopo.$transaction(async (tx) => {
      await tx.manutPlano.update({ where: { id }, data });
      if (Array.isArray(b.tarefas)) {
        await tx.manutPlanoTarefa.deleteMany({ where: { planoId: id } });
        const tarefas = (b.tarefas as Record<string, unknown>[]).filter((t) => String(t.descricao ?? "").trim());
        await tx.manutPlanoTarefa.createMany({
          data: tarefas.map((t, i) => ({
            planoId: id, seq: i + 1, descricao: String(t.descricao).trim(),
            tipoResposta: RESPOSTAS.includes(String(t.tipoResposta)) ? String(t.tipoResposta) : "OK_NOK",
            faixaMin: t.faixaMin === "" || t.faixaMin == null ? null : Number(t.faixaMin),
            faixaMax: t.faixaMax === "" || t.faixaMax == null ? null : Number(t.faixaMax),
            servicoId: (t.servicoId as string) || null, ativoId: (t.ativoId as string) || null,
          })),
        });
      }
      if (Array.isArray(b.materiais)) {
        await tx.manutPlanoMaterial.deleteMany({ where: { planoId: id } });
        const mats = (b.materiais as Record<string, unknown>[]).filter((m) => m.itemId && Number(m.quantidade) > 0);
        await tx.manutPlanoMaterial.createMany({ data: mats.map((m) => ({ planoId: id, itemId: String(m.itemId), quantidade: Number(m.quantidade) })), skipDuplicates: true });
      }
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Já existe plano com esse código." }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

// DELETE — plano com OS no histórico é só desativado.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const p = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true, _count: { select: { ordens: true } } } });
  if (!p) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  if (p._count.ordens > 0) {
    await prisma.manutPlano.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ data: { desativado: true } });
  }
  await prisma.manutPlano.delete({ where: { id } });
  return NextResponse.json({ data: { excluido: true } });
}
