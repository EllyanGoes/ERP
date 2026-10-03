export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Acompanhamento do fluxo de compras (quadro SOMENTE LEITURA): cada documento
// em aberto aparece na coluna da etapa em que está parado.
//
//   Solicitação → Cotação → Pedido de Compras → Documento de Entrada
//
// A cadeia NÃO é 1:1 (uma SC gera N cotações/pedidos; existem pedidos sem SC e
// DEs avulsos), então o cartão é o documento MAIS AVANÇADO de cada ramo, com a
// origem marcada nele:
//   • SC      — ativa e sem ramo aberto adiante (sem cotação aberta nem pedido
//               pendente de entrada). Parcialmente atendida volta para cá.
//   • Cotação — toda cotação não concluída.
//   • Pedido  — pedido vivo ainda SEM documento de entrada (o DE nasce no
//               recebimento, não junto com o pedido).
//   • DE      — entradas não concluídas + concluídas nos últimos N dias.
// ─────────────────────────────────────────────────────────────────────────────

type Etapa = "solicitacao" | "cotacao" | "pedido" | "entrada";

type Cartao = {
  id: string;
  etapa: Etapa;
  numero: string;
  empresaId: string;
  status: string;
  href: string;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  desde: string;
  prazo: string | null;
  prazoLabel: string | null;
  atrasado: boolean;
  concluido: boolean;
  prioridade: number | null;
  origens: { numero: string; href: string }[];
  // Texto extra pesquisável (itens, solicitante, NF…) — não é exibido.
  busca: string;
};

const SC_ATIVAS = ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA", "EM_COTACAO", "EM_PEDIDO", "PARCIALMENTE_ATENDIDA"] as const;

const num = (v: unknown): number | null => (v == null ? null : parseFloat(String(v)));
const nomeFornecedor = (f: { razaoSocial: string; nomeFantasia: string | null } | null | undefined) =>
  f ? f.nomeFantasia || f.razaoSocial : null;

function resumoItens(itens: { item: { descricao: string } }[]): string | null {
  if (itens.length === 0) return null;
  const primeiro = itens[0].item.descricao;
  return itens.length > 1 ? `${primeiro} +${itens.length - 1}` : primeiro;
}

export async function GET(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const diasParam = parseInt(searchParams.get("concluidosDias") ?? "7", 10);
  const concluidosDias = Number.isFinite(diasParam) ? Math.min(Math.max(diasParam, 0), 90) : 7;

  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const corte = new Date(agora.getTime() - concluidosDias * 86_400_000);
  const vencido = (d: Date | null | undefined) => !!d && d < hoje;

  const [solicitacoes, cotacoes, pedidos, entradas] = await Promise.all([
    prisma.necessidadeCompra.findMany({
      where: { status: { in: [...SC_ATIVAS] } },
      select: {
        id: true, numero: true, empresaId: true, status: true, createdAt: true,
        solicitante: true, dataNecessidade: true, prioridade: true,
        colaborador: { select: { nome: true } },
        setor: { select: { nome: true } },
        itens: { select: { item: { select: { descricao: true } } } },
        cotacoes: { select: { status: true } },
        pedidosCompra: { select: { status: true, conferencia: { select: { status: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cotacaoCompra.findMany({
      where: { status: { not: "CONCLUIDA" } },
      select: {
        id: true, numero: true, empresaId: true, status: true, createdAt: true,
        nome: true, dataLimiteResposta: true, fornecedorVencedorId: true,
        necessidade: { select: { id: true, numero: true, solicitante: true, colaborador: { select: { nome: true } } } },
        fornecedores: {
          select: {
            fornecedorId: true, status: true, totalCalculado: true, melhorOpcao: true,
            fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pedidoCompra.findMany({
      where: { status: { notIn: ["CANCELADO", "RECEBIDO"] }, conferencia: { is: null } },
      select: {
        id: true, numero: true, empresaId: true, status: true, createdAt: true,
        valorTotal: true, dataEntregaPrevista: true, descricao: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        necessidade: { select: { id: true, numero: true } },
        cotacao: { select: { id: true, numero: true } },
        itens: { select: { item: { select: { descricao: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.conferenciaCompra.findMany({
      where: {
        OR: [
          { status: { not: "CONCLUIDA" } },
          { status: "CONCLUIDA", updatedAt: { gte: corte } },
        ],
      },
      select: {
        id: true, numero: true, empresaId: true, status: true, createdAt: true, updatedAt: true,
        numeroNF: true, vrTotal: true, dataConferencia: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        pedido: {
          select: {
            id: true, numero: true, valorTotal: true, dataEntregaPrevista: true,
            fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
            necessidade: { select: { id: true, numero: true } },
          },
        },
        itens: { select: { item: { select: { descricao: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const cartoes: Cartao[] = [];

  for (const sc of solicitacoes) {
    // Ramo aberto adiante = a compra já está representada por outro cartão.
    const cotacaoAberta = sc.cotacoes.some((c) => c.status !== "CONCLUIDA");
    // (pedido pode já estar RECEBIDO com o DE ainda em conferência.)
    const pedidoAberto = sc.pedidosCompra.some(
      (p) => p.status !== "CANCELADO" &&
        (p.conferencia ? p.conferencia.status !== "CONCLUIDA" : p.status !== "RECEBIDO"),
    );
    if (cotacaoAberta || pedidoAberto) continue;

    const solicitante = sc.colaborador?.nome ?? sc.solicitante ?? "Sem solicitante";
    cartoes.push({
      id: sc.id, etapa: "solicitacao", numero: sc.numero, empresaId: sc.empresaId, status: sc.status,
      href: `/compras/necessidades/${sc.id}`,
      titulo: solicitante,
      resumo: resumoItens(sc.itens),
      valor: null,
      desde: sc.createdAt.toISOString(),
      prazo: sc.dataNecessidade?.toISOString() ?? null,
      prazoLabel: sc.dataNecessidade ? "Necessário em" : null,
      atrasado: vencido(sc.dataNecessidade),
      concluido: false,
      prioridade: sc.prioridade,
      origens: [],
      busca: [sc.setor?.nome, ...sc.itens.map((i) => i.item.descricao)].filter(Boolean).join(" "),
    });
  }

  for (const ct of cotacoes) {
    const respondidas = ct.fornecedores.filter((f) => f.status === "RESPONDIDA").length;
    const escolhido =
      ct.fornecedores.find((f) => f.fornecedorId === ct.fornecedorVencedorId) ??
      ct.fornecedores.find((f) => f.melhorOpcao);
    cartoes.push({
      id: ct.id, etapa: "cotacao", numero: ct.numero, empresaId: ct.empresaId, status: ct.status,
      href: `/suprimentos/cotacoes/${ct.id}`,
      titulo: ct.nome || nomeFornecedor(escolhido?.fornecedor) || "Cotação sem nome",
      resumo: ct.fornecedores.length > 0
        ? `${respondidas}/${ct.fornecedores.length} fornecedores responderam`
        : "Nenhum fornecedor convidado",
      valor: num(escolhido?.totalCalculado),
      desde: ct.createdAt.toISOString(),
      prazo: ct.dataLimiteResposta?.toISOString() ?? null,
      prazoLabel: ct.dataLimiteResposta ? "Respostas até" : null,
      atrasado: vencido(ct.dataLimiteResposta),
      concluido: false,
      prioridade: null,
      origens: ct.necessidade
        ? [{ numero: ct.necessidade.numero, href: `/compras/necessidades/${ct.necessidade.id}` }]
        : [],
      busca: [
        ct.necessidade?.colaborador?.nome, ct.necessidade?.solicitante,
        ...ct.fornecedores.map((f) => nomeFornecedor(f.fornecedor)),
      ].filter(Boolean).join(" "),
    });
  }

  for (const pc of pedidos) {
    const origens: Cartao["origens"] = [];
    if (pc.necessidade) origens.push({ numero: pc.necessidade.numero, href: `/compras/necessidades/${pc.necessidade.id}` });
    if (pc.cotacao) origens.push({ numero: pc.cotacao.numero, href: `/suprimentos/cotacoes/${pc.cotacao.id}` });
    cartoes.push({
      id: pc.id, etapa: "pedido", numero: pc.numero, empresaId: pc.empresaId, status: pc.status,
      href: `/suprimentos/pedidos-compra/${pc.id}`,
      titulo: nomeFornecedor(pc.fornecedor) ?? "Sem fornecedor",
      resumo: pc.descricao || resumoItens(pc.itens),
      valor: num(pc.valorTotal),
      desde: pc.createdAt.toISOString(),
      prazo: pc.dataEntregaPrevista?.toISOString() ?? null,
      prazoLabel: pc.dataEntregaPrevista ? "Entrega prevista" : null,
      atrasado: vencido(pc.dataEntregaPrevista),
      concluido: false,
      prioridade: null,
      origens,
      busca: pc.itens.map((i) => i.item.descricao).join(" "),
    });
  }

  for (const de of entradas) {
    const concluido = de.status === "CONCLUIDA";
    const origens: Cartao["origens"] = [];
    if (de.pedido?.necessidade) {
      origens.push({ numero: de.pedido.necessidade.numero, href: `/compras/necessidades/${de.pedido.necessidade.id}` });
    }
    if (de.pedido) origens.push({ numero: de.pedido.numero, href: `/suprimentos/pedidos-compra/${de.pedido.id}` });
    const fim = de.dataConferencia ?? de.updatedAt;
    cartoes.push({
      id: de.id, etapa: "entrada", numero: de.numero, empresaId: de.empresaId, status: de.status,
      href: `/suprimentos/conferencias/${de.id}`,
      titulo: nomeFornecedor(de.fornecedor) ?? nomeFornecedor(de.pedido?.fornecedor) ?? "Sem fornecedor",
      resumo: [de.numeroNF ? `NF ${de.numeroNF}` : null, resumoItens(de.itens)].filter(Boolean).join(" · ") || null,
      valor: num(de.vrTotal) ?? num(de.pedido?.valorTotal),
      desde: de.createdAt.toISOString(),
      prazo: concluido ? fim.toISOString() : null,
      prazoLabel: concluido ? "Concluído em" : null,
      atrasado: false,
      concluido,
      prioridade: null,
      origens,
      busca: [de.numeroNF, ...de.itens.map((i) => i.item.descricao)].filter(Boolean).join(" "),
    });
  }

  return NextResponse.json({ cartoes, concluidosDias, geradoEm: agora.toISOString() });
}
