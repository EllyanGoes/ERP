export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prazosDaAgenda } from "@/lib/processos-agenda";
import { tokenFeedProcessos } from "@/lib/processos-externo";

// GET /api/processos/agenda?meus=1 — prazos pendentes dos processos abertos que o usuário vê
// (empresa ativa) + as URLs do feed ICS (todos / só os meus) para Mac/Google.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const meus = req.nextUrl.searchParams.get("meus") === "1";
  const empresaIds = auth.session.activeEmpresaId ? [auth.session.activeEmpresaId] : undefined;
  const data = (await prazosDaAgenda(auth.session.sub, { meus, empresaIds })) ?? [];
  const base = `${req.nextUrl.origin}/api/processos/agenda/ics?u=${auth.session.sub}&t=${tokenFeedProcessos(auth.session.sub)}`;
  return NextResponse.json({ data, icsUrl: base, icsUrlMeus: `${base}&meus=1` });
}
