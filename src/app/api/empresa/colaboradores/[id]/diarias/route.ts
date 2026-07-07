export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

// GET /api/empresa/colaboradores/[id]/diarias — histórico de diárias do
// colaborador (itens de DiariaFolha, mais recentes primeiro).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const itens = await prisma.diariaItem.findMany({
    where: { colaboradorId: params.id },
    select: {
      id: true, servico: true, valor: true,
      grupo: { select: { setor: true, turno: true, folha: { select: { id: true, data: true, status: true } } } },
    },
    orderBy: { grupo: { folha: { data: "desc" } } },
  });

  const data = itens.map((it) => ({
    id: it.id,
    folhaId: it.grupo.folha.id,
    data: it.grupo.folha.data,
    status: it.grupo.folha.status,
    setor: it.grupo.setor,
    turno: it.grupo.turno,
    servico: it.servico,
    valor: decimalToNumber(it.valor),
  }));
  const total = Math.round(data.reduce((s, d) => s + d.valor, 0) * 100) / 100;
  return NextResponse.json({ data, total });
}
