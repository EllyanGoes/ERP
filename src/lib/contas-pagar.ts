import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateSimpleDocNumber } from "@/lib/utils";
import { detalheItens } from "@/lib/detalhe-itens";
import { calcularParcelas, type CondicaoParcelas, type Parcela } from "@/lib/parcelas";

/**
 * Classificação SUGERIDA de um Documento de Entrada para o(s) título(s) que ele
 * gera. A natureza agora é POR LINHA (item.naturezaFinanceiraId, default vindo
 * da sugestão do TES): `porNatureza` agrega o vlrTotal das linhas-pai pela
 * natureza efetiva da linha (item > TES; null = sem natureza, resolvida pelo
 * cabeçalho do DE na conclusão). `naturezaTesId`/`centroCustoId` continuam a
 * sugestão NÃO-ambígua (único distinto) p/ o nível do título. Default, não trava.
 */
export async function classificacaoSugeridaDaEntrada(
  tx: Prisma.TransactionClient,
  conferenciaId: string,
): Promise<{
  naturezaTesId: string | null;
  centroCustoId: string | null;
  porNatureza: { naturezaFinanceiraId: string | null; valor: number }[];
}> {
  const itens = await tx.conferenciaCompraItem.findMany({
    where: { conferenciaId, paiId: null },
    select: {
      centroCustoId: true,
      naturezaFinanceiraId: true,
      vlrTotal: true,
      tes: { select: { naturezaSugeridaId: true } },
    },
  });
  const unico = (vals: (string | null)[]): string | null => {
    const set = Array.from(new Set(vals.filter((v): v is string => !!v)));
    return set.length === 1 ? set[0] : null;
  };
  const porNat = new Map<string | null, number>();
  for (const i of itens) {
    const nat = i.naturezaFinanceiraId ?? i.tes?.naturezaSugeridaId ?? null;
    const v = i.vlrTotal != null ? parseFloat(String(i.vlrTotal)) : 0;
    if (!(v > 0)) continue;
    porNat.set(nat, (porNat.get(nat) ?? 0) + v);
  }
  return {
    naturezaTesId: unico(itens.map((i) => i.tes?.naturezaSugeridaId ?? null)),
    centroCustoId: unico(itens.map((i) => i.centroCustoId)),
    porNatureza: Array.from(porNat.entries()).map(([naturezaFinanceiraId, valor]) => ({ naturezaFinanceiraId, valor })),
  };
}

/** Fatia do rateio por natureza (frações somam 1; ordenadas da maior p/ menor). */
export type DistNatureza = { naturezaFinanceiraId: string; frac: number };

/**
 * Distribuição percentual por natureza a partir do agregado das linhas do DE.
 * Linhas SEM natureza caem no `fallback` (cabeçalho do DE > TES-único); buckets
 * da mesma natureza são somados. [] quando nada resolve.
 */
export function distribuicaoNaturezas(
  porNatureza: { naturezaFinanceiraId: string | null; valor: number }[],
  fallback: string | null,
): DistNatureza[] {
  const soma = new Map<string, number>();
  let total = 0;
  for (const b of porNatureza) {
    const nat = b.naturezaFinanceiraId ?? fallback;
    if (!nat || !(b.valor > 0)) continue;
    soma.set(nat, (soma.get(nat) ?? 0) + b.valor);
    total += b.valor;
  }
  if (total <= 0) return [];
  return Array.from(soma.entries())
    .map(([naturezaFinanceiraId, v]) => ({ naturezaFinanceiraId, frac: v / total }))
    .sort((a, b) => b.frac - a.frac);
}

/**
 * Pré-preenche o rateio gerencial (split de naturezas) de um título recém-criado
 * pela DISTRIBUIÇÃO das linhas do DE (multi-natureza; a última fatia absorve o
 * arredondamento). É o mesmo registro que a baixa edita (ContaPagarNatureza) —
 * o título já nasce classificado.
 */
export async function criarRateioInicialCp(
  tx: Prisma.TransactionClient,
  contaPagarId: string,
  dist: DistNatureza[],
  valor: number,
): Promise<void> {
  if (!(valor > 0) || dist.length === 0) return;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let acumulado = 0;
  for (let i = 0; i < dist.length; i++) {
    const v = i === dist.length - 1 ? r2(valor - acumulado) : r2(valor * dist[i].frac);
    acumulado = r2(acumulado + v);
    if (!(v > 0)) continue;
    await tx.contaPagarNatureza.create({
      data: { contaPagarId, naturezaFinanceiraId: dist[i].naturezaFinanceiraId, valor: v },
    });
  }
}

/**
 * Gera as contas a PAGAR de um pedido de compra a partir do Documento de Entrada,
 * conforme a CONDIÇÃO DE PAGAMENTO (à vista / a prazo / parcelado / sem
 * vencimento). Todos nascem ABERTA, vinculados ao pedido de compra. Espelho de
 * `gerarContasReceberDoPedido`.
 */
export async function gerarContasPagarDoDocumento(
  tx: Prisma.TransactionClient,
  doc: {
    empresaId: string; fornecedorId: string | null; pedidoCompraId: string;
    // Documento de Entrada que originou o título (ausente no PA, que nasce no pedido).
    conferenciaId?: string | null;
    numeroPedido: string; valorTotal: unknown; dataBase: Date | string; naturezaFinanceiraId?: string | null;
    // Centro de custo do documento de entrada (único distinto dos itens) — vai
    // no NÍVEL do título (classificação gerencial editável no financeiro).
    centroCustoId?: string | null;
    // Forma de pagamento PREVISTA (meio de quitação, ex.: permuta) — herdada do DE.
    formaPagamentoPrevistaId?: string | null;
    // Distribuição multi-natureza das linhas do DE p/ o rateio inicial de cada
    // parcela; ausente → 1 linha com naturezaFinanceiraId (compat).
    distNaturezas?: DistNatureza[];
    // PA: título nascido no PEDIDO (adiantamento a fornecedor), não na entrada.
    antecipado?: boolean;
    // Grade de parcelas EDITADA manualmente no DE (parcelasCustom): quando
    // presente, substitui calcularParcelas — o chamador já validou a soma.
    parcelasProntas?: Parcela[];
  },
  condicao: CondicaoParcelas,
): Promise<number> {
  // Detalhe dos itens do pedido na descrição (como no razão): "Compra PC-X — 10×
  // Cimento × R$ 30; 5× Areia × R$ 50".
  const itensPc = await tx.pedidoCompraItem.findMany({
    where: { pedidoId: doc.pedidoCompraId },
    select: { quantidade: true, precoUnitario: true, item: { select: { descricao: true } } },
  });
  const det = detalheItens(itensPc);
  const antecipado = doc.antecipado === true;
  const baseDesc = `Compra ${doc.numeroPedido}${antecipado ? " (PA)" : ""}${det ? ` — ${det}` : ""}`;

  const parcelas = doc.parcelasProntas ?? calcularParcelas(condicao, doc.valorTotal, doc.dataBase);
  for (const p of parcelas) {
    const numero = generateSimpleDocNumber("CP", await proximaSequenciaDaEmpresa(doc.empresaId, "CP"));
    const cp = await tx.contaPagar.create({
      data: {
        empresaId: doc.empresaId,
        numero,
        fornecedorId: doc.fornecedorId,
        pedidoCompraId: doc.pedidoCompraId,
        conferenciaId: doc.conferenciaId ?? null,
        antecipado,
        naturezaFinanceiraId: doc.naturezaFinanceiraId ?? null,
        centroCustoId: doc.centroCustoId ?? null,
        formaPagamentoPrevistaId: doc.formaPagamentoPrevistaId ?? null,
        descricao: p.parcelaTotal ? `${baseDesc} (${p.parcelaNumero}/${p.parcelaTotal})` : baseDesc,
        valorOriginal: p.valor,
        dataVencimento: p.dataVencimento,
        status: "ABERTA",
        ...(p.grupoParcelamentoId ? { grupoParcelamentoId: p.grupoParcelamentoId, parcelaNumero: p.parcelaNumero, parcelaTotal: p.parcelaTotal } : {}),
      },
    });
    // O título nasce com o split de naturezas preenchido (1 linha = a parcela).
    await criarRateioInicialCp(
      tx, cp.id,
      doc.distNaturezas ?? (doc.naturezaFinanceiraId ? [{ naturezaFinanceiraId: doc.naturezaFinanceiraId, frac: 1 }] : []),
      Number(p.valor),
    );
  }
  return parcelas.length;
}

/**
 * PA (pagamento antecipado): gera o(s) título(s) a pagar JÁ NO PEDIDO quando a
 * condição de pagamento é marcada como `pagamentoAntecipado`. O título nasce
 * ABERTA (adiantamento a fornecedor); ao ser pago, contabiliza D Adiantamento a
 * Fornecedores / C Banco. Idempotente pelo guard `count(pedidoCompraId) === 0` —
 * a conferência não duplica. Best-effort: chamado pós-commit na criação do pedido.
 */
export async function gerarContasPagarAntecipadoDoPedido(pedidoId: string): Promise<number> {
  // prismaSemEscopo: chamado de webhooks/aprovações que podem agir sobre pedido de
  // OUTRA empresa (compras em grupo) — o escopo estouraria P2025. empresaId é explícito.
  const { prismaSemEscopo: prisma } = await import("@/lib/prisma");
  const pedido = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: {
      id: true, empresaId: true, fornecedorId: true, numero: true, valorTotal: true,
      intragrupo: true, createdAt: true, condicaoPagamentoId: true,
      condicaoPagamentoRef: true,
    },
  });
  if (!pedido || pedido.intragrupo) return 0;
  const condicao = pedido.condicaoPagamentoRef;
  if (!condicao?.pagamentoAntecipado) return 0;

  const { recontabilizarTituloPagar } = await import("@/lib/contabilidade");
  const criados = await prisma.$transaction(async (tx) => {
    const jaTem = await tx.contaPagar.count({ where: { pedidoCompraId: pedido.id } });
    if (jaTem > 0) return [] as string[];
    const valorTotal = Number(pedido.valorTotal ?? 0);
    if (valorTotal <= 0) return [] as string[];
    await gerarContasPagarDoDocumento(tx, {
      empresaId: pedido.empresaId,
      fornecedorId: pedido.fornecedorId,
      pedidoCompraId: pedido.id,
      numeroPedido: pedido.numero,
      valorTotal,
      dataBase: pedido.createdAt,
      antecipado: true,
    }, condicao);
    const cps = await tx.contaPagar.findMany({ where: { pedidoCompraId: pedido.id }, select: { id: true } });
    return cps.map((c) => c.id);
  });
  for (const id of criados) await recontabilizarTituloPagar(id).catch(() => null);
  return criados.length;
}
