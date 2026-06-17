export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { notifyMovimentacao } from "@/lib/notify-estoque";
import { assertItensPermitidosNosLocais, CategoriaLocalInvalidaError, respostaCategoriaInvalida } from "@/lib/estoque-categoria";

const postSchema = z.object({
  itemId:        z.string(),
  localEstoqueId: z.string().optional().nullable(),
  tipo:          z.enum(["ENTRADA", "SAIDA", "AJUSTE", "TRANSFERENCIA"]),
  quantidade:    z.coerce.number().min(0.001),
  documento:     z.string().optional(),
  observacoes:   z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { itemId, localEstoqueId, tipo, quantidade, documento, observacoes } = parsed.data;

  // Trava de categoria: produto só entra em local que aceite sua categoria.
  if (tipo === "ENTRADA" && localEstoqueId) {
    try {
      await assertItensPermitidosNosLocais(prisma, [{ itemId, localEstoqueId }]);
    } catch (e) {
      if (e instanceof CategoriaLocalInvalidaError) return respostaCategoriaInvalida(e);
      throw e;
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find the correct EstoqueItem — prefer the requested local, fall back to any
      let estoque = localEstoqueId
        ? await tx.estoqueItem.findFirst({ where: { itemId, localEstoqueId, clienteDonoId: null } })
        : await tx.estoqueItem.findFirst({ where: { itemId, clienteDonoId: null } });

      // If no stock record exists yet, create one for this location
      if (!estoque) {
        estoque = await tx.estoqueItem.create({
          data: {
            itemId,
            localEstoqueId: localEstoqueId ?? null,
            quantidadeAtual: 0,
            quantidadeMin:   0,
          },
        });
      }

      const saldoAntes  = parseFloat(estoque.quantidadeAtual.toString());
      const delta       = tipo === "SAIDA" ? -quantidade : quantidade;
      const saldoDepois = saldoAntes + delta;

      await tx.estoqueItem.update({
        where: { id: estoque.id },
        data:  { quantidadeAtual: saldoDepois },
      });

      return tx.movimentacaoEstoque.create({
        data: { itemId, tipo, quantidade, saldoAntes, saldoDepois, documento, observacoes },
        include: { item: { select: { codigo: true, descricao: true } } },
      });
    });

    // Notify Telegram (best-effort, outside transaction)
    prisma.estoqueItem.findFirst({
      where: {
        itemId,
        ...(localEstoqueId ? { localEstoqueId } : {}),
      },
      include: {
        localEstoque: { select: { nome: true } },
        item: { select: { unidadeMedida: true, unidade: { select: { sigla: true } } } },
      },
    }).then((estoqueAtual) => {
      notifyMovimentacao({
        tipo,
        itemDescricao: result.item.descricao,
        itemCodigo: result.item.codigo,
        quantidade,
        saldoDepois: parseFloat(String(result.saldoDepois ?? 0)),
        unidade: estoqueAtual?.item?.unidade?.sigla ?? estoqueAtual?.item?.unidadeMedida ?? "un",
        localNome: estoqueAtual?.localEstoque?.nome ?? null,
        documento,
        observacoes,
        quantidadeMin: estoqueAtual?.quantidadeMin != null ? parseFloat(String(estoqueAtual.quantidadeMin)) : null,
      });
    }).catch(() => {});

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || undefined;
  const tipo   = searchParams.get("tipo")   || undefined;
  const take   = Math.min(parseInt(searchParams.get("take") || "200"), 500);

  const movs = await prisma.movimentacaoEstoque.findMany({
    where: {
      ...(itemId ? { itemId }                    : {}),
      ...(tipo   ? { tipo: tipo as "ENTRADA" | "SAIDA" | "AJUSTE" | "TRANSFERENCIA" } : {}),
    },
    include: {
      item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ data: movs });
}
