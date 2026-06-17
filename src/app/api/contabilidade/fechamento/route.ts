export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma, empresasDoEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { fecharExercicio, previewEncerramento } from "@/lib/contabilidade";

// GET → lista de fechamentos; ou preview do resultado (?preview=1&exercicio=YYYY).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  if (searchParams.get("preview")) {
    const exercicio = parseInt(searchParams.get("exercicio") ?? "", 10);
    if (Number.isNaN(exercicio)) return NextResponse.json({ error: "Exercício inválido" }, { status: 400 });
    const [empresaId] = await empresasDoEscopo();
    return NextResponse.json({ data: await previewEncerramento(empresaId, exercicio) });
  }

  const fechamentos = await prisma.fechamentoContabil.findMany({ orderBy: { exercicio: "desc" } });
  return NextResponse.json({ data: fechamentos });
}

// POST { exercicio } → encerra o exercício na empresa ativa.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const exercicio = parseInt(String(body.exercicio ?? ""), 10);
  if (Number.isNaN(exercicio) || exercicio < 2000 || exercicio > 2100) {
    return NextResponse.json({ error: "Exercício inválido" }, { status: 400 });
  }

  const [empresaId] = await empresasDoEscopo();
  try {
    const r = await fecharExercicio(empresaId, exercicio);
    return NextResponse.json({ data: r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
