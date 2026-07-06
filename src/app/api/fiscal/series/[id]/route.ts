export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const data: { ativo?: boolean; proximoNumero?: number } = {};
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);
  if (body.proximoNumero !== undefined) {
    const n = Number(body.proximoNumero);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "Próximo número deve ser um inteiro ≥ 1" }, { status: 400 });
    }
    data.proximoNumero = n;
  }

  const serie = await prisma.serieFiscal.update({ where: { id: params.id }, data });
  return NextResponse.json(serie);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const serie = await prisma.serieFiscal.findUnique({ where: { id: params.id } });
  if (!serie) return NextResponse.json({ error: "Série não encontrada" }, { status: 404 });

  // Série que já numerou nota não pode ser excluída (histórico fiscal) — desative.
  const emUso = await prisma.notaFiscal.findFirst({
    where: { modelo: serie.modelo, serie: serie.serie, ambiente: serie.ambiente },
    select: { id: true },
  });
  if (emUso) {
    return NextResponse.json(
      { error: "Série já usada em notas — desative em vez de excluir" },
      { status: 409 },
    );
  }

  await prisma.serieFiscal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
