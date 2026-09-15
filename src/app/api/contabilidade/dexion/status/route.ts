export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { dexionStatus, getDexionConfig, dexionConfigurado } from "@/lib/dexion";
import { guardDexion, erroDexion } from "../_shared";

// GET /api/contabilidade/dexion/status — testa a conexão (versão do engine e nº de tabelas).
export async function GET() {
  const g = await guardDexion();
  if (!g.ok) return g.response;
  const c = await getDexionConfig();
  if (!dexionConfigurado(c)) return NextResponse.json({ data: { configurado: false } });
  try {
    const s = await dexionStatus();
    return NextResponse.json({ data: { configurado: true, conectado: true, ...s, host: c.host, port: c.port } });
  } catch (e) {
    return erroDexion(e);
  }
}
