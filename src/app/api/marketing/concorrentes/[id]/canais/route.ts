export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const data = await prisma.concorrenteCanal.findMany({
    where: { concorrenteId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  if (!b.tipo?.trim()) return NextResponse.json({ error: "Selecione o tipo do canal" }, { status: 400 });

  // Loja física (LOCALIZACAO): geocodifica o endereço para virar ponto no mapa.
  // Se vierem coordenadas explícitas (ex.: link do Google Maps), usa-as e marca
  // geoManual (não re-geocodifica por cima).
  const ehLocal = b.tipo === "LOCALIZACAO";
  const end = ehLocal ? {
    cep: b.cep ?? null, logradouro: b.logradouro ?? null, numero: b.numero ?? null,
    complemento: b.complemento ?? null, bairro: b.bairro ?? null, cidade: b.cidade ?? null, estado: b.estado ?? null,
  } : {};
  const temCoord = ehLocal && b.latitude != null && b.longitude != null;
  const geo = ehLocal && !temCoord ? await geocodificarEndereco(end) : null;

  const canal = await prisma.concorrenteCanal.create({
    data: {
      concorrenteId: params.id,
      tipo: b.tipo,
      valor: b.valor?.trim() || null,
      observacao: b.observacao?.trim() || null,
      ...end,
      latitude: temCoord ? Number(b.latitude) : geo?.latitude ?? null,
      longitude: temCoord ? Number(b.longitude) : geo?.longitude ?? null,
      geoManual: !!temCoord,
      geoReferencia: temCoord ? (b.geoReferencia ?? null) : null,
    },
  });
  return NextResponse.json({ data: canal }, { status: 201 });
}
