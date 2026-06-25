export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/empresa/colaboradores/classificar
// Classificação de custo em massa (MOD/MOI/ADMIN) — define como cada colaborador
// é apropriado no fechamento da folha (MOD→PEP-MOD, MOI→CIF, ADMIN→Despesa).
const schema = z.object({
  ids: z.array(z.string()).min(1),
  classificacaoCusto: z.enum(["MOD", "MOI", "ADMIN"]).nullable(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { ids, classificacaoCusto } = body.data;
  const r = await prisma.colaborador.updateMany({ where: { id: { in: ids } }, data: { classificacaoCusto } });
  return NextResponse.json({ atualizados: r.count });
}
