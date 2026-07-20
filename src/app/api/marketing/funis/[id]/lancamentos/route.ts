export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lancamentoManualSchema } from "@/lib/validations/marketing-funil";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const noId = searchParams.get("noId") || undefined;

  const lancamentos = await prisma.lancamentoManualMetrica.findMany({
    where: { funilId: params.id, ...(noId ? { noId } : {}) },
    orderBy: { dataInicio: "desc" },
  });
  return NextResponse.json({ data: lancamentos });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = lancamentoManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const funil = await prisma.funil.findUnique({ where: { id: params.id }, select: { id: true, ativo: true } });
  if (!funil || !funil.ativo) {
    return NextResponse.json({ error: "Funil não encontrado" }, { status: 404 });
  }

  const d = parsed.data;
  const lancamento = await prisma.lancamentoManualMetrica.create({
    data: {
      funilId: params.id,
      noId: d.noId,
      dataInicio: new Date(d.dataInicio),
      dataFim: new Date(d.dataFim),
      visitantes: d.visitantes ?? null,
      leads: d.leads ?? null,
      conversoes: d.conversoes ?? null,
      receita: d.receita ?? null,
      observacao: d.observacao || null,
    },
  });

  return NextResponse.json({ data: lancamento }, { status: 201 });
}
