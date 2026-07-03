export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";

// GET /api/cron/limpar-lixeira — retenção da Lixeira: apaga snapshots com mais
// de 90 dias (restaurados inclusive — são só rastro). Chamado pelo Vercel Cron
// (vercel.json); exige CRON_SECRET como os demais crons.
const RETENCAO_DIAS = Number(process.env.LIXEIRA_RETENCAO_DIAS ?? 90);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const limite = new Date(Date.now() - RETENCAO_DIAS * 86400000);
  const r = await prismaSemEscopo.lixeira.deleteMany({ where: { createdAt: { lt: limite } } });
  return NextResponse.json({ ok: true, removidos: r.count, retencaoDias: RETENCAO_DIAS });
}
