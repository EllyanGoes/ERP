export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { notifyMovimentacao } from "@/lib/notify-estoque";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { aplicarCmpmEmpresa } from "@/lib/custo-empresa";
import { respostaSaldoNegativo, SaldoNegativoError } from "@/lib/estoque-guard";
import { assertItensPermitidosNosLocais, CategoriaLocalInvalidaError, respostaCategoriaInvalida } from "@/lib/estoque-categoria";
import { contabilizarLoteMovimentacao } from "@/lib/contabilidade";

const itemSchema = z.object({
  itemId:         z.string().min(1),
  localEstoqueId: z.string().min(1),
  unidadeId:      z.string().optional().nullable(),
  quantidade:     z.coerce.number().min(0.001),
  valorUnitario:  z.coerce.number().min(0).optional(),
  observacoes:    z.string().optional(),
  localizacao:    z.string().optional().nullable(),
});

const postSchema = z.object({
  tipo:             z.enum(["ENTRADA", "SAIDA"]),
  documento:        z.string().optional(),
  observacoes:      z.string().optional(),
  fornecedorId:     z.string().optional().nullable(),
  // Dono da mercadoria: null/ausente = estoque próprio; preenchido = cliente
  // cuja mercadoria está sob guarda (estoque de terceiros)
  clienteDonoId:    z.string().optional().nullable(),
  dataMovimentacao: z.string().optional().nullable(), // ISO date string
  itens:            z.array(itemSchema).min(1, "Adicione ao menos um item"),
});

// ── POST — criar lote de movimentação ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors[0] ?? "Dados inválidos" },
      { status: 400 }
    );
  }

  const { tipo, documento, observacoes, fornecedorId, dataMovimentacao, itens } = parsed.data;
  const clienteDonoId = parsed.data.clienteDonoId || null;

  if (clienteDonoId) {
    const dono = await prisma.cliente.findUnique({ where: { id: clienteDonoId }, select: { id: true } });
    if (!dono) return NextResponse.json({ error: "Cliente proprietário não encontrado" }, { status: 400 });
    // Mercadoria de terceiro não tem custo para a empresa — valor unitário
    // entraria no CMPM por engano em manutenções futuras; melhor recusar.
    if (tipo === "ENTRADA" && itens.some((i) => i.valorUnitario && i.valorUnitario > 0)) {
      return NextResponse.json(
        { error: "Entrada de mercadoria de terceiro não aceita valor unitário (não compõe custo do estoque próprio)" },
        { status: 400 }
      );
    }
  }

  // ── Trava de saldo negativo (hard block) ───────────────────────────────────
  // Em SAÍDA, nenhuma movimentação pode deixar o saldo negativo. Não há mais
  // confirmação para "registrar mesmo assim": corrigir saldo é via inventário.
  if (tipo === "SAIDA") {
    // soma as quantidades por (item + local) — o mesmo item pode repetir em linhas
    const porChave = new Map<string, { itemId: string; localEstoqueId: string; qtd: number }>();
    for (const it of itens) {
      const k = `${it.itemId}|${it.localEstoqueId}`;
      const cur = porChave.get(k) ?? { itemId: it.itemId, localEstoqueId: it.localEstoqueId, qtd: 0 };
      cur.qtd += it.quantidade;
      porChave.set(k, cur);
    }
    const negativos: Array<{ itemId: string; descricao: string; saldoAtual: number; saldoDepois: number }> = [];
    for (const { itemId, localEstoqueId, qtd } of Array.from(porChave.values())) {
      const estoque = await prisma.estoqueItem.findFirst({
        where: { itemId, localEstoqueId, clienteDonoId },
        select: { quantidadeAtual: true, item: { select: { descricao: true } } },
      });
      const atual = estoque ? parseFloat(String(estoque.quantidadeAtual)) : 0;
      const depois = atual - qtd;
      if (depois < 0) {
        const it = estoque?.item ?? await prisma.item.findUnique({ where: { id: itemId }, select: { descricao: true } });
        negativos.push({ itemId, descricao: it?.descricao ?? itemId, saldoAtual: atual, saldoDepois: depois });
      }
    }
    if (negativos.length > 0) {
      return respostaSaldoNegativo(new SaldoNegativoError(negativos));
    }
  }

  // ── Trava de categoria do local (hard block, só na ENTRADA) ─────────────────
  // Produto só entra em local que aceite sua categoria. Local sem categorias
  // configuradas aceita tudo (legado). Saídas não são travadas.
  if (tipo === "ENTRADA") {
    try {
      await assertItensPermitidosNosLocais(
        prisma,
        itens.map((i) => ({ itemId: i.itemId, localEstoqueId: i.localEstoqueId })),
      );
    } catch (e) {
      if (e instanceof CategoriaLocalInvalidaError) return respostaCategoriaInvalida(e);
      throw e;
    }
  }

  try {
    const lote = await prisma.$transaction(async (tx) => {
      // Generate sequential number  MOV-YYYY-NNNN
      const year = new Date().getFullYear();
      const seq = await tx.sequencia.upsert({
        where:  { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "MOV" } },
        create: { prefixo: "MOV", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = `MOV-${year}-${String(seq.ultimo).padStart(4, "0")}`;

      // Create the lote header
      const lote = await tx.loteMovimentacao.create({
        data: {
          numero, tipo, documento, observacoes,
          dataMovimentacao: dataMovimentacao ? new Date(dataMovimentacao) : null,
        },
      });

      // Process each item
      for (const item of itens) {
        const { itemId, localEstoqueId, unidadeId, quantidade, valorUnitario, observacoes: obsItem, localizacao } = item;

        // Find or create EstoqueItem for this location
        let estoque = await tx.estoqueItem.findFirst({
          where: { itemId, localEstoqueId, clienteDonoId },
        });
        if (!estoque) {
          estoque = await tx.estoqueItem.create({
            data: { itemId, localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId },
          });
        }
        // Update localizacao if provided
        if (localizacao !== undefined && localizacao !== null) {
          await tx.estoqueItem.update({
            where: { id: estoque.id },
            data: { localizacao },
          });
        }

        // increment/decrement atômico: movimentações concorrentes do mesmo item
        // não perdem atualização; os saldos da linha derivam do valor pós-update.
        const delta      = tipo === "SAIDA" ? -quantidade : quantidade;
        const atualizado = await tx.estoqueItem.update({
          where: { id: estoque.id },
          data:  { quantidadeAtual: { increment: delta } },
        });
        const saldoDepois = parseFloat(atualizado.quantidadeAtual.toString());
        const saldoAntes  = saldoDepois - delta;

        // ── Custo Médio Ponderado Móvel (CMPM) ───────────────────────────────
        // On ENTRADA with a unit price, recalculate and persist precoCusto on Item.
        // Formula: new_cmp = (stock_before × old_cmp + qty × unit_price) / (stock_before + qty)
        if (tipo === "ENTRADA" && !clienteDonoId && valorUnitario && valorUnitario > 0) {
          const currentItem = await tx.item.findUnique({
            where: { id: itemId },
            select: { precoCusto: true },
          });
          const oldCusto = currentItem?.precoCusto
            ? parseFloat(currentItem.precoCusto.toString())
            : 0;
          // Sum all stock across locations for weighted average
          const allEstoque = await tx.estoqueItem.findMany({ where: { itemId, clienteDonoId: null } });
          const estoqueTotal = allEstoque.reduce(
            (s, e) => s + parseFloat(e.quantidadeAtual.toString()),
            0
          );
          // Use total stock before this movement (subtract the new qty already added)
          const baseSaldo = Math.max(estoqueTotal - quantidade, 0);
          const novoCusto = baseSaldo > 0
            ? (baseSaldo * oldCusto + quantidade * valorUnitario) / (baseSaldo + quantidade)
            : valorUnitario;

          await tx.item.update({
            where: { id: itemId },
            data:  { precoCusto: novoCusto },
          });

          // CMPM próprio da empresa dona do estoque — o cadastro do produto é
          // compartilhado no grupo, mas o custo não (fabricação numa empresa,
          // compra noutra).
          await aplicarCmpmEmpresa(tx, atualizado.empresaId, itemId, quantidade, valorUnitario);
        }

        await tx.movimentacaoEstoque.create({
          data: {
            itemId,
            localEstoqueId,
            clienteDonoId,
            unidadeId:    unidadeId ?? null,
            loteId:       lote.id,
            tipo,
            quantidade,
            valorUnitario: valorUnitario ?? null,
            saldoAntes,
            saldoDepois,
            documento,
            observacoes:  obsItem ?? observacoes,
          },
        });
      }

      // ── Auto-link supplier on ENTRADA ────────────────────────────────────────
      const autoVinculos: string[] = [];
      if (tipo === "ENTRADA" && fornecedorId && !clienteDonoId) {
        for (const item of itens) {
          const already = await tx.produtoFornecedor.findFirst({
            where: { itemId: item.itemId, fornecedorId },
          });
          if (!already) {
            await tx.produtoFornecedor.create({
              data: { itemId: item.itemId, fornecedorId },
            });
            const prod = await tx.item.findUnique({ where: { id: item.itemId }, select: { descricao: true } });
            if (prod) autoVinculos.push(prod.descricao);
          }
        }
      }

      const result = await tx.loteMovimentacao.findUnique({
        where: { id: lote.id },
        include: {
          itens: {
            include: {
              item:         { select: { id: true, codigo: true, descricao: true } },
              localEstoque: { select: { id: true, nome: true } },
              unidade:      { select: { id: true, sigla: true, nome: true } },
            },
          },
        },
      });
      return { lote: result, autoVinculos };
    });

    // Notify Telegram for each item (best-effort, outside transaction)
    if (lote.lote?.itens) {
      for (const movItem of lote.lote.itens) {
        const itemId = movItem.item.id;
        const localEstoqueId = movItem.localEstoqueId ?? undefined;
        prisma.estoqueItem.findFirst({
          where: { itemId, ...(localEstoqueId ? { localEstoqueId } : {}) },
          include: { localEstoque: { select: { nome: true } } },
        }).then((estoqueAtual) => {
          notifyMovimentacao({
            tipo,
            itemDescricao: movItem.item.descricao,
            itemCodigo: movItem.item.codigo,
            quantidade: parseFloat(String(movItem.quantidade)),
            saldoDepois: parseFloat(String(movItem.saldoDepois ?? 0)),
            unidade: movItem.unidade?.sigla ?? "un",
            localNome: movItem.localEstoque?.nome ?? estoqueAtual?.localEstoque?.nome ?? null,
            documento: lote.lote!.documento ?? lote.lote!.numero,
            observacoes: movItem.observacoes ?? undefined,
            quantidadeMin: estoqueAtual?.quantidadeMin != null ? parseFloat(String(estoqueAtual.quantidadeMin)) : null,
          });
        }).catch(() => {});
      }
    }

    // Contabiliza o lote (ajuste/sobra/perda ou transferência) — best-effort.
    if (lote.lote?.id) {
      await contabilizarLoteMovimentacao(lote.lote.id).catch(() => {});
    }

    return NextResponse.json({ data: lote.lote, autoVinculos: lote.autoVinculos }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET — listar movimentações (todas as origens) ────────────────────────────
// Queries MovimentacaoEstoque directly so movements from sales orders,
// purchase conferencing and manual batches all appear.
// Groups by loteId when present; standalone movements become single-item entries.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo      = searchParams.get("tipo")      || undefined;
  const dateFrom  = searchParams.get("dateFrom")  || undefined;
  const dateTo    = searchParams.get("dateTo")    || undefined;
  const take      = Math.min(parseInt(searchParams.get("take") || "500"), 1000);

  const where: Record<string, unknown> = {};
  if (tipo) where.tipo = tipo as "ENTRADA" | "SAIDA";
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) }                   : {}),
      ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59.999Z") }  : {}),
    };
  }

  try {
    const movs = await prisma.movimentacaoEstoque.findMany({
      where,
      include: {
        item:         { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
        localEstoque: { select: { id: true, nome: true } },
        clienteDono:  { select: { id: true, razaoSocial: true } },
        unidade:      { select: { id: true, sigla: true, nome: true } },
        lote:         { select: { id: true, numero: true, tipo: true, documento: true, observacoes: true, createdAt: true } },
        // expose origin fields so the UI can tell manual vs automatic
        pedidoVendaItem:  { select: { id: true } },
        conferenciaItem:  { select: { id: true } },
        vendaOrdem:       { select: { id: true, numero: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    // ── Group by loteId ──────────────────────────────────────────────────────
    // Lote-based: collapse multiple movements under one header.
    // Standalone (no loteId): each movement becomes its own single-item entry.

    type LoteOut = {
      id: string; numero: string; tipo: string;
      documento: string | null; observacoes: string | null;
      createdAt: string;
      itens: typeof movs;
    };

    const loteMap = new Map<string, LoteOut>();
    const standalone: LoteOut[] = [];

    for (const mov of movs) {
      if (mov.loteId && mov.lote) {
        if (!loteMap.has(mov.loteId)) {
          loteMap.set(mov.loteId, {
            id:          mov.lote.id,
            numero:      mov.lote.numero,
            tipo:        mov.lote.tipo,
            documento:   mov.lote.documento,
            observacoes: mov.lote.observacoes,
            createdAt:   mov.lote.createdAt.toISOString(),
            itens:       [],
          });
        }
        loteMap.get(mov.loteId)!.itens.push(mov);
      } else {
        // Standalone movement (e.g. from sales order or conferência)
        const label = mov.documento
          ? mov.documento
          : `MOV-${mov.id.slice(-6).toUpperCase()}`;
        standalone.push({
          id:          mov.id,
          numero:      label,
          tipo:        mov.tipo,
          documento:   mov.documento,
          observacoes: mov.observacoes,
          createdAt:   mov.createdAt.toISOString(),
          itens:       [mov],
        });
      }
    }

    // Merge and sort newest first
    const result = [...Array.from(loteMap.values()), ...standalone].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
