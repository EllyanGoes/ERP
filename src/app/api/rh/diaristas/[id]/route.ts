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

type ItemIn = {
  colaboradorId: string; servico?: string | null; valor?: number | string | null;
  valorTotal?: number | string | null;
  manha?: string | null; tarde?: string | null; horasExcedente?: string | null;
};
type GrupoIn = { tipo?: string; setor?: string | null; turno?: string; itens?: ItemIn[] };

// Salva a folha inteira (cabeçalho + blocos + itens) por substituição. Recalcula
// o total a partir dos itens válidos (com colaborador).
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  const grupos: GrupoIn[] = Array.isArray(b.grupos) ? b.grupos : [];
  // pt-BR: vírgula decimal, ponto de milhar opcional; aceita ponto puro também.
  const num = (v: unknown) => {
    const s = String(v ?? "").trim();
    const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(n) ? n : 0;
  };

  // Total da folha soma o valor TOTAL (diária + excedente); folhas antigas
  // sem valorTotal caem no valor base.
  let total = 0;
  for (const g of grupos) for (const it of g.itens ?? []) {
    if (it.colaboradorId) total += it.valorTotal !== undefined ? num(it.valorTotal) : num(it.valor);
  }

  const folha = await prisma.$transaction(async (tx) => {
    const existe = await tx.diariaFolha.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
    if (!existe) return null;

    // Folha FECHADA é imutável por aqui: o salvar substitui grupos/itens (ids
    // novos) e apagaria os carimbos de pagamento — feche/reabra pela rota
    // dedicada (/fechar), que também cuida da provisão e do título único.
    if (existe.status === "FECHADA") {
      throw new Error("FOLHA_FECHADA");
    }

    await tx.diariaGrupo.deleteMany({ where: { folhaId: params.id } }); // cascade nos itens

    await tx.diariaFolha.update({
      where: { id: params.id },
      data: {
        ...(b.data ? { data: new Date(`${String(b.data).slice(0, 10)}T12:00:00`) } : {}),
        ...(b.turno === "DIA" || b.turno === "NOITE" ? { turno: b.turno } : {}),
        observacoes: b.observacoes?.trim() || null,
        // status NÃO muda por aqui — fechar/reabrir têm rota própria (provisão
        // contábil + título único andam junto com o status).
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
            valorTotal: it.valorTotal !== undefined ? num(it.valorTotal) : num(it.valor),
            manha: (it.manha ?? "").trim() || null,
            tarde: (it.tarde ?? "").trim() || null,
            horasExcedente: (it.horasExcedente ?? "").trim() || null,
          })),
        });
      }
    }
    return tx.diariaFolha.findUnique({ where: { id: params.id } });
  }).catch((e) => {
    if (e instanceof Error && e.message === "FOLHA_FECHADA") return "FECHADA" as const;
    throw e;
  });

  if (folha === "FECHADA") {
    return NextResponse.json({ error: "A folha está FECHADA — reabra pela ação Reabrir antes de editar." }, { status: 409 });
  }
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  return NextResponse.json({ data: folha });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  // Fechada tem provisão contábil e título no financeiro — reabrir primeiro
  // (a reabertura estorna tudo e é bloqueada se houver pagamento).
  const f = await prisma.diariaFolha.findUnique({ where: { id: params.id }, select: { status: true } });
  if (f?.status === "FECHADA") {
    return NextResponse.json({ error: "A folha está FECHADA — reabra antes de excluir." }, { status: 409 });
  }
  await prisma.diariaFolha.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ data: { ok: true } });
}
