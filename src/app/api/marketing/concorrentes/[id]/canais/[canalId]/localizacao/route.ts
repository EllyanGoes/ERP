export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Ajuste manual do pino de um canal de localização (loja física). Marca
// geoManual=true. Mesmo contrato do LocalizacaoMapa.
const schema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  referencia: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string; canalId: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });

  const canal = await prisma.concorrenteCanal.update({
    where: { id: params.canalId },
    data: {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      geoManual: true,
      geoReferencia: parsed.data.referencia?.trim() || `${parsed.data.latitude}, ${parsed.data.longitude}`,
    },
    select: { id: true, latitude: true, longitude: true, geoManual: true, geoReferencia: true },
  });
  return NextResponse.json({ data: canal });
}
