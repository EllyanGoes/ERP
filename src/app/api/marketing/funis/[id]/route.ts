export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { funilUpdateSchema, type FunilNoData } from "@/lib/validations/marketing-funil";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const funil = await prisma.funil.findUnique({
    where: { id: params.id },
    include: { nos: { where: { ativo: true } } },
  });
  if (!funil || !funil.ativo) {
    return NextResponse.json({ error: "Funil não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: funil });
}

// Subconjunto do node.data que vira FunilNo.config — só o que interessa para
// matching de métricas (o desenho completo continua no canvas).
function configDoNode(data: FunilNoData): Prisma.InputJsonValue {
  const config: Record<string, unknown> = {};
  const chaves = [
    "plataforma",
    "campanhaId",
    "urlPatterns",
    "eventoNome",
    "etapaLeadId",
    "vinculoErp",
    "valorMedio",
  ] as const;
  for (const chave of chaves) {
    if (data[chave] !== undefined) config[chave] = data[chave];
  }
  return config as Prisma.InputJsonValue;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = funilUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existe = await prisma.funil.findUnique({ where: { id: params.id }, select: { id: true, ativo: true } });
  if (!existe || !existe.ativo) {
    return NextResponse.json({ error: "Funil não encontrado" }, { status: 404 });
  }

  const d = parsed.data;
  const meta: Record<string, unknown> = {};
  if (d.nome !== undefined) meta.nome = d.nome;
  if (d.descricao !== undefined) meta.descricao = d.descricao;
  if (d.status !== undefined) meta.status = d.status;
  if (d.forecast !== undefined) meta.forecast = d.forecast === null ? Prisma.DbNull : d.forecast;

  if (d.canvas) {
    const canvas = d.canvas;
    // Save do canvas sincroniza o espelho FunilNo na mesma transação:
    // upsert por (funilId, noId) e soft-delete dos nós removidos do desenho
    // (preserva métricas históricas).
    await prisma.$transaction(async (tx) => {
      await tx.funil.update({
        where: { id: params.id },
        data: { ...meta, canvas: canvas as unknown as Prisma.InputJsonValue },
      });
      for (const node of canvas.nodes) {
        await tx.funilNo.upsert({
          where: { funilId_noId: { funilId: params.id, noId: node.id } },
          create: {
            funilId: params.id,
            noId: node.id,
            tipo: node.data.tipo,
            rotulo: node.data.rotulo,
            config: configDoNode(node.data),
            ativo: true,
          },
          update: {
            tipo: node.data.tipo,
            rotulo: node.data.rotulo,
            config: configDoNode(node.data),
            ativo: true,
          },
        });
      }
      await tx.funilNo.updateMany({
        where: { funilId: params.id, noId: { notIn: canvas.nodes.map((n) => n.id) } },
        data: { ativo: false },
      });
    });
  } else if (Object.keys(meta).length) {
    await prisma.funil.update({ where: { id: params.id }, data: meta });
  }

  const funil = await prisma.funil.findUnique({
    where: { id: params.id },
    include: { nos: { where: { ativo: true } } },
  });
  return NextResponse.json({ data: funil });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const existe = await prisma.funil.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Funil não encontrado" }, { status: 404 });

  await prisma.funil.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { id: params.id } });
}
