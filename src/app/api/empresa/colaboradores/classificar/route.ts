export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/empresa/colaboradores/classificar
// Em massa: classificação de custo (MOD/MOI/ADMIN → rateio da folha) e/ou tipo
// (FUNCIONARIO → folha de pagamento, PRESTADOR → lançamento de diaristas).
const schema = z.object({
  ids: z.array(z.string()).min(1),
  classificacaoCusto: z.enum(["MOD", "MOI", "ADMIN"]).nullable().optional(),
  tipoColaborador: z.enum(["FUNCIONARIO", "PRESTADOR"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { ids, classificacaoCusto, tipoColaborador } = body.data;
  const data: Record<string, unknown> = {};
  if (classificacaoCusto !== undefined) data.classificacaoCusto = classificacaoCusto;
  if (tipoColaborador !== undefined) data.tipoColaborador = tipoColaborador;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  const r = await prisma.colaborador.updateMany({ where: { id: { in: ids } }, data });
  return NextResponse.json({ atualizados: r.count });
}
