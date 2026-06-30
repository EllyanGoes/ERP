export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function GET(_: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const folha = await prisma.diariaFolha.findUnique({
    where: { id: params.id },
    include: {
      grupos: {
        orderBy: { ordem: "asc" },
        include: {
          itens: {
            orderBy: { ordem: "asc" },
            include: { colaborador: { select: { id: true, nome: true, cargo: true, setor: { select: { nome: true } } } } },
          },
        },
      },
    },
  });
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  return NextResponse.json({ data: folha });
}

type ItemIn = { colaboradorId: string; servico?: string | null; valor?: number | string | null };
type GrupoIn = { tipo?: string; setor?: string | null; turno?: string; itens?: ItemIn[] };

// Salva a folha inteira (cabeçalho + blocos + itens) por substituição. Recalcula
// o total a partir dos itens válidos (com colaborador).
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  const grupos: GrupoIn[] = Array.isArray(b.grupos) ? b.grupos : [];
  const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

  let total = 0;
  for (const g of grupos) for (const it of g.itens ?? []) if (it.colaboradorId) total += num(it.valor);

  const folha = await prisma.$transaction(async (tx) => {
    const existe = await tx.diariaFolha.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existe) return null;

    await tx.diariaGrupo.deleteMany({ where: { folhaId: params.id } }); // cascade nos itens

    await tx.diariaFolha.update({
      where: { id: params.id },
      data: {
        ...(b.data ? { data: new Date(`${String(b.data).slice(0, 10)}T12:00:00`) } : {}),
        observacoes: b.observacoes?.trim() || null,
        ...(b.status ? { status: b.status } : {}),
        total,
      },
    });

    let go = 0;
    for (const g of grupos) {
      const itensValidos = (g.itens ?? []).filter((it) => it.colaboradorId);
      const grupo = await tx.diariaGrupo.create({
        data: { folhaId: params.id, tipo: g.tipo || "DIVERSAS", setor: g.setor?.trim() || null, turno: g.turno || "DIA", ordem: go++ },
      });
      if (itensValidos.length) {
        await tx.diariaItem.createMany({
          data: itensValidos.map((it, i) => ({
            grupoId: grupo.id, colaboradorId: it.colaboradorId,
            servico: (it.servico ?? "").trim() || null, valor: num(it.valor), ordem: i,
          })),
        });
      }
    }
    return tx.diariaFolha.findUnique({ where: { id: params.id } });
  });

  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  return NextResponse.json({ data: folha });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  await prisma.diariaFolha.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ data: { ok: true } });
}
