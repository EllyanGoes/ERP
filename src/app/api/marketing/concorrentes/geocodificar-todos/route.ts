export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

// Backfill de geolocalização: geocodifica em lote os concorrentes sem lat/lng.
// Paginação por cursor (id) para garantir progresso — registros que não
// resolvem (sem endereço / não encontrados) continuam nulos e NÃO são
// reprocessados na mesma execução, pois o cursor sempre avança.
const LOTE = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { cursor } = await req.json().catch(() => ({ cursor: null }));

  const pendentes = await prisma.concorrente.findMany({
    where: { ativo: true, OR: [{ latitude: null }, { longitude: null }] },
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: LOTE,
    select: { id: true, logradouro: true, numero: true, bairro: true, cidade: true, estado: true, cep: true },
  });

  let localizados = 0;
  let falhas = 0;
  let semEndereco = 0;

  for (let i = 0; i < pendentes.length; i++) {
    const c = pendentes[i];
    const temEndereco = !!(c.cidade && c.cidade.trim()) || (c.cep ?? "").replace(/\D/g, "").length >= 8;
    if (!temEndereco) {
      semEndereco++;
      continue;
    }
    const geo = await geocodificarEndereco(c);
    if (geo) {
      await prisma.concorrente.update({
        where: { id: c.id },
        data: { latitude: geo.latitude, longitude: geo.longitude },
      });
      localizados++;
    } else {
      falhas++;
    }
    // Cortesia com o Nominatim entre registros (política ~1 req/s).
    if (i < pendentes.length - 1) await sleep(700);
  }

  const proximoCursor = pendentes.length === LOTE ? pendentes[pendentes.length - 1].id : null;

  return NextResponse.json({
    processados: pendentes.length,
    localizados,
    falhas,
    semEndereco,
    proximoCursor,
  });
}
