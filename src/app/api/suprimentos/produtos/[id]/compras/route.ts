export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModuloAny(["empresa", "compras"]);
  if (!auth.ok) return auth.response;

  const itemId = params.id;

  const [necessidadeItens, pedidoItens, conferenciaItens] = await Promise.all([
    // Necessidades via NecessidadeCompraItem (com a cotação mais recente,
    // para processos que ainda não chegaram ao pedido)
    prisma.necessidadeCompraItem.findMany({
      where: { itemId },
      include: {
        necessidade: {
          select: {
            id: true, numero: true, status: true,
            solicitante: true, dataNecessidade: true, createdAt: true,
            cotacoes: {
              select: { id: true, numero: true, nome: true, status: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { necessidade: { createdAt: "desc" } },
    }),

    // Pedidos de Compra via PedidoCompraItem — com a cadeia (SC/CT) para a
    // visão em processos: uma linha por fluxo SC → CT → PC → DE.
    prisma.pedidoCompraItem.findMany({
      where: { itemId },
      include: {
        pedido: {
          select: {
            id: true, numero: true, status: true,
            valorTotal: true, dataEntregaPrevista: true, createdAt: true,
            fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            necessidade: { select: { id: true, numero: true, status: true, solicitante: true } },
            cotacao: {
              select: {
                id: true, numero: true, nome: true, status: true,
                necessidade: { select: { id: true, numero: true, status: true, solicitante: true } },
              },
            },
            conferencia: { select: { id: true, numero: true, status: true } },
          },
        },
      },
      orderBy: { pedido: { createdAt: "desc" } },
    }),

    // Conferências via ConferenciaCompraItem
    prisma.conferenciaCompraItem.findMany({
      where: { itemId },
      include: {
        conferencia: {
          select: {
            id: true, numero: true, status: true,
            dataConferencia: true, createdAt: true,
            // Fornecedor direto da conferência (recebimentos avulsos, sem pedido).
            fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
            pedido: {
              select: {
                id: true,
                numero: true,
                fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
              },
            },
          },
        },
      },
      orderBy: { conferencia: { createdAt: "desc" } },
    }),
  ]);

  // ── Visão em processos: uma linha por cadeia SC → CT → PC → DE ────────────
  type Doc = { id: string; numero: string; status: string } | null;
  type Processo = {
    sc: (NonNullable<Doc> & { solicitante?: string | null }) | null;
    ct: Doc; pc: Doc; de: Doc;
    fornecedor: string | null;
    quantidade: unknown; precoUnitario: unknown;
    quantidadeRecebida: unknown; divergencia: boolean | null;
    data: Date;
  };
  const processos: Processo[] = [];
  const scUsadas = new Set<string>();
  const deUsadas = new Set<string>();

  // Âncora no pedido: dele saem SC (direta ou via cotação), CT e DE.
  for (const pi of pedidoItens) {
    const p = pi.pedido;
    const sc = p.necessidade ?? p.cotacao?.necessidade ?? null;
    const ct = p.cotacao
      ? { id: p.cotacao.id, numero: p.cotacao.nome || p.cotacao.numero, status: p.cotacao.status }
      : null;
    if (sc) scUsadas.add(sc.id);
    if (p.conferencia) deUsadas.add(p.conferencia.id);
    processos.push({
      sc: sc ? { id: sc.id, numero: sc.numero, status: sc.status, solicitante: sc.solicitante } : null,
      ct,
      pc: { id: p.id, numero: p.numero, status: p.status },
      de: p.conferencia ?? null,
      fornecedor: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      quantidade: pi.quantidade,
      precoUnitario: pi.precoUnitario,
      quantidadeRecebida: null,
      divergencia: null,
      data: p.createdAt,
    });
  }

  // Quantidade recebida/divergência vêm do item da conferência.
  for (const ci of conferenciaItens) {
    const linha = processos.find((pr) => pr.de?.id === ci.conferencia.id);
    if (linha) {
      linha.quantidadeRecebida = ci.quantidadeRecebida;
      linha.divergencia = ci.divergencia;
      continue;
    }
    // DE avulsa (sem pedido do item): linha própria.
    const c = ci.conferencia;
    if (deUsadas.has(c.id)) continue;
    deUsadas.add(c.id);
    const f = c.pedido?.fornecedor ?? c.fornecedor;
    processos.push({
      sc: null, ct: null,
      pc: c.pedido ? { id: c.pedido.id, numero: c.pedido.numero, status: "" } : null,
      de: { id: c.id, numero: c.numero, status: c.status },
      fornecedor: f ? (f.nomeFantasia || f.razaoSocial) : null,
      quantidade: ci.quantidadePedida,
      precoUnitario: null,
      quantidadeRecebida: ci.quantidadeRecebida,
      divergencia: ci.divergencia,
      data: c.createdAt,
    });
  }

  // SCs que ainda não viraram pedido: linha com SC (e cotação em andamento).
  for (const ni of necessidadeItens) {
    const n = ni.necessidade;
    if (scUsadas.has(n.id)) continue;
    scUsadas.add(n.id);
    const ct0 = n.cotacoes[0];
    processos.push({
      sc: { id: n.id, numero: n.numero, status: n.status, solicitante: n.solicitante },
      ct: ct0 ? { id: ct0.id, numero: ct0.nome || ct0.numero, status: ct0.status } : null,
      pc: null, de: null,
      fornecedor: null,
      quantidade: ni.quantidade,
      precoUnitario: null,
      quantidadeRecebida: null,
      divergencia: null,
      data: n.createdAt,
    });
  }

  processos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return NextResponse.json({ processos });
}
