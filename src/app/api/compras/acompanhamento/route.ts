export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  SC_ATIVAS, colunaDoCartao, cotacaoAberta, entradaAberta, entradaNaColuna, faseDoProcesso, pedidoAberto, pedidoVivo,
  type ColunaCompra, type EtapaCompra as Etapa,
} from "@/lib/compras-processo";

// ─────────────────────────────────────────────────────────────────────────────
// Kanban do processo de compras (SOMENTE LEITURA): cada compra é UM cartão, que
// anda pelas colunas de espera (quem deve a próxima ação) conforme os documentos
// SC → CT → PC → DE avançam.
//
// O processo é identificado pelo documento raiz (a SC; sem SC, a cotação; sem
// cotação, o pedido; sem pedido, o DE avulso). A regra de fase está em
// lib/compras-processo.ts. Concluídos ficam visíveis pelos últimos N dias.
// ─────────────────────────────────────────────────────────────────────────────

type Documento = { etapa: Etapa; id: string; numero: string; status: string };

type Cartao = {
  id: string;
  etapa: Etapa;
  coluna: ColunaCompra;
  numero: string;
  atual: { etapa: Etapa; id: string };
  empresaId: string;
  status: string;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  desde: string;
  prazo: string | null;
  prazoLabel: string | null;
  atrasado: boolean;
  concluido: boolean;
  prioridade: number | null;
  documentos: Documento[];
  // Texto extra pesquisável (itens, solicitante, NF…) — não é exibido.
  busca: string;
};

const FORNECEDOR = { select: { razaoSocial: true, nomeFantasia: true } } as const;
const ITENS = { select: { item: { select: { descricao: true } } } } as const;

const DE_SELECT = {
  id: true, numero: true, empresaId: true, status: true, createdAt: true, updatedAt: true,
  numeroNF: true, vrTotal: true, dataConferencia: true,
  fornecedor: FORNECEDOR,
  itens: ITENS,
} as const;

const PC_SELECT = {
  id: true, numero: true, empresaId: true, status: true, createdAt: true, updatedAt: true,
  valorTotal: true, dataEntregaPrevista: true, descricao: true,
  fornecedor: FORNECEDOR,
  itens: ITENS,
  conferencia: { select: DE_SELECT },
} as const;

const CT_SELECT = {
  id: true, numero: true, empresaId: true, status: true, createdAt: true, updatedAt: true,
  nome: true, dataLimiteResposta: true, fornecedorVencedorId: true,
  fornecedores: {
    select: { fornecedorId: true, status: true, totalCalculado: true, melhorOpcao: true, fornecedor: FORNECEDOR },
  },
  pedidos: { select: PC_SELECT },
} as const;

const SC_SELECT = {
  id: true, numero: true, empresaId: true, status: true, createdAt: true, updatedAt: true,
  solicitante: true, dataNecessidade: true, prioridade: true,
  colaborador: { select: { nome: true } },
  setor: { select: { nome: true } },
  itens: ITENS,
  cotacoes: { select: CT_SELECT },
  pedidosCompra: { select: PC_SELECT },
} as const;

type DE = Prisma.ConferenciaCompraGetPayload<{ select: typeof DE_SELECT }>;
type PC = Prisma.PedidoCompraGetPayload<{ select: typeof PC_SELECT }>;
type CT = Prisma.CotacaoCompraGetPayload<{ select: typeof CT_SELECT }>;
type SC = Prisma.NecessidadeCompraGetPayload<{ select: typeof SC_SELECT }>;

type Processo = { sc: SC | null; cts: CT[]; pcs: PC[]; avulsa: DE | null };

// O que o cartão mostra vem do documento em que o processo está parado.
type Face = Pick<
  Cartao,
  "empresaId" | "status" | "titulo" | "resumo" | "valor" | "desde" | "prazo" | "prazoLabel" | "atrasado"
> & { atual: Cartao["atual"] };
type Vencido = (d: Date | null | undefined) => boolean;

const num = (v: unknown): number | null => (v == null ? null : parseFloat(String(v)));
const nomeFornecedor = (f: { razaoSocial: string; nomeFantasia: string | null } | null | undefined) =>
  f ? f.nomeFantasia || f.razaoSocial : null;

function resumoItens(itens: { item: { descricao: string } }[]): string | null {
  if (itens.length === 0) return null;
  const primeiro = itens[0].item.descricao;
  return itens.length > 1 ? `${primeiro} +${itens.length - 1}` : primeiro;
}

const descricoes = (itens: { item: { descricao: string } }[]) => itens.map((i) => i.item.descricao);
const solicitanteDe = (sc: SC) => sc.colaborador?.nome ?? sc.solicitante ?? "Sem solicitante";

function faceSC(sc: SC, vencido: Vencido): Face {
  return {
    atual: { etapa: "solicitacao", id: sc.id },
    empresaId: sc.empresaId, status: sc.status,
    titulo: solicitanteDe(sc),
    resumo: resumoItens(sc.itens),
    valor: null,
    desde: sc.createdAt.toISOString(),
    prazo: sc.dataNecessidade?.toISOString() ?? null,
    prazoLabel: sc.dataNecessidade ? "Necessário em" : null,
    atrasado: vencido(sc.dataNecessidade),
  };
}

function faceCT(ct: CT, vencido: Vencido): Face {
  const respondidas = ct.fornecedores.filter((f) => f.status === "RESPONDIDA").length;
  const escolhido =
    ct.fornecedores.find((f) => f.fornecedorId === ct.fornecedorVencedorId) ??
    ct.fornecedores.find((f) => f.melhorOpcao);
  return {
    atual: { etapa: "cotacao", id: ct.id },
    empresaId: ct.empresaId, status: ct.status,
    titulo: ct.nome || nomeFornecedor(escolhido?.fornecedor) || "Cotação sem nome",
    resumo: ct.fornecedores.length > 0
      ? `${respondidas}/${ct.fornecedores.length} fornecedores responderam`
      : "Nenhum fornecedor convidado",
    valor: num(escolhido?.totalCalculado),
    desde: ct.createdAt.toISOString(),
    prazo: ct.dataLimiteResposta?.toISOString() ?? null,
    prazoLabel: ct.dataLimiteResposta ? "Respostas até" : null,
    atrasado: vencido(ct.dataLimiteResposta),
  };
}

function facePC(pc: PC, vencido: Vencido): Face {
  return {
    atual: { etapa: "pedido", id: pc.id },
    empresaId: pc.empresaId, status: pc.status,
    titulo: nomeFornecedor(pc.fornecedor) ?? "Sem fornecedor",
    resumo: pc.descricao || resumoItens(pc.itens),
    valor: num(pc.valorTotal),
    desde: pc.createdAt.toISOString(),
    prazo: pc.dataEntregaPrevista?.toISOString() ?? null,
    prazoLabel: pc.dataEntregaPrevista ? "Entrega prevista" : null,
    atrasado: vencido(pc.dataEntregaPrevista),
  };
}

function faceDE(de: DE, pc: PC | null): Face {
  return {
    atual: { etapa: "entrada", id: de.id },
    empresaId: de.empresaId, status: de.status,
    titulo: nomeFornecedor(de.fornecedor) ?? nomeFornecedor(pc?.fornecedor) ?? "Sem fornecedor",
    resumo: [de.numeroNF ? `NF ${de.numeroNF}` : null, resumoItens(de.itens)].filter(Boolean).join(" · ") || null,
    valor: num(de.vrTotal) ?? num(pc?.valorTotal),
    desde: de.createdAt.toISOString(),
    prazo: null,
    prazoLabel: null,
    atrasado: false,
  };
}

function montarCartao(p: Processo, corte: Date, vencido: Vencido): Cartao | null {
  const vivos = p.pcs.filter(pedidoVivo);
  const entradas = [
    ...vivos.flatMap((pc) => (pc.conferencia ? [{ de: pc.conferencia, pc: pc as PC | null }] : [])),
    ...(p.avulsa ? [{ de: p.avulsa, pc: null as PC | null }] : []),
  ];
  const { etapa, concluido } = faseDoProcesso({
    sc: p.sc,
    cotacoes: p.cts,
    pedidos: p.pcs.map((pc) => ({ status: pc.status, entrada: pc.conferencia })),
    entradasAvulsas: p.avulsa ? [p.avulsa] : [],
  });

  // Concluído só fica no quadro dentro da janela escolhida. SC parada em EM_PEDIDO
  // com tudo já recebido há tempo sai por aqui.
  let face: Face | null = null;
  if (etapa === "solicitacao" && p.sc) {
    face = faceSC(p.sc, vencido);
  } else if (etapa === "cotacao") {
    const ct = p.cts.find(cotacaoAberta) ?? p.cts[p.cts.length - 1];
    if (ct) face = faceCT(ct, vencido);
  } else if (etapa === "pedido") {
    const pc = vivos.find((x) => pedidoAberto({ status: x.status, entrada: x.conferencia })) ?? vivos[vivos.length - 1];
    if (pc) face = facePC(pc, vencido);
  } else if (etapa === "entrada") {
    const e = entradas.find((x) => entradaAberta(x.de)) ?? entradas[entradas.length - 1];
    if (e) face = faceDE(e.de, e.pc);
  }
  if (!face) return null;

  if (concluido) {
    const ultimoUpdate = Math.max(
      ...entradas.map((e) => e.de.updatedAt.getTime()),
      ...vivos.map((pc) => pc.updatedAt.getTime()),
      ...p.cts.map((ct) => ct.updatedAt.getTime()),
      p.sc?.updatedAt.getTime() ?? 0,
    );
    if (ultimoUpdate < corte.getTime()) return null;
    const ultima = entradas[entradas.length - 1]?.de;
    face.prazo = (ultima?.dataConferencia ?? new Date(ultimoUpdate)).toISOString();
    face.prazoLabel = "Concluído em";
    face.atrasado = false;
  }

  const documentos: Documento[] = [
    ...(p.sc ? [{ etapa: "solicitacao" as const, id: p.sc.id, numero: p.sc.numero, status: p.sc.status }] : []),
    ...p.cts.map((d) => ({ etapa: "cotacao" as const, id: d.id, numero: d.numero, status: d.status })),
    ...vivos.map((d) => ({ etapa: "pedido" as const, id: d.id, numero: d.numero, status: d.status })),
    ...entradas.map(({ de: d }) => ({ etapa: "entrada" as const, id: d.id, numero: d.numero, status: d.status })),
  ];

  return {
    id: `${documentos[0].etapa}:${documentos[0].id}`,
    etapa,
    coluna: colunaDoCartao(etapa, face.status, concluido),
    numero: documentos[0].numero,
    concluido,
    prioridade: p.sc?.prioridade ?? null,
    documentos,
    ...face,
    busca: [
      p.sc ? solicitanteDe(p.sc) : null,
      p.sc?.setor?.nome,
      ...(p.sc ? descricoes(p.sc.itens) : []),
      ...p.cts.flatMap((ct) => ct.fornecedores.map((f) => nomeFornecedor(f.fornecedor))),
      ...vivos.flatMap((pc) => [nomeFornecedor(pc.fornecedor), ...descricoes(pc.itens)]),
      ...entradas.flatMap(({ de }) => [de.numeroNF, nomeFornecedor(de.fornecedor), ...descricoes(de.itens)]),
    ].filter(Boolean).join(" "),
  };
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
  const vencido: Vencido = (d) => !!d && d < hoje;

  const pedidoEmAberto: Prisma.PedidoCompraWhereInput = { status: { notIn: ["CANCELADO", "RECEBIDO"] }, conferencia: { is: null } };
  const entradaEmAberto: Prisma.PedidoCompraWhereInput = { conferencia: { is: { status: { not: "CONCLUIDA" } } } };

  const [solicitacoes, cotacoesSemSC, pedidosSemOrigem, entradasAvulsas] = await Promise.all([
    prisma.necessidadeCompra.findMany({
      where: {
        OR: [
          { status: { in: [...SC_ATIVAS] } },
          { status: "TOTALMENTE_ATENDIDA", updatedAt: { gte: corte } },
          // Cotação esquecida aberta em SC cancelada/rejeitada não é trabalho em andamento.
          { status: { notIn: ["CANCELADA", "REJEITADA"] }, cotacoes: { some: { status: { not: "CONCLUIDA" } } } },
          { pedidosCompra: { some: pedidoEmAberto } },
          { pedidosCompra: { some: entradaEmAberto } },
          // Pedido gerado pela cotação costuma ligar à SC só por ela.
          { cotacoes: { some: { pedidos: { some: pedidoEmAberto } } } },
          { cotacoes: { some: { pedidos: { some: entradaEmAberto } } } },
        ],
      },
      select: SC_SELECT,
    }),
    prisma.cotacaoCompra.findMany({
      where: {
        necessidadeId: null,
        OR: [
          { status: { not: "CONCLUIDA" } },
          { updatedAt: { gte: corte } },
          { pedidos: { some: pedidoEmAberto } },
          { pedidos: { some: entradaEmAberto } },
        ],
      },
      select: CT_SELECT,
    }),
    prisma.pedidoCompra.findMany({
      where: {
        necessidadeId: null,
        cotacaoId: null,
        // Espelho automático de venda intragrupo: não tem entrega nem DE a aguardar.
        intragrupo: false,
        status: { not: "CANCELADO" },
        OR: [
          pedidoEmAberto,
          entradaEmAberto,
          { updatedAt: { gte: corte } },
          { conferencia: { is: { updatedAt: { gte: corte } } } },
        ],
      },
      select: PC_SELECT,
    }),
    prisma.conferenciaCompra.findMany({
      where: {
        pedidoId: null,
        OR: [{ status: { not: "CONCLUIDA" } }, { updatedAt: { gte: corte } }],
      },
      select: DE_SELECT,
    }),
  ]);

  const processos: Processo[] = [
    ...solicitacoes.map((sc) => {
      // O pedido pode estar ligado à SC direto ou só pela cotação.
      const pcs = new Map<string, PC>();
      for (const pc of [...sc.pedidosCompra, ...sc.cotacoes.flatMap((ct) => ct.pedidos)]) pcs.set(pc.id, pc);
      return { sc, cts: sc.cotacoes, pcs: Array.from(pcs.values()), avulsa: null };
    }),
    ...cotacoesSemSC.map((ct) => ({ sc: null, cts: [ct], pcs: ct.pedidos, avulsa: null })),
    ...pedidosSemOrigem.map((pc) => ({ sc: null, cts: [], pcs: [pc], avulsa: null })),
    ...entradasAvulsas.map((de) => ({ sc: null, cts: [], pcs: [], avulsa: de })),
  ];

  const cartoes = processos
    .map((p) => montarCartao(p, corte, vencido))
    .filter((c): c is Cartao => c !== null);

  // Com o histórico, a idade é o tempo na coluna atual, não desde a criação.
  const emAberto = cartoes.filter((c) => !c.concluido);
  const logs = await prisma.compraStatusLog.findMany({
    where: { documentoId: { in: emAberto.map((c) => c.atual.id) } },
    orderBy: { criadoEm: "asc" },
    select: { documentoId: true, statusDe: true, statusPara: true, criadoEm: true },
  });
  const logsPorDocumento = new Map<string, typeof logs>();
  for (const l of logs) logsPorDocumento.set(l.documentoId, [...(logsPorDocumento.get(l.documentoId) ?? []), l]);
  for (const c of emAberto) {
    c.desde = entradaNaColuna(c.atual.etapa, new Date(c.desde), logsPorDocumento.get(c.atual.id) ?? []).toISOString();
  }

  return NextResponse.json({ cartoes, concluidosDias, geradoEm: agora.toISOString() });
}
