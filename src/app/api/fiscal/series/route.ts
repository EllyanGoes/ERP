export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ModeloDocFiscal } from "@prisma/client";

const MODELOS = new Set(["NFE", "NFCE", "NFSE", "CTE", "MDFE"]);

export async function GET() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const series = await prisma.serieFiscal.findMany({
    orderBy: [{ modelo: "asc" }, { serie: "asc" }, { ambiente: "asc" }],
  });
  return NextResponse.json(series);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const modelo = String(body.modelo ?? "NFE");
  const serie = Number(body.serie);
  const proximoNumero = Number(body.proximoNumero ?? 1);
  const ambiente = body.ambiente === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";

  if (!MODELOS.has(modelo)) return NextResponse.json({ error: "Modelo inválido" }, { status: 400 });
  if (!Number.isInteger(serie) || serie < 1 || serie > 999) {
    return NextResponse.json({ error: "Série deve ser um inteiro entre 1 e 999" }, { status: 400 });
  }
  if (!Number.isInteger(proximoNumero) || proximoNumero < 1) {
    return NextResponse.json({ error: "Próximo número deve ser um inteiro ≥ 1" }, { status: 400 });
  }

  try {
    const criada = await prisma.serieFiscal.create({
      data: { modelo: modelo as ModeloDocFiscal, serie, ambiente, proximoNumero },
    });
    return NextResponse.json(criada, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Série já cadastrada para este modelo/ambiente" }, { status: 409 });
    }
    throw e;
  }
}
