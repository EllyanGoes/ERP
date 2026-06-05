export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sequenciarForno } from "@/lib/pcp/scheduler";

// GET — sequencia as OPs liberadas/em produção no forno (FIFO) com os params dados.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const capacidade = Number(sp.get("capacidade")) || 0;
  const cicloHoras = Number(sp.get("cicloHoras")) || 0;
  const horasDia = Number(sp.get("horasDia")) || 24;

  const ops = await prisma.ordemProducao.findMany({
    where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      numero: true,
      quantidadePlanejada: true,
      item: { select: { descricao: true } },
    },
  });

  const cronograma = sequenciarForno(
    ops.map((o) => ({
      id: o.id,
      numero: o.numero,
      produto: o.item?.descricao ?? null,
      quantidade: Number(o.quantidadePlanejada),
    })),
    { capacidade, cicloHoras, horasDia },
  );

  return NextResponse.json({ data: { ...cronograma, totalOps: ops.length }, source: "db" });
}
