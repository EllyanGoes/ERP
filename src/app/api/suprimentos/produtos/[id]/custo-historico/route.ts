export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

// GET /api/suprimentos/produtos/[id]/custo-historico
// Série temporal do custo de produção (material + MOD + CIF) por competência,
// gravada a cada aplicação do Custeio. Usada na aba "Custo de Produção" do produto.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("suprimentos");
  if (!auth.ok) return auth.response;

  const linhas = await prismaSemEscopo.itemCustoHistorico.findMany({
    where: { empresaId: EMPRESA_PADRAO_ID, itemId: params.id },
    orderBy: { competencia: "asc" },
    select: {
      competencia: true, materialMilheiro: true, modMilheiro: true,
      cifMilheiro: true, custoUnitario: true, updatedAt: true,
    },
  });

  const historico = linhas.map((l) => ({
    competencia: l.competencia.toISOString(),
    materialMilheiro: Number(l.materialMilheiro),
    modMilheiro: Number(l.modMilheiro),
    cifMilheiro: Number(l.cifMilheiro),
    custoMilheiro: Number(l.custoUnitario) * 1000,
    custoUnitario: Number(l.custoUnitario),
    atualizadoEm: l.updatedAt.toISOString(),
  }));

  return NextResponse.json({ historico });
}
