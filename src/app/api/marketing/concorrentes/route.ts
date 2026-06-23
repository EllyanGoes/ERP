export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { concorrenteSchema } from "@/lib/validations/concorrente";
import { geocodificarEndereco } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const categoria = searchParams.get("categoria") || undefined; // fornecedor | revendedor
  const ativo = searchParams.get("ativo");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: any = {
    AND: [
      q
        ? {
            OR: [
              { razaoSocial: { contains: q, mode: "insensitive" } },
              { nomeFantasia: { contains: q, mode: "insensitive" } },
              { cidade: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      categoria === "fornecedor" ? { ehFornecedor: true } : {},
      categoria === "revendedor" ? { ehRevendedor: true } : {},
      ativo === "false" ? {} : { ativo: true },
    ],
  };

  const [data, total] = await Promise.all([
    prisma.concorrente.findMany({
      where,
      orderBy: { razaoSocial: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { precos: true } } },
    }),
    prisma.concorrente.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = concorrenteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  let { latitude, longitude } = d;

  // Geocodifica automaticamente quando o usuário não fixou coordenadas manualmente.
  if (latitude == null || longitude == null) {
    const geo = await geocodificarEndereco(d);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }

  const concorrente = await prisma.concorrente.create({
    data: {
      ...d,
      email: d.email || null,
      cpfCnpj: d.cpfCnpj?.trim() || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    },
  });

  return NextResponse.json({ data: concorrente }, { status: 201 });
}
