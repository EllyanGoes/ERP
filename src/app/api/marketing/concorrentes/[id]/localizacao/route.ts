export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Fixa a localização manualmente (pino arrastado ou coordenadas coladas do
// Google Maps). Marca geoManual=true para o geocoding automático não sobrescrever.
const schema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
  }

  const atualizado = await prisma.concorrente.update({
    where: { id: params.id },
    data: { latitude: parsed.data.latitude, longitude: parsed.data.longitude, geoManual: true },
    select: { id: true, latitude: true, longitude: true, geoManual: true },
  });

  return NextResponse.json({ data: atualizado });
}
