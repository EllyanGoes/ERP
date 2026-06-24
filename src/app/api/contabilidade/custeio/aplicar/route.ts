export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { calcularCusteio } from "@/lib/pcp/custeio-cif";
import { definirCustoEmpresa } from "@/lib/custo-empresa";
import { parseCompetencia } from "../route";

// Aplica o custo calculado (material + MOD + CIF) ao estoque de produto acabado:
// grava ItemCustoEmpresa.precoCusto de cada produto produzido → a contabilidade
// passa a valorar PA e CPV por esse custo.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const comp = parseCompetencia(typeof body.competencia === "string" ? body.competencia : null);
  const data = await calcularCusteio(EMPRESA_PADRAO_ID, comp);
  if (data.volumeTotalMilheiros <= 0) {
    return NextResponse.json({ error: "Sem volume de produção (entradas no PA) para ratear." }, { status: 400 });
  }
  let aplicados = 0;
  for (const p of data.produtos) {
    if (p.custoUnitario <= 0) continue;
    // Custo da empresa (CMPM por empresa) + cadastro global (Custo Médio do produto).
    await definirCustoEmpresa(prismaSemEscopo, EMPRESA_PADRAO_ID, p.itemId, p.custoUnitario);
    await prismaSemEscopo.item.update({ where: { id: p.itemId }, data: { precoCusto: p.custoUnitario } });
    aplicados += 1;
  }
  return NextResponse.json({ data, aplicados });
}
