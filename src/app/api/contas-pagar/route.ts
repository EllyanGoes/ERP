export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contaPagarSchema } from "@/lib/validations/financeiro";
import { generateSimpleDocNumber } from "@/lib/utils";
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

  // Split de naturezas (classificação na criação): soma deve bater com o valor
  // do título e só naturezas ATIVAS entram em lançamento novo.
  const { naturezas: splitNaturezas, ...dados } = parsed.data;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (splitNaturezas && splitNaturezas.length > 0) {
    const soma = r2(splitNaturezas.reduce((s, n) => s + n.valor, 0));
    if (Math.abs(soma - dados.valorOriginal) > 0.05) {
      return NextResponse.json({ error: `A soma das naturezas (R$ ${soma.toFixed(2)}) deve bater com o valor do título (R$ ${dados.valorOriginal.toFixed(2)}).` }, { status: 422 });
    }
  }
  {
    const { validarNaturezasAtivas } = await import("@/lib/natureza-sistema");
    const erroNat = await validarNaturezasAtivas(prisma, [dados.naturezaFinanceiraId, ...(splitNaturezas ?? []).map((n) => n.naturezaFinanceiraId)]);
    if (erroNat) return NextResponse.json({ error: erroNat }, { status: 422 });
  }

  // Parcelamento (Fase 2): nº de parcelas e intervalo (dias) lidos do corpo bruto.
  const parcelas = Math.max(1, Math.floor(Number(body.parcelas) || 1));
  const intervaloDias = Math.max(1, Math.floor(Number(body.intervaloDias) || 30));

  // Split de uma parcela: valores proporcionais ao rateio informado, com o
  // centavo de ajuste na última linha (a soma de cada parcela fecha exata).
  const splitDaParcela = (valorParcela: number) => {
    if (!splitNaturezas || splitNaturezas.length === 0) return [];
    const total = r2(splitNaturezas.reduce((s, n) => s + n.valor, 0));
    if (!(total > 0)) return [];
    const linhas = splitNaturezas.map((n) => ({ ...n, valor: r2((n.valor * valorParcela) / total) }));
    const somaPrevias = r2(linhas.slice(0, -1).reduce((s, n) => s + n.valor, 0));
    linhas[linhas.length - 1].valor = r2(valorParcela - somaPrevias);
    return linhas.filter((n) => n.valor > 0);
  };

  if (parcelas <= 1) {
    const seq = await prisma.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CP" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "CP", ultimo: 1 },
    });
    const conta = await prisma.contaPagar.create({
      data: {
        ...dados,
        numero: generateSimpleDocNumber("CP", seq.ultimo),
        dataVencimento: new Date(dados.dataVencimento),
        naturezas: splitNaturezas?.length
          ? { create: splitNaturezas.map((n) => ({ naturezaFinanceiraId: n.naturezaFinanceiraId, detalhamento: n.detalhamento?.trim() || null, valor: n.valor })) }
          : undefined,
      },
    });
    await contabilizarTituloPagar(conta.id).catch((e) => console.error("[contas-pagar] contabilizar:", e));
    return NextResponse.json({ data: conta }, { status: 201 });
  }

  const total = dados.valorOriginal;
  const base = Math.floor((total / parcelas) * 100) / 100;
  const grupoParcelamentoId = crypto.randomUUID();
  const venc0 = new Date(dados.dataVencimento);
  const { valorOriginal: _v, dataVencimento: _d, descricao, ...resto } = dados;

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
      const splitParcela = splitDaParcela(r2(valor));
      criadas.push(
        await tx.contaPagar.create({
          data: {
            ...resto,
            descricao: `${descricao} (${i + 1}/${parcelas})`,
            numero: generateSimpleDocNumber("CP", primeiro + i),
            valorOriginal: valor,
            dataVencimento: venc,
            grupoParcelamentoId,
            parcelaNumero: i + 1,
            parcelaTotal: parcelas,
            naturezas: splitParcela.length
              ? { create: splitParcela.map((n) => ({ naturezaFinanceiraId: n.naturezaFinanceiraId, detalhamento: n.detalhamento?.trim() || null, valor: n.valor })) }
              : undefined,
          },
        }),
      );
    }
    return criadas;
  });

  for (const conta of contas) await contabilizarTituloPagar(conta.id).catch((e) => console.error("[contas-pagar] contabilizar:", e));

  return NextResponse.json({ data: contas, grupoParcelamentoId }, { status: 201 });
}
