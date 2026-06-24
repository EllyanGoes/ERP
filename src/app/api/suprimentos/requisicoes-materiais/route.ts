export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

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
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    if (!body.localEstoqueId) {
      return NextResponse.json({ error: "Almoxarifado é obrigatório" }, { status: 400 });
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
          colaboradorId: body.colaboradorId  || null,
          setorId:       body.setorId        || null,
          almoxarifeId:  body.almoxarifeId   || null,
          os:            body.os?.trim()     || null,
          centroCustoId: body.centroCustoId  || null,
          naturezaFinanceiraId: body.naturezaFinanceiraId || null,
          contaContabil: body.contaContabil?.trim() || null,
          data:          body.data ? new Date(body.data) : new Date(),
          observacoes:   body.observacoes?.trim() || null,
          itens: body.itens?.length > 0 ? {
            create: body.itens.map((it: {
              itemId: string; quantidade: number; unidade?: string;
              localizacao?: string; centroCustoId?: string; contaContabil?: string;
              os?: string; requisicaoRef?: string;
            }) => ({
              itemId:       it.itemId,
              quantidade:   parseFloat(String(it.quantidade)),
              unidade:      it.unidade?.trim()       || null,
              localizacao:  it.localizacao?.trim()   || null,
              centroCustoId: it.centroCustoId        || null,
              contaContabil: it.contaContabil?.trim() || null,
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
