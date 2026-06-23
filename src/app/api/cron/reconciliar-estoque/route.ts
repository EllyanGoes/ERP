export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { reconciliarEstoqueAoFisico } from "@/lib/contabilidade";

// Limite do modo automático: divergência por local acima disso NÃO é lançada —
// é sinalizada p/ revisão (deslocação/erro estrutural, não drift de custeio).
// Ajustável por env. Drift normal (ex.: revaloração de saldo) fica abaixo.
const LIMITE_AUTO = Number(process.env.RECONCILIA_ESTOQUE_LIMITE ?? 20000);

/**
 * GET /api/cron/reconciliar-estoque
 *
 * Chamado pelo Vercel Cron (ver vercel.json). Reconcilia o saldo CONTÁBIL de cada
 * local de estoque ao FÍSICO (Σ qtd × CMPM) em todas as empresas, lançando
 * sobra/perda automaticamente quando a divergência é pequena (drift de custeio).
 * Produto Acabado / WIP ficam de fora (custeio por absorção via PCP). Divergências
 * grandes (> LIMITE_AUTO) são apenas sinalizadas no retorno, não lançadas.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true, razaoSocial: true, nomeFantasia: true } });
    const data = new Date();
    const porEmpresa: Record<string, unknown> = {};
    let totalAjustado = 0;
    const aRevisar: { empresa: string; local: string; fisico: number; contabil: number; diff: number }[] = [];

    for (const emp of empresas) {
      const res = await reconciliarEstoqueAoFisico(emp.id, { data, criadoPor: "cron", limiteAuto: LIMITE_AUTO });
      const ajustados = res.filter((r) => r.tipo === "sobra" || r.tipo === "perda");
      const revisar = res.filter((r) => r.tipo === "revisar");
      totalAjustado += ajustados.length;
      const empNome = emp.nomeFantasia ?? emp.razaoSocial;
      for (const r of revisar) {
        aRevisar.push({ empresa: empNome, local: r.localNome, fisico: r.fisico, contabil: r.contabilAntes, diff: r.ajuste });
      }
      porEmpresa[emp.id] = { ajustados: ajustados.length, aRevisar: revisar.length };
    }

    return NextResponse.json({ ok: true, totalAjustado, aRevisar, porEmpresa });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/reconciliar-estoque]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
