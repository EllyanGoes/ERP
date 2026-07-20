export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  codigo: z.string().min(1).optional(),
  nome: z.string().min(1).optional(),
  sentido: z.enum(["ENTRADA", "SAIDA"]).optional(),
  estocavel: z.boolean().optional(),
  almoxarifadoDefaultId: z.string().optional().nullable(),
  compoeCusto: z.boolean().optional(),
  permiteCapitalizar: z.boolean().optional(),
  geraFinanceiro: z.boolean().optional(),
  geraFiscal: z.boolean().optional(),
  cfop: z.string().optional().nullable(),
  naturezaFiscal: z.string().optional().nullable(),
  centroCustoSugeridoId: z.string().optional().nullable(),
  naturezaSugeridaId: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const d = body.data;
  const record = await prisma.tipoOperacao.update({
    where: { id: params.id },
    data: {
      ...d,
      ...(d.almoxarifadoDefaultId !== undefined ? { almoxarifadoDefaultId: d.almoxarifadoDefaultId || null } : {}),
      ...(d.centroCustoSugeridoId !== undefined ? { centroCustoSugeridoId: d.centroCustoSugeridoId || null } : {}),
      ...(d.naturezaSugeridaId !== undefined ? { naturezaSugeridaId: d.naturezaSugeridaId || null } : {}),
      ...(d.cfop !== undefined ? { cfop: d.cfop || null } : {}),
      ...(d.naturezaFiscal !== undefined ? { naturezaFiscal: d.naturezaFiscal || null } : {}),
    },
  });
  return NextResponse.json(record);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;
  await prisma.tipoOperacao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
