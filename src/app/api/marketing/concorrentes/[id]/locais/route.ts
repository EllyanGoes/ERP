export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

// Locais físicos ADICIONAIS do concorrente (o endereço do próprio concorrente é
// o local principal/matriz). Cada local é geocodificável e vai pro mapa.

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const locais = await prisma.concorrenteLocal.findMany({
    where: { concorrenteId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: locais });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  const end = {
    cep: b.cep ?? null, logradouro: b.logradouro ?? null, numero: b.numero ?? null,
    complemento: b.complemento ?? null, bairro: b.bairro ?? null, cidade: b.cidade ?? null, estado: b.estado ?? null,
  };
  // Geocodifica pelo endereço informado (best-effort).
  const geo = await geocodificarEndereco(end);

  const local = await prisma.concorrenteLocal.create({
    data: {
      concorrenteId: params.id,
      nome: b.nome?.trim() || null,
      ...end,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      geoManual: false,
    },
  });
  return NextResponse.json({ data: local }, { status: 201 });
}
