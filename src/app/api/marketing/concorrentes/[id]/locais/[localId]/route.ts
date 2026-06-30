export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

type Ctx = { params: { id: string; localId: string } };

// Atualiza o endereço de um local. Re-geocodifica pelo endereço, exceto quando o
// ponto foi fixado manualmente (geoManual) — aí preserva as coordenadas.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  const atual = await prisma.concorrenteLocal.findUnique({ where: { id: params.localId } });
  if (!atual || atual.concorrenteId !== params.id) {
    return NextResponse.json({ error: "Local não encontrado" }, { status: 404 });
  }

  const end = {
    cep: b.cep ?? null, logradouro: b.logradouro ?? null, numero: b.numero ?? null,
    complemento: b.complemento ?? null, bairro: b.bairro ?? null, cidade: b.cidade ?? null, estado: b.estado ?? null,
  };

  let latitude = atual.latitude;
  let longitude = atual.longitude;
  if (!atual.geoManual) {
    const geo = await geocodificarEndereco(end);
    latitude = geo?.latitude ?? null;
    longitude = geo?.longitude ?? null;
  }

  const local = await prisma.concorrenteLocal.update({
    where: { id: params.localId },
    data: { nome: b.nome?.trim() || null, ...end, latitude, longitude },
  });
  return NextResponse.json({ data: local });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;
  await prisma.concorrenteLocal.deleteMany({ where: { id: params.localId, concorrenteId: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
