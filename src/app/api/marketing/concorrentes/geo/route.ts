export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Pontos georreferenciados para o mapa de geomarketing: o local principal de cada
// concorrente (endereço do próprio) MAIS cada local físico adicional. Um pino por
// ponto; `id` é o do concorrente (p/ o link), `localId` é a chave única do ponto.
export async function GET(_: NextRequest) {
  const concorrentes = await prisma.concorrente.findMany({
    where: { ativo: true },
    select: {
      id: true, razaoSocial: true, nomeFantasia: true,
      ehFornecedor: true, ehRevendedor: true, clienteId: true,
      cidade: true, estado: true, latitude: true, longitude: true,
      _count: { select: { precos: true } },
      canais: {
        where: { tipo: "LOCALIZACAO", latitude: { not: null }, longitude: { not: null } },
        select: { id: true, valor: true, cidade: true, estado: true, latitude: true, longitude: true },
      },
    },
  });

  const data: Array<Record<string, unknown>> = [];
  for (const c of concorrentes) {
    const base = {
      id: c.id, razaoSocial: c.razaoSocial, nomeFantasia: c.nomeFantasia,
      ehFornecedor: c.ehFornecedor, ehRevendedor: c.ehRevendedor, clienteId: c.clienteId,
      _count: c._count,
    };
    // Lojas físicas (canais de localização) são a fonte dos pontos.
    for (const l of c.canais) {
      data.push({ ...base, localId: l.id, localNome: l.valor || "Loja física", cidade: l.cidade ?? c.cidade, estado: l.estado ?? c.estado, latitude: l.latitude, longitude: l.longitude });
    }
    // Matriz (lat/lng do próprio concorrente) só como FALLBACK quando ainda não há
    // canal de localização — evita duplicar o ponto do concorrente já mapeado.
    if (c.canais.length === 0 && c.latitude != null && c.longitude != null) {
      data.push({ ...base, localId: `${c.id}-0`, localNome: "Matriz", cidade: c.cidade, estado: c.estado, latitude: c.latitude, longitude: c.longitude });
    }
  }

  return NextResponse.json({ data });
}
