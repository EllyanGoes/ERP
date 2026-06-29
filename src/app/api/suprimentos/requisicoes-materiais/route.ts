export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { custosComFallback } from "@/lib/custo-empresa";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const localEstoqueId = searchParams.get("localEstoqueId");
  const status         = searchParams.get("status");
  const tipo           = searchParams.get("tipo");

  const data = await prisma.requisicaoMaterial.findMany({
    where: {
      AND: [
        localEstoqueId ? { localEstoqueId } : {},
        status ? { status: status as never } : {},
        tipo   ? { tipo:   tipo   as never } : {},
      ],
    },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      setor:        { select: { id: true, nome: true } },
      _count:       { select: { itens: true } },
      itens:        { select: { itemId: true, quantidade: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Valor total por requisição = Σ (qtd × custo do material na empresa, com fallback no CMPM global).
  const porEmpresa = new Map<string, Set<string>>();
  for (const r of data) {
    const s = porEmpresa.get(r.empresaId) ?? new Set<string>();
    for (const it of r.itens) s.add(it.itemId);
    porEmpresa.set(r.empresaId, s);
  }
  const custoPorEmpresa = new Map<string, Map<string, number>>();
  for (const [emp, ids] of Array.from(porEmpresa.entries())) {
    custoPorEmpresa.set(emp, await custosComFallback(prisma, emp, Array.from(ids)));
  }

  const result = data.map((r) => {
    const cm = custoPorEmpresa.get(r.empresaId) ?? new Map<string, number>();
    const valorTotal = r.itens.reduce((s, it) => s + parseFloat(String(it.quantidade)) * (cm.get(it.itemId) ?? 0), 0);
    const { itens: _itens, ...rest } = r;
    return { ...rest, valorTotal: Math.round(valorTotal * 100) / 100 };
  });
  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    if (!body.localEstoqueId) {
      return NextResponse.json({ error: "Almoxarifado é obrigatório" }, { status: 400 });
    }
    // Natureza financeira é obrigatória POR ITEM (define p/ onde o consumo vai no
    // resultado). O cabeçalho serve de fallback ("aplica a todos"). Devolução não tem.
    // Transferência (localDestino) também não: é realocação de estoque, não consumo.
    if ((body.tipo ?? "REQUISICAO") !== "DEVOLUCAO" && !body.localDestinoId) {
      const semNat = (body.itens ?? []).some((it: { naturezaFinanceiraId?: string }) => !(it.naturezaFinanceiraId || body.naturezaFinanceiraId));
      if (semNat) return NextResponse.json({ error: "Natureza financeira é obrigatória em cada item" }, { status: 400 });
      // Centro de custo também obrigatório por item (cabeçalho serve de fallback).
      const semCentro = (body.itens ?? []).some((it: { centroCustoId?: string }) => !(it.centroCustoId || body.centroCustoId));
      if (semCentro) return NextResponse.json({ error: "Centro de custo é obrigatório em cada item" }, { status: 400 });
    }

    const record = await prisma.$transaction(async (tx) => {
      const prefix = body.tipo === "DEVOLUCAO" ? "DV" : "RM";
      const seq = await tx.sequencia.upsert({
        where:  { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: prefix } },
        create: { prefixo: prefix, ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber(prefix, seq.ultimo);

      return tx.requisicaoMaterial.create({
        data: {
          numero,
          tipo:          body.tipo          || "REQUISICAO",
          status:        "RASCUNHO",
          localEstoqueId: body.localEstoqueId,
          localDestinoId: body.localDestinoId || null,
          colaboradorId: body.colaboradorId  || null,
          setorId:       body.setorId        || null,
          almoxarifeId:  body.almoxarifeId   || null,
          os:            body.os?.trim()     || null,
          centroCustoId: body.centroCustoId  || null,
          naturezaFinanceiraId: body.naturezaFinanceiraId || null,
          data:          body.data ? new Date(body.data) : new Date(),
          observacoes:   body.observacoes?.trim() || null,
          itens: body.itens?.length > 0 ? {
            create: body.itens.map((it: {
              itemId: string; quantidade: number; unidade?: string;
              localizacao?: string; centroCustoId?: string; naturezaFinanceiraId?: string;
              destinoManual?: string; os?: string; requisicaoRef?: string;
            }) => ({
              itemId:       it.itemId,
              quantidade:   parseFloat(String(it.quantidade)),
              unidade:      it.unidade?.trim()       || null,
              localizacao:  it.localizacao?.trim()   || null,
              centroCustoId: it.centroCustoId        || null,
              naturezaFinanceiraId: it.naturezaFinanceiraId || body.naturezaFinanceiraId || null,
              destinoManual: (it.destinoManual as never) || null,
              os:           it.os?.trim()            || null,
              requisicaoRef: it.requisicaoRef?.trim() || null,
            })),
          } : undefined,
        },
        include: { itens: true },
      });
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /requisicoes-materiais]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
