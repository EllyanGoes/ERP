export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Fixa a localização do cliente manualmente (pino arrastado ou coordenadas
// coladas do Google Maps). geoManual=true trava o geocoding automático.
const schema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  referencia: z.string().max(2000).optional().nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
  }

  const atualizado = await prisma.cliente.update({
    where: { id: params.id },
    data: {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      geoManual: true,
      geoReferencia: parsed.data.referencia?.trim() || `${parsed.data.latitude}, ${parsed.data.longitude}`,
    },
    select: { id: true, latitude: true, longitude: true, geoManual: true, geoReferencia: true },
  });

  return NextResponse.json({ data: atualizado });
}
