export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe de um documento do quadro de acompanhamento (popup SOMENTE LEITURA).
// Devolve o mesmo formato para as 4 etapas: campos do cabeçalho, itens,
// propostas (só cotação) e a CADEIA de documentos ligados (SC → CT → PC → DE).
// ─────────────────────────────────────────────────────────────────────────────

type Etapa = "solicitacao" | "cotacao" | "pedido" | "entrada";

type Campo = { label: string; valor: string | number | null; tipo?: "texto" | "data" | "moeda"; full?: boolean };
type ItemLinha = {
  codigo: string; descricao: string; unidade: string | null;
  quantidade: number; quantidadeRecebida?: number | null;
  precoUnitario?: number | null; total?: number | null;
};
type Elo = { etapa: Etapa; id: string; numero: string; status: string };
type Proposta = { fornecedor: string; status: string; total: number | null; escolhida: boolean };

type Detalhe = {
  etapa: Etapa; id: string; numero: string; status: string; empresaId: string; href: string;
  campos: Campo[];
  itens: ItemLinha[];
  propostas?: Proposta[];
  cadeia: Elo[];
  criadoPor: string | null;
  atualizadoPor: string | null;
};

const PRIORIDADE: Record<number, string> = { 1: "Muito Baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "Crítica" };

const num = (v: unknown): number | null => (v == null ? null : parseFloat(String(v)));
const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;
const nomeFornecedor = (f: { razaoSocial: string; nomeFantasia: string | null } | null | undefined) =>
  f ? f.nomeFantasia || f.razaoSocial : null;

const HREF: Record<Etapa, (id: string) => string> = {
  solicitacao: (id) => `/compras/necessidades/${id}`,
  cotacao: (id) => `/suprimentos/cotacoes/${id}`,
  pedido: (id) => `/suprimentos/pedidos-compra/${id}`,
  entrada: (id) => `/suprimentos/conferencias/${id}`,
};

const elo = (etapa: Etapa, d: { id: string; numero: string; status: string } | null | undefined): Elo[] =>
  d ? [{ etapa, id: d.id, numero: d.numero, status: d.status }] : [];

const DOC = { select: { id: true, numero: true, status: true } } as const;
const ITEM = { select: { codigo: true, descricao: true, unidadeMedida: true } } as const;
const FORNECEDOR = { select: { razaoSocial: true, nomeFantasia: true } } as const;

// Linhas de pedido/entrada guardam só o unidadeId da compra (sem relation).
async function siglasUnidades(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter((i): i is string => !!i)));
  if (unicos.length === 0) return new Map();
  const unidades = await prisma.unidade.findMany({ where: { id: { in: unicos } }, select: { id: true, sigla: true } });
  return new Map(unidades.map((u) => [u.id, u.sigla]));
}

async function detalheSolicitacao(id: string): Promise<Detalhe | null> {
  const sc = await prisma.necessidadeCompra.findUnique({
    where: { id },
    include: {
      colaborador: { select: { nome: true } },
      setor: { select: { nome: true } },
      centroCusto: { select: { codigo: true, nome: true } },
      itens: { include: { item: ITEM } },
      cotacoes: { ...DOC, orderBy: { createdAt: "asc" } },
      pedidosCompra: { select: { id: true, numero: true, status: true, conferencia: DOC }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!sc) return null;
  return {
    etapa: "solicitacao", id: sc.id, numero: sc.numero, status: sc.status, empresaId: sc.empresaId, href: HREF.solicitacao(sc.id),
    campos: [
      { label: "Solicitante", valor: sc.colaborador?.nome ?? sc.solicitante },
      { label: "Setor", valor: sc.setor?.nome ?? null },
      { label: "Centro de custo", valor: sc.centroCusto ? `${sc.centroCusto.codigo} — ${sc.centroCusto.nome}` : null },
      { label: "Prioridade", valor: PRIORIDADE[sc.prioridade] ?? String(sc.prioridade) },
      { label: "Criada em", valor: iso(sc.createdAt), tipo: "data" },
      { label: "Necessária em", valor: iso(sc.dataNecessidade), tipo: "data" },
      { label: "Tipo de compra", valor: sc.tipoCompra },
      { label: "Aprovada por", valor: sc.aprovadoPor },
      { label: "Justificativa", valor: sc.justificativa ?? sc.motivo, full: true },
      { label: "Observações", valor: sc.observacoes, full: true },
      { label: "Motivo da reprovação", valor: sc.motivoReprovacao, full: true },
    ],
    itens: sc.itens.map((i) => ({
      codigo: i.item.codigo, descricao: i.item.descricao,
      unidade: i.unidade ?? i.item.unidadeMedida,
      quantidade: num(i.quantidadeAprovada) ?? num(i.quantidade) ?? 0,
    })),
    cadeia: [
      ...sc.cotacoes.flatMap((c) => elo("cotacao", c)),
      ...sc.pedidosCompra.flatMap((p) => [...elo("pedido", p), ...elo("entrada", p.conferencia)]),
    ],
    criadoPor: sc.criadoPor, atualizadoPor: sc.atualizadoPor,
  };
}

async function detalheCotacao(id: string): Promise<Detalhe | null> {
  const ct = await prisma.cotacaoCompra.findUnique({
    where: { id },
    include: {
      necessidade: { select: { id: true, numero: true, status: true, solicitante: true, colaborador: { select: { nome: true } } } },
      fornecedores: {
        include: { fornecedor: FORNECEDOR, itens: { include: { item: ITEM } } },
        orderBy: { createdAt: "asc" },
      },
      pedidos: { select: { id: true, numero: true, status: true, conferencia: DOC }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ct) return null;
  const escolhido =
    ct.fornecedores.find((f) => f.fornecedorId === ct.fornecedorVencedorId) ??
    ct.fornecedores.find((f) => f.melhorOpcao);
  // Itens: os da proposta escolhida (com preço); sem escolha, os da 1ª proposta
  // só como lista do que está sendo cotado.
  const base = escolhido ?? ct.fornecedores[0];
  return {
    etapa: "cotacao", id: ct.id, numero: ct.numero, status: ct.status, empresaId: ct.empresaId, href: HREF.cotacao(ct.id),
    campos: [
      { label: "Apelido", valor: ct.nome },
      { label: "Solicitante", valor: ct.necessidade?.colaborador?.nome ?? ct.necessidade?.solicitante ?? null },
      { label: "Criada em", valor: iso(ct.createdAt), tipo: "data" },
      { label: "Respostas até", valor: iso(ct.dataLimiteResposta), tipo: "data" },
      { label: "Fornecedor escolhido", valor: nomeFornecedor(escolhido?.fornecedor) },
      { label: "Total da proposta", valor: num(escolhido?.totalCalculado), tipo: "moeda" },
      { label: "Aprovada por", valor: ct.aprovadoPor },
      { label: "Entrega", valor: ct.infoEntrega, full: true },
      { label: "Observações", valor: ct.observacoes, full: true },
      { label: "Motivo da reprovação", valor: ct.motivoReprovacao, full: true },
    ],
    itens: (base?.itens ?? []).map((i) => ({
      codigo: i.item.codigo, descricao: i.item.descricao, unidade: i.item.unidadeMedida,
      quantidade: num(i.quantidade) ?? 0,
      precoUnitario: escolhido ? num(i.precoUnitario) : null,
      total: escolhido ? num(i.subtotal) : null,
    })),
    propostas: ct.fornecedores.map((f) => ({
      fornecedor: nomeFornecedor(f.fornecedor) ?? "—",
      status: f.status,
      total: num(f.totalCalculado),
      escolhida: f === escolhido,
    })),
    cadeia: [
      ...elo("solicitacao", ct.necessidade),
      ...ct.pedidos.flatMap((p) => [...elo("pedido", p), ...elo("entrada", p.conferencia)]),
    ],
    criadoPor: ct.criadoPor, atualizadoPor: ct.atualizadoPor,
  };
}

async function detalhePedido(id: string): Promise<Detalhe | null> {
  const pc = await prisma.pedidoCompra.findUnique({
    where: { id },
    include: {
      fornecedor: FORNECEDOR,
      condicaoPagamentoRef: { select: { nome: true } },
      necessidade: DOC,
      cotacao: DOC,
      conferencia: DOC,
      itens: { include: { item: ITEM } },
    },
  });
  if (!pc) return null;
  const siglas = await siglasUnidades(pc.itens.map((i) => i.unidadeId));
  return {
    etapa: "pedido", id: pc.id, numero: pc.numero, status: pc.status, empresaId: pc.empresaId, href: HREF.pedido(pc.id),
    campos: [
      { label: "Fornecedor", valor: nomeFornecedor(pc.fornecedor) },
      { label: "Valor total", valor: num(pc.valorTotal), tipo: "moeda" },
      { label: "Emitido em", valor: iso(pc.createdAt), tipo: "data" },
      { label: "Entrega prevista", valor: iso(pc.dataEntregaPrevista), tipo: "data" },
      { label: "Cond. de pagamento", valor: pc.condicaoPagamentoRef?.nome ?? pc.condicoesPagamento },
      { label: "Frete", valor: num(pc.frete), tipo: "moeda" },
      { label: "Tipo de frete", valor: pc.tipoFrete },
      { label: "Contato", valor: pc.contato },
      { label: "Descrição", valor: pc.descricao, full: true },
      { label: "Observações", valor: pc.observacoes, full: true },
    ],
    itens: pc.itens.map((i) => ({
      codigo: i.item.codigo, descricao: i.item.descricao,
      unidade: (i.unidadeId && siglas.get(i.unidadeId)) || i.item.unidadeMedida,
      quantidade: num(i.quantidade) ?? 0,
      precoUnitario: num(i.precoUnitario),
      total: num(i.valorTotal),
    })),
    cadeia: [...elo("solicitacao", pc.necessidade), ...elo("cotacao", pc.cotacao), ...elo("entrada", pc.conferencia)],
    criadoPor: pc.criadoPor, atualizadoPor: pc.atualizadoPor,
  };
}

async function detalheEntrada(id: string): Promise<Detalhe | null> {
  const de = await prisma.conferenciaCompra.findUnique({
    where: { id },
    include: {
      fornecedor: FORNECEDOR,
      condicaoPagamentoRef: { select: { nome: true } },
      pedido: {
        select: {
          id: true, numero: true, status: true, valorTotal: true,
          fornecedor: FORNECEDOR, necessidade: DOC, cotacao: DOC,
        },
      },
      itens: { include: { item: ITEM } },
    },
  });
  if (!de) return null;
  const siglas = await siglasUnidades(de.itens.map((i) => i.unidadeId));
  return {
    etapa: "entrada", id: de.id, numero: de.numero, status: de.status, empresaId: de.empresaId, href: HREF.entrada(de.id),
    campos: [
      { label: "Fornecedor", valor: nomeFornecedor(de.fornecedor) ?? nomeFornecedor(de.pedido?.fornecedor) },
      { label: "Valor total", valor: num(de.vrTotal) ?? num(de.pedido?.valorTotal), tipo: "moeda" },
      { label: "Nota fiscal", valor: de.numeroNF ? `${de.numeroNF}${de.serie ? ` / ${de.serie}` : ""}` : null },
      { label: "Emissão da NF", valor: iso(de.dtEmissao), tipo: "data" },
      { label: "Criado em", valor: iso(de.createdAt), tipo: "data" },
      { label: "Conferido em", valor: iso(de.dataConferencia), tipo: "data" },
      { label: "Cond. de pagamento", valor: de.condicaoPagamentoRef?.nome ?? null },
      { label: "Responsável", valor: de.responsavel },
      { label: "Observações", valor: de.observacoes, full: true },
    ],
    itens: de.itens.map((i) => ({
      codigo: i.item.codigo, descricao: i.item.descricao,
      unidade: (i.unidadeId && siglas.get(i.unidadeId)) || i.item.unidadeMedida,
      quantidade: num(i.quantidadePedida) ?? 0,
      quantidadeRecebida: num(i.quantidadeRecebida),
      precoUnitario: num(i.vlrUnitario),
      total: num(i.vlrTotal),
    })),
    cadeia: [
      ...elo("solicitacao", de.pedido?.necessidade),
      ...elo("cotacao", de.pedido?.cotacao),
      ...elo("pedido", de.pedido),
    ],
    criadoPor: de.criadoPor, atualizadoPor: de.atualizadoPor,
  };
}

const CARREGAR: Record<Etapa, (id: string) => Promise<Detalhe | null>> = {
  solicitacao: detalheSolicitacao,
  cotacao: detalheCotacao,
  pedido: detalhePedido,
  entrada: detalheEntrada,
};

export async function GET(_req: NextRequest, { params }: { params: { etapa: string; id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const carregar = CARREGAR[params.etapa as Etapa];
  if (!carregar) return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });

  const detalhe = await carregar(params.id);
  if (!detalhe) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });

  // Campos vazios não vão para o popup.
  detalhe.campos = detalhe.campos.filter((c) => c.valor != null && c.valor !== "");
  return NextResponse.json(detalhe);
}
