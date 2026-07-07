export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { reconciliarEstoqueAoFisico } from "@/lib/contabilidade";

// Reconcilia o saldo contábil dos locais de estoque ao físico (Σ qtd × CMPM),
// lançando sobra/perda por local. Só ADMIN — mexe no resultado. Produto Acabado /
// WIP ficam de fora (custeio por absorção via PCP).
export async function POST() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem reconciliar o estoque contábil" }, { status: 403 });
  }

  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  // criadoPor é campo de exibição (nome), não id — o cron passa "cron" aqui.
  const resultados = await reconciliarEstoqueAoFisico(empresaId, { criadoPor: auth.session.nome ?? null });

  const ajustados = resultados.filter((r) => r.tipo !== "ok");
  return NextResponse.json({
    data: resultados,
    resumo: {
      locaisAvaliados: resultados.length,
      locaisAjustados: ajustados.length,
      totalAjuste: Math.round(ajustados.reduce((s, r) => s + r.ajuste, 0) * 100) / 100,
    },
  });
}
