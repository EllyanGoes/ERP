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
  const ehLocal = b.tipo === "LOCALIZACAO";
  const end = ehLocal ? {
    cep: b.cep ?? null, logradouro: b.logradouro ?? null, numero: b.numero ?? null,
    complemento: b.complemento ?? null, bairro: b.bairro ?? null, cidade: b.cidade ?? null, estado: b.estado ?? null,
  } : {};
  const geo = ehLocal ? await geocodificarEndereco(end) : null;

  const canal = await prisma.concorrenteCanal.create({
    data: {
      concorrenteId: params.id,
      tipo: b.tipo,
      valor: b.valor?.trim() || null,
      observacao: b.observacao?.trim() || null,
      ...end,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      geoManual: false,
    },
  });
  return NextResponse.json({ data: canal }, { status: 201 });
}
