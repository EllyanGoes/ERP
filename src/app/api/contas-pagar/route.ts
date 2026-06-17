export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contaPagarSchema } from "@/lib/validations/financeiro";
import { generateDocNumber } from "@/lib/utils";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { contabilizarTituloPagar } from "@/lib/contabilidade";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || "";

  const where: any = {
    AND: [
      status ? { status } : {},
      q ? { OR: [{ numero: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }] } : {},
    ],
  };

  const data = await prisma.contaPagar.findMany({
    where,
    include: { fornecedor: { select: { id: true, razaoSocial: true } } },
    orderBy: { dataVencimento: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = contaPagarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  // Parcelamento (Fase 2): nº de parcelas e intervalo (dias) lidos do corpo bruto.
  const parcelas = Math.max(1, Math.floor(Number(body.parcelas) || 1));
  const intervaloDias = Math.max(1, Math.floor(Number(body.intervaloDias) || 30));

  if (parcelas <= 1) {
    const seq = await prisma.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CP" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "CP", ultimo: 1 },
    });
    const conta = await prisma.contaPagar.create({
      data: {
        ...parsed.data,
        numero: generateDocNumber("CP", seq.ultimo),
        dataVencimento: new Date(parsed.data.dataVencimento),
      },
    });
    await contabilizarTituloPagar(conta.id).catch(() => {});
    return NextResponse.json({ data: conta }, { status: 201 });
  }

  const total = parsed.data.valorOriginal;
  const base = Math.floor((total / parcelas) * 100) / 100;
  const grupoParcelamentoId = crypto.randomUUID();
  const venc0 = new Date(parsed.data.dataVencimento);
  const { valorOriginal: _v, dataVencimento: _d, descricao, ...resto } = parsed.data;

  const contas = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CP" } },
      update: { ultimo: { increment: parcelas } },
      create: { prefixo: "CP", ultimo: parcelas },
    });
    const primeiro = seq.ultimo - parcelas + 1;
    const criadas = [];
    for (let i = 0; i < parcelas; i++) {
      const venc = new Date(venc0);
      venc.setDate(venc.getDate() + i * intervaloDias);
      const valor = i === parcelas - 1 ? total - base * (parcelas - 1) : base;
      criadas.push(
        await tx.contaPagar.create({
          data: {
            ...resto,
            descricao: `${descricao} (${i + 1}/${parcelas})`,
            numero: generateDocNumber("CP", primeiro + i),
            valorOriginal: valor,
            dataVencimento: venc,
            grupoParcelamentoId,
            parcelaNumero: i + 1,
            parcelaTotal: parcelas,
          },
        }),
      );
    }
    return criadas;
  });

  for (const conta of contas) await contabilizarTituloPagar(conta.id).catch(() => {});

  return NextResponse.json({ data: contas, grupoParcelamentoId }, { status: 201 });
}
