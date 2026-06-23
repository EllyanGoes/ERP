export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { concorrenteSchema } from "@/lib/validations/concorrente";
import { geocodificarEndereco } from "@/lib/geocode";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const concorrente = await prisma.concorrente.findUnique({
    where: { id: params.id },
    include: {
      precos: {
        orderBy: [{ produtoNome: "asc" }, { dataColeta: "desc" }],
        include: { item: { select: { id: true, codigo: true, descricao: true, precoVenda: true } } },
      },
    },
  });
  if (!concorrente) return NextResponse.json({ error: "Concorrente não encontrado" }, { status: 404 });
  return NextResponse.json({ data: concorrente });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

  const existente = await prisma.concorrente.findUnique({
    where: { id: params.id },
    select: { latitude: true, longitude: true, geoManual: true },
  });

  let latitude = d.latitude ?? null;
  let longitude = d.longitude ?? null;
  let geoManual = existente?.geoManual ?? false;

  if (geoManual && existente?.latitude != null && existente?.longitude != null) {
    // Coordenadas fixadas manualmente — preserva (não re-geocodifica).
    latitude = existente.latitude;
    longitude = existente.longitude;
  } else if (latitude == null || longitude == null) {
    // Modo automático: recalcula pelo endereço atual.
    const geo = await geocodificarEndereco(d);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
    geoManual = false;
  }

  const concorrente = await prisma.concorrente.update({
    where: { id: params.id },
    data: {
      ...d,
      email: d.email || null,
      cpfCnpj: d.cpfCnpj?.trim() || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      geoManual,
    },
  });

  return NextResponse.json({ data: concorrente });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  // Soft delete (mantém histórico de preços coletados).
  await prisma.concorrente.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { ok: true } });
}
