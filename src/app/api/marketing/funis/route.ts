export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { funilSchema } from "@/lib/validations/marketing-funil";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || undefined; // RASCUNHO | ATIVO | ARQUIVADO
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Base = busca + ativo, sem o filtro de status — os contadores dos chips
  // são calculados sobre ela (mesmo padrão da IC).
  const baseWhere: any = {
    ativo: true,
    ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
  };
  const where: any = { ...baseWhere, ...(status ? { status } : {}) };

  const [data, total, todos, rascunho, ativo, arquivado] = await Promise.all([
    prisma.funil.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { nos: true, leads: true } } },
    }),
    prisma.funil.count({ where }),
    prisma.funil.count({ where: baseWhere }),
    prisma.funil.count({ where: { ...baseWhere, status: "RASCUNHO" } }),
    prisma.funil.count({ where: { ...baseWhere, status: "ATIVO" } }),
    prisma.funil.count({ where: { ...baseWhere, status: "ARQUIVADO" } }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    limit,
    contadores: { todos, rascunho, ativo, arquivado },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = funilSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  // canvas fica no default do schema ({ nodes: [], edges: [] }).
  const funil = await prisma.funil.create({
    data: {
      nome: d.nome,
      descricao: d.descricao || null,
      status: d.status ?? "RASCUNHO",
    },
  });

  return NextResponse.json({ data: funil }, { status: 201 });
}
