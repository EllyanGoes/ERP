export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { vincularNaturezaConta } from "@/lib/conta-contabil";
import { z } from "zod";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;

const schema = z.object({
  nome: z.string().min(1).optional(),
  tipo: z.enum(["ENTRADA", "SAIDA"]).optional(),
  grupo: z.enum(GRUPOS).optional(),
  subgrupoId: z.string().optional().nullable(),
  contaContabilId: z.string().optional().nullable(),
  contaContrapartidaId: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
  cif: z.boolean().optional(),
  destinoSugerido: z.enum(["PEP_MD", "IMOBILIZADO", "CIF", "DESPESA"]).optional().nullable(),
  aplicavelRequisicao: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });

  const { subgrupoId, contaContabilId, contaContrapartidaId, ...rest } = parsed.data;
  const data = await prisma.naturezaFinanceira.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(subgrupoId !== undefined ? { subgrupoId: subgrupoId || null } : {}),
      ...(contaContrapartidaId !== undefined ? { contaContrapartidaId: contaContrapartidaId || null } : {}),
    },
  });
  if (contaContabilId) await vincularNaturezaConta(data.empresaId, data.id, contaContabilId).catch((e) => console.error("[financeiro/naturezas] contabilizar:", e));
  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  // Em uso? inativa em vez de excluir (FK SetNull preservaria os títulos, mas o
  // padrão do projeto é inativar cadastros usados).
  const usos = await prisma.contaReceber.count({ where: { naturezaFinanceiraId: params.id } })
    + await prisma.contaPagar.count({ where: { naturezaFinanceiraId: params.id } });
  if (usos > 0) {
    await prisma.naturezaFinanceira.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { ok: true, inativada: true } });
  }
  await prisma.naturezaFinanceira.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
