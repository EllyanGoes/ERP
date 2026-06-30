export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

type Ctx = { params: { id: string; canalId: string } };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  if (!b.tipo?.trim()) return NextResponse.json({ error: "Selecione o tipo do canal" }, { status: 400 });

  const atual = await prisma.concorrenteCanal.findUnique({ where: { id: params.canalId } });
  if (!atual || atual.concorrenteId !== params.id) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const ehLocal = b.tipo === "LOCALIZACAO";
  const end = ehLocal ? {
    cep: b.cep ?? null, logradouro: b.logradouro ?? null, numero: b.numero ?? null,
    complemento: b.complemento ?? null, bairro: b.bairro ?? null, cidade: b.cidade ?? null, estado: b.estado ?? null,
  } : { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null };

  // Re-geocodifica pelo endereço, exceto se o ponto foi fixado manualmente.
  let latitude = atual.latitude;
  let longitude = atual.longitude;
  if (ehLocal && !atual.geoManual) {
    const geo = await geocodificarEndereco(end);
    latitude = geo?.latitude ?? null;
    longitude = geo?.longitude ?? null;
  } else if (!ehLocal) {
    latitude = null; longitude = null;
  }

  const canal = await prisma.concorrenteCanal.update({
    where: { id: params.canalId },
    data: { tipo: b.tipo, valor: b.valor?.trim() || null, observacao: b.observacao?.trim() || null, ...end, latitude, longitude },
  });
  return NextResponse.json({ data: canal });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;
  await prisma.concorrenteCanal.deleteMany({ where: { id: params.canalId, concorrenteId: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
