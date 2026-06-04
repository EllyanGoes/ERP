export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Criticidade } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Define a config local de um ativo do Engeman (mapeado por CODAPL). Aceita:
//   { criticidade: "A"|"B"|"C"|null, tag?, descricao?, classificadoPor? }  e/ou
//   { regimeHorasDia: number|null }   (horas de operação por dia; null = padrão 24h)
// null/"" em cada campo remove o respectivo registro.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { codApl: string } },
) {
  const codApl = Number(params.codApl);
  if (!Number.isInteger(codApl) || codApl <= 0) {
    return NextResponse.json({ error: "codApl inválido" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    criticidade?: unknown;
    tag?: unknown;
    descricao?: unknown;
    classificadoPor?: unknown;
    regimeHorasDia?: unknown;
  } | null;

  if (!body || (!("criticidade" in body) && !("regimeHorasDia" in body))) {
    return NextResponse.json(
      { error: "Informe 'criticidade' e/ou 'regimeHorasDia'" },
      { status: 400 },
    );
  }

  // ── Criticidade ───────────────────────────────────────────────────────────
  if ("criticidade" in body) {
    const crit = body.criticidade;
    if (crit === null || crit === "") {
      await prisma.ativoCriticidade.deleteMany({ where: { codApl } });
    } else if (crit === "A" || crit === "B" || crit === "C") {
      const valor = crit as Criticidade;
      const tag = trimOrNull(body.tag);
      const descricao = trimOrNull(body.descricao);
      const classificadoPor = trimOrNull(body.classificadoPor);
      await prisma.ativoCriticidade.upsert({
        where: { codApl },
        create: { codApl, criticidade: valor, tag, descricao, classificadoPor },
        update: { criticidade: valor, tag, descricao, classificadoPor },
      });
    } else {
      return NextResponse.json(
        { error: "Criticidade inválida (use A, B, C ou null)" },
        { status: 400 },
      );
    }
  }

  // ── Regime de operação (horas/dia) ──────────────────────────────────────────
  if ("regimeHorasDia" in body) {
    const h = body.regimeHorasDia;
    if (h === null || h === "") {
      await prisma.ativoRegime.deleteMany({ where: { codApl } });
    } else {
      const horas = Number(h);
      if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
        return NextResponse.json(
          { error: "regimeHorasDia deve ser um número entre 0 e 24" },
          { status: 400 },
        );
      }
      await prisma.ativoRegime.upsert({
        where: { codApl },
        create: { codApl, horasPorDia: horas },
        update: { horasPorDia: horas },
      });
    }
  }

  // Estado atual após as alterações.
  const [crit, reg] = await Promise.all([
    prisma.ativoCriticidade.findUnique({ where: { codApl }, select: { criticidade: true } }),
    prisma.ativoRegime.findUnique({ where: { codApl }, select: { horasPorDia: true } }),
  ]);

  return NextResponse.json({
    data: {
      codApl,
      criticidade: crit?.criticidade ?? null,
      regimeHorasDia: reg?.horasPorDia ?? null,
    },
  });
}
