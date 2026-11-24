export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { faseDoProcesso, pedidoVivo, type EtapaCompra } from "@/lib/compras-processo";

// ─────────────────────────────────────────────────────────────────────────────
// Página única da compra (PC-0430): todos os documentos do processo — SC, CT,
// PC e DE — pelo numeroCompra, mais o cabeçalho (etapa atual, fornecedor,
// valor, solicitante) e o histórico de status. O número é por empresa; sem
// ?empresa= vale a empresa do primeiro documento encontrado no escopo.
// ─────────────────────────────────────────────────────────────────────────────

const ITENS = { select: { item: { select: { descricao: true } } } } as const;
const FORNECEDOR = { select: { razaoSocial: true, nomeFantasia: true } } as const;
const num = (d: unknown) => (d == null ? null : Number(d));
const nomeFornecedor = (f: { razaoSocial: string; nomeFantasia: string | null } | null | undefined) =>
  f ? f.nomeFantasia || f.razaoSocial : null;

function resumoItens(itens: { item: { descricao: string } }[]): string | null {
  if (itens.length === 0) return null;
  return itens.length > 1 ? `${itens[0].item.descricao} +${itens.length - 1}` : itens[0].item.descricao;
}

export async function GET(req: NextRequest, { params }: { params: { numero: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const numeroCompra = decodeURIComponent(params.numero);
  const empresaParam = new URL(req.url).searchParams.get("empresa");

  // Empresa da compra: a pedida, senão a do primeiro documento com esse número.
  let empresaId = empresaParam;
  const candidatas = await Promise.all([
    prisma.necessidadeCompra.findMany({ where: { numeroCompra }, select: { empresaId: true } }),
    prisma.cotacaoCompra.findMany({ where: { numeroCompra }, select: { empresaId: true } }),
    prisma.pedidoCompra.findMany({ where: { numeroCompra }, select: { empresaId: true } }),
    prisma.conferenciaCompra.findMany({ where: { numeroCompra }, select: { empresaId: true } }),
  ]);
  const empresas = Array.from(new Set(candidatas.flat().map((d) => d.empresaId)));
  if (!empresaId || !empresas.includes(empresaId)) empresaId = empresas[0] ?? null;
  if (!empresaId) return NextResponse.json({ error: `Compra ${numeroCompra} não encontrada` }, { status: 404 });

  const where = { numeroCompra, empresaId };
  const [scs, cts, pcs, des] = await Promise.all([
    prisma.necessidadeCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, numero: true, status: true, createdAt: true, prioridade: true, dataNecessidade: true,
        solicitante: true, colaborador: { select: { nome: true } }, setor: { select: { nome: true } },
        itens: ITENS,
      },
    }),
    prisma.cotacaoCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, numero: true, status: true, nome: true, createdAt: true },
    }),
    prisma.pedidoCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, numero: true, numeroAntigo: true, status: true, valorTotal: true, descricao: true, createdAt: true,
        dataEntregaPrevista: true, fornecedor: FORNECEDOR, itens: ITENS,
        conferencia: { select: { id: true, status: true } },
      },
    }),
    prisma.conferenciaCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, numero: true, status: true, pedidoId: true, numeroNF: true, vrTotal: true, createdAt: true,
        fornecedor: FORNECEDOR, itens: ITENS,
      },
    }),
  ]);

  const sc = scs[0] ?? null;
  const vivos = pcs.filter(pedidoVivo);
  const { etapa, concluido } = faseDoProcesso({
    sc,
    cotacoes: cts,
    pedidos: pcs.map((p) => ({ status: p.status, entrada: p.conferencia })),
    entradasAvulsas: des.filter((d) => !d.pedidoId),
  });

  // Documento "atual" de cada etapa: o último aberto, senão o último.
  const docAtual: Record<EtapaCompra, string | null> = {
    solicitacao: sc?.id ?? null,
    cotacao: cts[cts.length - 1]?.id ?? null,
    pedido: (vivos[vivos.length - 1] ?? pcs[pcs.length - 1])?.id ?? null,
    entrada: des[des.length - 1]?.id ?? null,
  };

  const valorPedidos = vivos.reduce((s, p) => s + (num(p.valorTotal) ?? 0), 0);
  const valorEntradas = des.reduce((s, d) => s + (num(d.vrTotal) ?? 0), 0);

  const ids = [...scs, ...cts, ...pcs, ...des].map((d) => d.id);
  const etapaDoId = new Map<string, { etapa: EtapaCompra; numero: string }>([
    ...scs.map((d) => [d.id, { etapa: "solicitacao" as const, numero: d.numero }] as const),
    ...cts.map((d) => [d.id, { etapa: "cotacao" as const, numero: d.numero }] as const),
    ...pcs.map((d) => [d.id, { etapa: "pedido" as const, numero: d.numero }] as const),
    ...des.map((d) => [d.id, { etapa: "entrada" as const, numero: d.numero }] as const),
  ]);
  const logs = ids.length
    ? await prisma.compraStatusLog.findMany({
        where: { documentoId: { in: ids } },
        orderBy: { criadoEm: "desc" },
        take: 200,
        select: { id: true, documentoId: true, statusDe: true, statusPara: true, usuario: true, criadoEm: true },
      })
    : [];

  return NextResponse.json({
    numeroCompra,
    empresaId,
    outrasEmpresas: empresas.filter((e) => e !== empresaId),
    etapa,
    concluido,
    assunto:
      (sc ? resumoItens(sc.itens) : null) ??
      vivos.map((p) => p.descricao || resumoItens(p.itens)).find(Boolean) ??
      des.map((d) => resumoItens(d.itens)).find(Boolean) ??
      cts.map((c) => c.nome).find(Boolean) ??
      null,
    solicitante: sc ? sc.colaborador?.nome ?? sc.solicitante ?? null : null,
    setor: sc?.setor?.nome ?? null,
    prioridade: sc?.prioridade ?? null,
    dataNecessidade: sc?.dataNecessidade?.toISOString() ?? null,
    fornecedor: nomeFornecedor(vivos[0]?.fornecedor) ?? nomeFornecedor(des[0]?.fornecedor),
    valor: valorPedidos > 0 ? valorPedidos : valorEntradas > 0 ? valorEntradas : null,
    entregaPrevista: vivos.find((p) => p.dataEntregaPrevista)?.dataEntregaPrevista?.toISOString() ?? null,
    docAtual,
    documentos: {
      solicitacao: scs.map((d) => ({ id: d.id, numero: d.numero, status: d.status })),
      cotacao: cts.map((d) => ({ id: d.id, numero: d.numero, status: d.status })),
      pedido: pcs.map((d) => ({ id: d.id, numero: d.numero, numeroAntigo: d.numeroAntigo, status: d.status })),
      entrada: des.map((d) => ({ id: d.id, numero: d.numero, status: d.status, numeroNF: d.numeroNF })),
    },
    historico: logs.map((l) => ({
      id: l.id,
      etapa: etapaDoId.get(l.documentoId)?.etapa ?? null,
      numero: etapaDoId.get(l.documentoId)?.numero ?? "",
      statusDe: l.statusDe,
      statusPara: l.statusPara,
      usuario: l.usuario,
      em: l.criadoEm.toISOString(),
    })),
  });
}
