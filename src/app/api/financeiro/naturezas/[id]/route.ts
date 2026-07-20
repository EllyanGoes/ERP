export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { vincularNaturezaConta } from "@/lib/conta-contabil";
import { z } from "zod";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO", "MOVIMENTACAO_INTERNA"] as const;

const schema = z.object({
  codigo: z.string().optional().nullable(),
  nome: z.string().min(1).optional(),
  tipo: z.enum(["ENTRADA", "SAIDA", "AMBOS"]).optional(),
  grupo: z.enum(GRUPOS).optional(),
  afetaResultado: z.boolean().optional(),
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

  // Natureza TRAVADA do sistema (encargos da baixa): o motor a referencia por
  // sistemaChave — mudar tipo/grupo/contrapartida/cif quebraria a contabilização
  // dos encargos. Nome/descrição/subgrupo continuam livres.
  const alvo = await prisma.naturezaFinanceira.findUnique({ where: { id: params.id }, select: { sistema: true } });
  if (!alvo) return NextResponse.json({ error: "Natureza não encontrada" }, { status: 404 });
  if (alvo.sistema) {
    const bloqueados = (["tipo", "grupo", "contaContrapartidaId", "cif", "ativo"] as const)
      .filter((k) => parsed.data[k] !== undefined);
    if (bloqueados.length > 0) {
      return NextResponse.json({ error: `Natureza travada do sistema — não é possível alterar: ${bloqueados.join(", ")}.` }, { status: 422 });
    }
  }

  const { subgrupoId, contaContabilId, contaContrapartidaId, codigo, ...rest } = parsed.data;
  const data = await prisma.naturezaFinanceira.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(codigo !== undefined ? { codigo: codigo?.trim() || null } : {}),
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

  // Natureza travada do sistema nunca é excluída nem inativada (o motor depende dela).
  const alvo = await prisma.naturezaFinanceira.findUnique({ where: { id: params.id }, select: { sistema: true } });
  if (alvo?.sistema) {
    return NextResponse.json({ error: "Natureza travada do sistema — não pode ser excluída." }, { status: 422 });
  }

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
