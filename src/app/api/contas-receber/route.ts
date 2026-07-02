export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contaReceberSchema } from "@/lib/validations/financeiro";
import { generateDocNumber } from "@/lib/utils";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { espelharContaReceber } from "@/lib/intragrupo";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { contabilizarTituloReceber } from "@/lib/contabilidade";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || "";

  const where: any = {
    AND: [
      status ? { status } : {},
      q ? { OR: [{ numero: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }, { cliente: { razaoSocial: { contains: q, mode: "insensitive" } } }] } : {},
    ],
  };

  const data = await prisma.contaReceber.findMany({
    where,
    include: { cliente: { select: { id: true, razaoSocial: true } } },
    orderBy: { dataVencimento: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = contaReceberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  // Parcelamento (Fase 2): nº de parcelas e intervalo (dias) lidos do corpo bruto.
  const parcelas = Math.max(1, Math.floor(Number(body.parcelas) || 1));
  const intervaloDias = Math.max(1, Math.floor(Number(body.intervaloDias) || 30));
  const pedidoVendaId = (body.pedidoVendaId as string) ?? null;

  // Regra: o cliente do título segue o cliente do pedido. Quando o título nasce
  // de um pedido, o cliente do pedido prevalece sobre o informado no corpo.
  if (pedidoVendaId) {
    const pedido = await prisma.pedidoVenda.findUnique({ where: { id: pedidoVendaId }, select: { clienteId: true } });
    if (pedido) parsed.data.clienteId = pedido.clienteId;
  }

  if (parcelas <= 1) {
    const seq = await prisma.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CR" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "CR", ultimo: 1 },
    });
    const conta = await prisma.contaReceber.create({
      data: {
        ...parsed.data,
        numero: generateDocNumber("CR", seq.ultimo),
        dataVencimento: new Date(parsed.data.dataVencimento),
        pedidoVendaId,
      },
    });
    // Intragrupo: cliente do grupo → espelha como conta a pagar na compradora
    await espelharContaReceber(conta.id);
    await contabilizarTituloReceber(conta.id).catch((e) => console.error("[contas-receber] contabilizar:", e));
    if (pedidoVendaId) await recomputarStatusPedido(prisma, pedidoVendaId);
    return NextResponse.json({ data: conta }, { status: 201 });
  }

  // Divide o total entre as parcelas (última absorve o arredondamento).
  const total = parsed.data.valorOriginal;
  const base = Math.floor((total / parcelas) * 100) / 100;
  const grupoParcelamentoId = crypto.randomUUID();
  const venc0 = new Date(parsed.data.dataVencimento);
  const { valorOriginal: _v, dataVencimento: _d, descricao, ...resto } = parsed.data;

  const contas = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CR" } },
      update: { ultimo: { increment: parcelas } },
      create: { prefixo: "CR", ultimo: parcelas },
    });
    const primeiro = seq.ultimo - parcelas + 1;
    const criadas = [];
    for (let i = 0; i < parcelas; i++) {
      const venc = new Date(venc0);
      venc.setDate(venc.getDate() + i * intervaloDias);
      const valor = i === parcelas - 1 ? total - base * (parcelas - 1) : base;
      criadas.push(
        await tx.contaReceber.create({
          data: {
            ...resto,
            descricao: `${descricao} (${i + 1}/${parcelas})`,
            numero: generateDocNumber("CR", primeiro + i),
            valorOriginal: valor,
            dataVencimento: venc,
            grupoParcelamentoId,
            parcelaNumero: i + 1,
            parcelaTotal: parcelas,
            pedidoVendaId,
          },
        }),
      );
    }
    return criadas;
  });

  // Intragrupo: cliente do grupo → espelha cada parcela como conta a pagar
  for (const conta of contas) await espelharContaReceber(conta.id);
  for (const conta of contas) await contabilizarTituloReceber(conta.id).catch((e) => console.error("[contas-receber] contabilizar:", e));
  if (pedidoVendaId) await recomputarStatusPedido(prisma, pedidoVendaId);

  return NextResponse.json({ data: contas, grupoParcelamentoId }, { status: 201 });
}
