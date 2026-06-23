export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

// Força a geocodificação do endereço atual e grava lat/lng. Útil quando o
// usuário corrige o endereço e quer re-localizar no mapa.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const c = await prisma.concorrente.findUnique({
    where: { id: params.id },
    select: { logradouro: true, numero: true, bairro: true, cidade: true, estado: true, cep: true },
  });
  if (!c) return NextResponse.json({ error: "Concorrente não encontrado" }, { status: 404 });

  const geo = await geocodificarEndereco(c);
  if (!geo) {
    return NextResponse.json(
      { error: "Não foi possível localizar o endereço. Verifique cidade/CEP ou ajuste manualmente." },
      { status: 422 },
    );
  }

  const atualizado = await prisma.concorrente.update({
    where: { id: params.id },
    data: { latitude: geo.latitude, longitude: geo.longitude },
    select: { id: true, latitude: true, longitude: true },
  });

  return NextResponse.json({ data: atualizado, displayName: geo.displayName });
}
