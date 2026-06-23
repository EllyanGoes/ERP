export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

// Geocodifica o endereço atual do cliente e grava lat/lng (modo automático).
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const c = await prisma.cliente.findUnique({
    where: { id: params.id },
    select: { logradouro: true, numero: true, bairro: true, cidade: true, estado: true, cep: true },
  });
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const geo = await geocodificarEndereco(c);
  if (!geo) {
    return NextResponse.json(
      { error: "Não foi possível localizar o endereço. Verifique cidade/CEP ou ajuste manualmente." },
      { status: 422 },
    );
  }

  const atualizado = await prisma.cliente.update({
    where: { id: params.id },
    data: { latitude: geo.latitude, longitude: geo.longitude, geoManual: false, geoReferencia: null },
    select: { id: true, latitude: true, longitude: true, geoManual: true },
  });

  return NextResponse.json({ data: atualizado, displayName: geo.displayName });
}
