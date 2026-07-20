export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadSchema } from "@/lib/validations/marketing-lead";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || undefined; // ABERTO | GANHO | PERDIDO
  const etapaId = searchParams.get("etapaId") || undefined;
  const campanhaId = searchParams.get("campanhaId") || undefined;
  const funilId = searchParams.get("funilId") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Base = todos os filtros MENOS status — contadores dos chips de status.
  const baseWhere: any = {
    ativo: true,
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { telefone: { contains: q, mode: "insensitive" } },
            { empresaNome: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(etapaId ? { etapaId } : {}),
    ...(campanhaId ? { campanhaId } : {}),
    ...(funilId ? { funilId } : {}),
  };
  const where: any = { ...baseWhere, ...(status ? { status } : {}) };

  const [data, total, todos, abertos, ganhos, perdidos] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        campanha: { select: { id: true, nome: true, plataforma: true } },
        etapa: true,
        cliente: { select: { id: true, razaoSocial: true } },
      },
    }),
    prisma.lead.count({ where }),
    prisma.lead.count({ where: baseWhere }),
    prisma.lead.count({ where: { ...baseWhere, status: "ABERTO" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "GANHO" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "PERDIDO" } }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    limit,
    contadores: { todos, abertos, ganhos, perdidos },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const lead = await prisma.lead.create({
    data: {
      ...d,
      email: d.email || null,
      // Evento aninhado não passa pelo carimbo automático do proxy — grava
      // o autor explicitamente a partir da sessão.
      eventos: { create: { tipo: "CRIACAO", criadoPor: auth.session.nome } },
    },
  });

  return NextResponse.json({ data: lead }, { status: 201 });
}
