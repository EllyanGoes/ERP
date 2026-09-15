export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { guardDexion } from "../_shared";

// GET /api/contabilidade/dexion/de-para?empresaId — De-Para conta Dexion → conta do ERP
export async function GET(req: NextRequest) {
  const g = await guardDexion(req.nextUrl.searchParams.get("empresaId"));
  if (!g.ok) return g.response;
  const data = await prismaSemEscopo.dexionDePara.findMany({
    where: { empresaId: g.empresaId },
    select: { id: true, contaDexion: true, contaContabilId: true, contaContabil: { select: { codigo: true, nome: true } } },
    orderBy: { contaDexion: "asc" },
  });
  return NextResponse.json({ data });
}

// POST { empresaId, contaDexion, contaContabilId | null } — null remove o vínculo
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const g = await guardDexion(body.empresaId);
  if (!g.ok) return g.response;
  const contaDexion = String(body.contaDexion ?? "").trim();
  if (!contaDexion) return NextResponse.json({ error: "Informe a conta do Dexion." }, { status: 400 });
  if (!body.contaContabilId) {
    await prismaSemEscopo.dexionDePara.deleteMany({ where: { empresaId: g.empresaId, contaDexion } });
    return NextResponse.json({ ok: true, removido: true });
  }
  const conta = await prismaSemEscopo.contaContabil.findFirst({ where: { id: String(body.contaContabilId), empresaId: g.empresaId }, select: { id: true } });
  if (!conta) return NextResponse.json({ error: "Conta do ERP não encontrada nesta empresa." }, { status: 400 });
  const data = await prismaSemEscopo.dexionDePara.upsert({
    where: { empresaId_contaDexion: { empresaId: g.empresaId, contaDexion } },
    update: { contaContabilId: conta.id },
    create: { empresaId: g.empresaId, contaDexion, contaContabilId: conta.id },
  });
  return NextResponse.json({ data });
}
