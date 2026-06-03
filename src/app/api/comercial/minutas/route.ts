export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

// ── GET /api/comercial/minutas ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pedidoVendaId = searchParams.get("pedidoVendaId");
    const status = searchParams.get("status");
    const dataFrom = searchParams.get("dataFrom");
    const dataTo = searchParams.get("dataTo");
    const semData = searchParams.get("semData"); // minutas sem dataEntrega (pendentes de agendamento)

    // Filtro por dataEntrega prevista (usado pela Agenda de Entregas).
    const dataEntregaFilter =
      semData === "true"
        ? { dataEntrega: null }
        : dataFrom || dataTo
        ? {
            dataEntrega: {
              ...(dataFrom ? { gte: new Date(dataFrom) } : {}),
              ...(dataTo ? { lte: new Date(dataTo) } : {}),
            },
          }
        : {};

    const minutas = await prisma.minuta.findMany({
      where: {
        ...(pedidoVendaId ? { pedidoVendaId } : {}),
        ...(status ? { status: status as never } : {}),
        ...dataEntregaFilter,
      },
      include: {
        pedidoVenda: {
          select: {
            id: true,
            numero: true,
            cliente: {
              select: {
                id: true,
                razaoSocial: true,
                nomeFantasia: true,
                cidade: true,
                bairro: true,
                logradouro: true,
                numero: true,
                estado: true,
                telefone: true,
                celular: true,
              },
            },
          },
        },
        localEstoque: { select: { id: true, nome: true } },
        motorista: { select: { id: true, nome: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true } },
            unidade: { select: { id: true, sigla: true, nome: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: minutas });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST /api/comercial/minutas ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { pedidoVendaId, numeroFisico, localEstoqueId, motoristaId, tipo, dataEntrega, placa, observacoes, itens } = body;

    if (!pedidoVendaId) {
      return NextResponse.json({ error: "pedidoVendaId é obrigatório" }, { status: 400 });
    }
    if (!itens || itens.length === 0) {
      return NextResponse.json({ error: "Informe ao menos um item" }, { status: 400 });
    }
    // A minuta nasce já como SAIU_PARA_ENTREGA e dá baixa no estoque na criação,
    // por isso o Local de Estoque é obrigatório.
    if (!localEstoqueId) {
      return NextResponse.json({ error: "Selecione o Local de Estoque para registrar a saída" }, { status: 400 });
    }

    const minuta = await prisma.$transaction(async (tx) => {
      // Generate sequential number MIN-0001
      const seq = await tx.sequencia.upsert({
        where:  { prefixo: "MIN" },
        create: { prefixo: "MIN", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber("MIN", seq.ultimo);

      const created = await tx.minuta.create({
        data: {
          numero,
          numeroFisico: numeroFisico || null,
          pedidoVendaId,
          localEstoqueId: localEstoqueId || null,
          motoristaId: motoristaId || null,
          tipo: tipo === "RETIRADA" ? "RETIRADA" : "ENTREGA",
          status: "SAIU_PARA_ENTREGA",
          dataEntrega: dataEntrega ? new Date(dataEntrega) : null,
          placa: placa || null,
          observacoes: observacoes || null,
          itens: {
            create: itens.map((it: {
              pedidoVendaItemId: string;
              itemId: string;
              quantidade: number;
              quantidadeConvertida?: number;
              unidadeId?: string;
            }) => ({
              pedidoVendaItemId: it.pedidoVendaItemId,
              itemId: it.itemId,
              quantidade: it.quantidade,
              quantidadeConvertida: it.quantidadeConvertida ?? null,
              unidadeId: it.unidadeId || null,
            })),
          },
        },
        include: {
          pedidoVenda: {
            select: {
              id: true,
              numero: true,
              cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            },
          },
          localEstoque: { select: { id: true, nome: true } },
          motorista: { select: { id: true, nome: true } },
          itens: {
            include: {
              item: { select: { id: true, codigo: true, descricao: true } },
              unidade: { select: { id: true, sigla: true, nome: true } },
            },
          },
        },
      });

      // ── Gera a SAÍDA no estoque (a minuta nasce em SAIU_PARA_ENTREGA) ─────────
      const year = new Date().getFullYear();
      const movSeq = await tx.sequencia.upsert({
        where:  { prefixo: "MOV" },
        create: { prefixo: "MOV", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const movNumero = `MOV-${year}-${String(movSeq.ultimo).padStart(4, "0")}`;

      const lote = await tx.loteMovimentacao.create({
        data: {
          numero:      movNumero,
          tipo:        "SAIDA",
          documento:   created.numero,
          observacoes: `Saída por minuta ${created.numero}`,
        },
      });

      for (const item of created.itens) {
        const quantidade = parseFloat(item.quantidade.toString());

        let estoque = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId },
        });
        if (!estoque) {
          estoque = await tx.estoqueItem.create({
            data: { itemId: item.itemId, localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0 },
          });
        }

        const saldoAntes  = parseFloat(estoque.quantidadeAtual.toString());
        const saldoDepois = saldoAntes - quantidade;

        await tx.estoqueItem.update({
          where: { id: estoque.id },
          data:  { quantidadeAtual: saldoDepois },
        });

        await tx.movimentacaoEstoque.create({
          data: {
            itemId:       item.itemId,
            localEstoqueId,
            unidadeId:    item.unidadeId ?? null,
            loteId:       lote.id,
            tipo:         "SAIDA",
            quantidade,
            saldoAntes,
            saldoDepois,
            documento:    created.numero,
            observacoes:  `Saída por minuta ${created.numero}`,
          },
        });
      }

      // Move pedido to EM_AGENDAMENTO when first minuta is created
      await tx.pedidoVenda.update({
        where: { id: pedidoVendaId },
        data: { status: "EM_AGENDAMENTO" },
      });

      return created;
    });

    return NextResponse.json({ data: minuta }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/comercial/minutas]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
