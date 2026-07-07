export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { campanhaSchema } from "@/lib/validations/marketing-campanha";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const plataforma = searchParams.get("plataforma") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Base = busca + ativo, sem o filtro de plataforma — contadores dos chips.
  const baseWhere: any = {
    ativo: true,
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { utmCampaign: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: any = { ...baseWhere, ...(plataforma ? { plataforma } : {}) };

  const [data, total, todos, grupos] = await Promise.all([
    prisma.campanha.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { leads: true } } },
    }),
    prisma.campanha.count({ where }),
    prisma.campanha.count({ where: baseWhere }),
    prisma.campanha.groupBy({ by: ["plataforma"], where: baseWhere, _count: { _all: true } }),
  ]);

  const porPlataforma: Record<string, number> = {};
  for (const g of grupos) porPlataforma[g.plataforma] = g._count._all;

  return NextResponse.json({ data, total, page, limit, contadores: { todos, porPlataforma } });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = campanhaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const campanha = await prisma.campanha.create({
    data: {
      ...d,
      orcamento: d.orcamento ?? null,
      dataInicio: d.dataInicio ? new Date(d.dataInicio) : null,
      dataFim: d.dataFim ? new Date(d.dataFim) : null,
    },
  });

  return NextResponse.json({ data: campanha }, { status: 201 });
}
