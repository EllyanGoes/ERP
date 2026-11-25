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
        dataAprovacao: true, dataCancelamento: true, aprovadoPor: true, motivoCancelamento: true,
        solicitante: true, colaborador: { select: { nome: true } }, setor: { select: { nome: true } },
        itens: ITENS,
      },
    }),
    prisma.cotacaoCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, numero: true, status: true, nome: true, createdAt: true, dataAprovacao: true,
        aprovacoes: { select: { createdAt: true, respondidoEm: true, status: true, observacao: true, aprovador: { select: { nome: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.pedidoCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, numero: true, numeroAntigo: true, status: true, valorTotal: true, descricao: true, createdAt: true, updatedAt: true,
        dataEntregaPrevista: true, fornecedor: FORNECEDOR, itens: ITENS,
        conferencia: { select: { id: true, status: true } },
        aprovacoes: { select: { createdAt: true, respondidoEm: true, status: true, observacao: true, aprovador: { select: { nome: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.conferenciaCompra.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, numero: true, status: true, pedidoId: true, numeroNF: true, vrTotal: true, createdAt: true,
        dataConferencia: true, dtEmissao: true,
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

  // Títulos a pagar da compra: do pedido (inclusive antecipado) e da entrada.
  const titulos = pcs.length + des.length
    ? await prisma.contaPagar.findMany({
        where: { OR: [{ pedidoCompraId: { in: pcs.map((p) => p.id) } }, { conferenciaId: { in: des.map((d) => d.id) } }] },
        orderBy: [{ dataVencimento: "asc" }, { parcelaNumero: "asc" }],
        select: {
          id: true, numero: true, descricao: true, status: true, antecipado: true,
          parcelaNumero: true, parcelaTotal: true, dataVencimento: true, dataPagamento: true,
          valorOriginal: true, valorPago: true, valorMulta: true, valorJuros: true,
          formaPagamento: true, formaPagamentoPrevista: { select: { nome: true } },
        },
      })
    : [];

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

  // ── Linha do tempo: marcos datados do processo, em ordem ────────────────────
  // `semFase`: o marco aparece na lista mas não abre etapa nas barras (NF do
  // fornecedor, documento cancelado). `foraDeOrdem`: criado antes da etapa
  // anterior começar (documento antigo vinculado depois).
  // `quem`: quem aprovou/reprovou/cancelou. `soData`: data sem hora (NF, conferência antiga).
  type Marco = {
    em: string; etapa: EtapaCompra; label: string; numero?: string; quem?: string | null; soData?: boolean;
    semFase?: boolean; cancelado?: boolean; foraDeOrdem?: boolean;
  };
  const marcos: Marco[] = [];
  const add = (em: Date | null | undefined, etapa: EtapaCompra, label: string, numero?: string, extra: Partial<Marco> = {}) => {
    if (em) marcos.push({ em: em.toISOString(), etapa, label, numero, ...extra });
  };
  const canceladoEm = (id: string, fallback: Date) =>
    logs.find((l) => l.documentoId === id && l.statusPara.startsWith("CANCELAD"))?.criadoEm ?? fallback;

  for (const d of scs) {
    const cancelada = d.status === "CANCELADA" || d.status === "REJEITADA";
    add(d.createdAt, "solicitacao", "Solicitação criada", d.numero, { semFase: cancelada, cancelado: cancelada });
    add(d.dataAprovacao, "solicitacao", "Solicitação aprovada", d.numero, { semFase: cancelada, quem: d.aprovadoPor });
    add(d.dataCancelamento, "solicitacao", d.motivoCancelamento ? `Solicitação cancelada — ${d.motivoCancelamento}` : "Solicitação cancelada", d.numero, { semFase: true, cancelado: true });
  }
  for (const d of cts) {
    add(d.createdAt, "cotacao", "Cotação aberta", d.numero);
    // Cada envio/decisão de aprovação, com o aprovador.
    for (const a of d.aprovacoes) {
      const nome = a.aprovador?.nome ?? null;
      add(a.createdAt, "cotacao", nome ? `Cotação enviada para aprovação de ${nome}` : "Cotação enviada para aprovação", d.numero);
      if (a.status === "APROVADO") add(a.respondidoEm, "cotacao", "Cotação aprovada", d.numero, { quem: nome });
      if (a.status === "REPROVADO") {
        add(a.respondidoEm, "cotacao", a.observacao ? `Cotação reprovada — ${a.observacao}` : "Cotação reprovada", d.numero, { quem: nome, semFase: true });
      }
    }
    // Aprovação antiga sem registro de aprovador: só a data.
    if (d.dataAprovacao && !d.aprovacoes.some((a) => a.status === "APROVADO")) {
      add(d.dataAprovacao, "cotacao", "Cotação aprovada", d.numero);
    }
  }
  for (const d of pcs) {
    const cancelado = d.status === "CANCELADO";
    add(d.createdAt, "pedido", "Pedido emitido", d.numero, { semFase: cancelado, cancelado });
    // Pedido editado depois de aprovado volta para aprovação.
    for (const a of d.aprovacoes) {
      const nome = a.aprovador?.nome ?? null;
      add(a.createdAt, "pedido", nome ? `Pedido alterado enviado para aprovação de ${nome}` : "Pedido alterado enviado para aprovação", d.numero, { semFase: true });
      if (a.status === "APROVADO") add(a.respondidoEm, "pedido", "Alteração do pedido aprovada", d.numero, { quem: nome, semFase: true });
      if (a.status === "REPROVADO") add(a.respondidoEm, "pedido", "Alteração do pedido reprovada", d.numero, { quem: nome, semFase: true });
    }
    if (cancelado) add(canceladoEm(d.id, d.updatedAt), "pedido", "Pedido cancelado", d.numero, { semFase: true, cancelado: true });
  }
  for (const d of des) {
    add(d.dtEmissao, "entrada", "Nota fiscal emitida", d.numeroNF ? `NF ${d.numeroNF}` : d.numero, { semFase: true, soData: true });
    add(d.createdAt, "entrada", "Mercadoria recebida (entrada aberta)", d.numero);
    if (d.status === "CONCLUIDA") {
      // dataConferencia é só a data; o horário real vem do histórico de status.
      const log = logs.find((l) => l.documentoId === d.id && l.statusPara === "CONCLUIDA");
      if (log) add(log.criadoEm, "entrada", "Entrada concluída", d.numero, { quem: log.usuario });
      else add(d.dataConferencia ?? null, "entrada", "Entrada concluída", d.numero, { soData: true });
    }
  }
  marcos.sort((a, b) => a.em.localeCompare(b.em));

  // Etapas pela ordem REAL das datas: cada uma vai do seu 1º marco até o início
  // da próxima (a última, até a conclusão ou agora). Assim nenhuma passa de 100%.
  const ORDEM: EtapaCompra[] = ["solicitacao", "cotacao", "pedido", "entrada"];
  const inicioDe = (e: EtapaCompra) => marcos.find((m) => m.etapa === e && !m.semFase)?.em ?? null;
  const ultimoValido = [...marcos].reverse().find((m) => !m.semFase)?.em ?? null;
  const fimProcesso = concluido ? ultimoValido : new Date().toISOString();
  const inicios = ORDEM
    .map((etapa) => ({ etapa, inicio: inicioDe(etapa) }))
    .filter((x): x is { etapa: EtapaCompra; inicio: string } => !!x.inicio)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const fases = inicios.map((f, i) => {
    const proxima = inicios[i + 1]?.inicio ?? null;
    return { etapa: f.etapa, inicio: f.inicio, fim: proxima ?? fimProcesso, emAndamento: !proxima && !concluido };
  });

  // Marco de etapa posterior datado antes do início de uma etapa anterior.
  for (const m of marcos) {
    const idx = ORDEM.indexOf(m.etapa);
    const anterior = ORDEM.slice(0, idx).map(inicioDe).filter((x): x is string => !!x);
    if (m.label.endsWith("emitido") || m.label.endsWith("aberta") || m.label.endsWith("criada")) {
      if (anterior.some((ini) => m.em < ini)) m.foraDeOrdem = true;
    }
  }

  return NextResponse.json({
    numeroCompra,
    marcos,
    fases,
    empresaId,
    outrasEmpresas: empresas.filter((e) => e !== empresaId),
    etapa,
    concluido,
    // Cancelada: nada vivo — SC cancelada/rejeitada (ou sem SC), cotações
    // canceladas/concluídas sem pedido vivo, nenhuma entrada; e ao menos um
    // documento de fato cancelado (senão é só compra vazia).
    cancelada:
      vivos.length === 0 && des.length === 0 &&
      (!sc || ["CANCELADA", "REJEITADA"].includes(sc.status)) &&
      cts.every((c) => c.status === "CANCELADA" || c.status === "CONCLUIDA") &&
      (sc != null || cts.some((c) => c.status === "CANCELADA")),
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
    pagamentos: titulos.map((t) => ({
      id: t.id, numero: t.numero, descricao: t.descricao, status: t.status, antecipado: t.antecipado,
      parcela: t.parcelaTotal ? `${t.parcelaNumero}/${t.parcelaTotal}` : null,
      vencimento: t.dataVencimento?.toISOString() ?? null,
      pagoEm: t.dataPagamento?.toISOString() ?? null,
      valor: Number(t.valorOriginal) + Number(t.valorMulta) + Number(t.valorJuros),
      pago: Number(t.valorPago),
      forma: t.formaPagamento ?? t.formaPagamentoPrevista?.nome ?? null,
    })),
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
