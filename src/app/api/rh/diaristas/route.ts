export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Lista as folhas de diárias (mais recentes primeiro) com contagem e total.
export async function GET() {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const folhas = await prisma.diariaFolha.findMany({
    orderBy: { data: "desc" },
    include: { grupos: { select: { _count: { select: { itens: true } } } } },
  });
  const data = folhas.map((f) => {
    const qtde = f.grupos.reduce((s, g) => s + g._count.itens, 0);
    const { grupos: _g, ...rest } = f;
    return { ...rest, qtdePessoas: qtde, qtdeBlocos: f.grupos.length };
  });
  return NextResponse.json({ data });
}

// Cria uma folha de diárias para uma data (vazia, edita-se em seguida).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => ({}));
  if (!b.data) return NextResponse.json({ error: "Informe a data da folha." }, { status: 400 });

  const folha = await prisma.diariaFolha.create({
    data: {
      data: new Date(`${String(b.data).slice(0, 10)}T12:00:00`),
      observacoes: b.observacoes?.trim() || null,
      criadoPor: auth.session.nome ?? null,
    },
  });
  return NextResponse.json({ data: folha }, { status: 201 });
}
