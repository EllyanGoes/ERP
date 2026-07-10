// ─────────────────────────────────────────────────────────────────────────────
// Máquina de STATUS do Pedido de Venda — compartilhada pelas DUAS rotas que
// mudam status (PATCH /api/pedidos-venda/[id] e PATCH /api/pedidos-venda/[id]/status).
// Antes cada rota tinha a sua cópia e elas divergiam: /status validava a máquina
// mas cancelava SEM reverter; [id] revertia mas aceitava qualquer transição.
// Aqui: uma máquina, uma reversão de cancelamento e os mesmos espelhos.
//
// Decisão jul/2026 (v2): o CONTAS A RECEBER nasce na CONFIRMAÇÃO do pedido,
// conforme a NEGOCIAÇÃO (valor total + parcelas da condição de pagamento) —
// independe da entrega (faturarPedido). A confirmação também gera o
// lançamento contábil da venda (modelo clássico).
// ─────────────────────────────────────────────────────────────────────────────
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { getItensPendentesEntrega, type ItemPendenteEntrega } from "@/lib/pedido-totais";
import { faturarPedido } from "@/lib/contas-receber";
import { contabilizarPedidoVenda } from "@/lib/contabilidade";
import {
  espelharConfirmacaoVenda,
  cancelarEspelhoVenda,
  espelharEntregaTriangular,
  cancelarEntregaTriangular,
} from "@/lib/intragrupo";

export type StatusPedidoVenda = "ORCAMENTO" | "CONFIRMADO" | "EM_AGENDAMENTO" | "CONCLUIDO" | "CANCELADO";

export const STATUS_PEDIDO_VENDA: StatusPedidoVenda[] = [
  "ORCAMENTO", "CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO", "CANCELADO",
];

// ORCAMENTO só é alcançável via override de admin (reverter cancelamento, etc.).
export const TRANSITIONS: Record<StatusPedidoVenda, StatusPedidoVenda[]> = {
  ORCAMENTO:      ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO:     ["EM_AGENDAMENTO", "CANCELADO"],
  EM_AGENDAMENTO: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO:      [],
  CANCELADO:      [],
};

export type MudancaStatusResultado =
  | { ok: true; data: { id: string; status: string } }
  | { ok: false; status: number; error: string; pendentes?: ItemPendenteEntrega[] };

/**
 * Cancelamento em cadeia: cancela as necessidades de ENTREGA (minutas) e de
 * PAGAMENTO (contas a receber) do pedido, reverte o estoque das entregas e o
 * caixa dos recebimentos, e reflete no CONTÁBIL apagando os lançamentos do
 * pedido/minutas/títulos (coerente com o reprocesso: contabilizar* pula
 * cancelados). Tudo numa transação.
 */
async function cancelarPedidoVendaEmCadeia(pedidoVendaId: string): Promise<void> {
  await prismaSemEscopo.$transaction(async (tx) => {
    const ped = await tx.pedidoVenda.findUnique({
      where: { id: pedidoVendaId },
      select: {
        id: true, numero: true, empresaId: true,
        itens: { select: { id: true } },
        minutas: { select: { id: true, numero: true } },
        contasReceber: { select: { id: true } },
      },
    });
    if (!ped) return;
    const itemIds = ped.itens.map((i) => i.id);
    const minutaNumeros = ped.minutas.map((m) => m.numero);
    const minutaIds = ped.minutas.map((m) => m.id);
    const crIds = ped.contasReceber.map((c) => c.id);

    // 1) Reverte o estoque das minutas (devolve o saldo) e apaga as movimentações.
    const movs = await tx.movimentacaoEstoque.findMany({
      where: {
        OR: [
          ...(minutaNumeros.length ? [{ documento: { in: minutaNumeros } }] : []),
          ...(itemIds.length ? [{ pedidoVendaItemId: { in: itemIds } }] : []),
        ],
      },
      select: { id: true, itemId: true, localEstoqueId: true, clienteDonoId: true, tipo: true, quantidade: true, loteId: true },
    });
    const afetados = new Set<string>();
    const loteIds = new Set<string>();
    for (const mv of movs) {
      if (mv.loteId) loteIds.add(mv.loteId);
      if (!mv.localEstoqueId) continue;
      const qtd = Number(mv.quantidade);
      const efeito = mv.tipo === "ENTRADA" ? qtd : mv.tipo === "SAIDA" ? -qtd : 0;
      if (efeito !== 0) {
        await tx.estoqueItem.updateMany({
          where: { itemId: mv.itemId, localEstoqueId: mv.localEstoqueId, clienteDonoId: mv.clienteDonoId ?? null },
          data: { quantidadeAtual: { decrement: efeito } },
        });
      }
      afetados.add(`${mv.itemId}|${mv.localEstoqueId}|${mv.clienteDonoId ?? ""}`);
    }
    if (movs.length) await tx.movimentacaoEstoque.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
    for (const chave of Array.from(afetados)) {
      const [itemId, localEstoqueId, dono] = chave.split("|");
      await recalcularSaldos(tx, itemId, localEstoqueId, dono || null);
    }
    for (const loteId of Array.from(loteIds)) {
      const restantes = await tx.movimentacaoEstoque.count({ where: { loteId } });
      if (restantes === 0) await tx.loteMovimentacao.delete({ where: { id: loteId } }).catch(() => {});
    }

    // 2) Necessidades de ENTREGA: minutas → CANCELADA.
    if (minutaIds.length) {
      await tx.minuta.updateMany({ where: { id: { in: minutaIds }, status: { not: "CANCELADA" } }, data: { status: "CANCELADA" } });
    }
    // 3) Necessidades de PAGAMENTO: contas a receber → CANCELADA (reverte o caixa).
    if (crIds.length) {
      await tx.lancamentoFinanceiro.deleteMany({ where: { contaReceberId: { in: crIds } } });
      await tx.contaReceber.updateMany({
        where: { id: { in: crIds }, status: { not: "CANCELADA" } },
        data: { status: "CANCELADA", valorPago: 0, dataPagamento: null },
      });
    }

    // 4) CONTÁBIL: apaga os lançamentos gerados pelo pedido, minutas e títulos.
    //    PartidaContabil NÃO cascateia no banco → apaga as partidas ANTES do
    //    lançamento (senão ficam órfãs corrompendo o balanço). Cancelados não
    //    são recontabilizados.
    const lancsCancelar = await tx.lancamentoContabil.findMany({
      where: {
        empresaId: ped.empresaId,
        OR: [
          { origemTipo: "VENDA", origemId: ped.id },
          ...(crIds.length ? [{ origemTipo: { in: ["VENDA", "RECEBIMENTO"] as ("VENDA" | "RECEBIMENTO")[] }, origemId: { in: crIds } }] : []),
          ...(minutaIds.length ? [{ origemTipo: { in: ["RECEITA_ENTREGA", "ESTOQUE_SAIDA"] as ("RECEITA_ENTREGA" | "ESTOQUE_SAIDA")[] }, origemId: { in: minutaIds } }] : []),
        ],
      },
      select: { id: true },
    });
    if (lancsCancelar.length) {
      const lancIds = lancsCancelar.map((l) => l.id);
      await tx.partidaContabil.deleteMany({ where: { lancamentoId: { in: lancIds } } });
      await tx.lancamentoContabil.deleteMany({ where: { id: { in: lancIds } } });
    }

    // 5) Status do pedido.
    await tx.pedidoVenda.update({ where: { id: ped.id }, data: { status: "CANCELADO" } });
  });
}

/**
 * Aplica uma mudança de status ao pedido de venda: valida a máquina de
 * transições (override só p/ ADMIN), bloqueia CONCLUIDO com material pendente,
 * reverte tudo no CANCELADO (estoque/caixa/contábil/espelhos) e dispara os
 * efeitos pós-mudança (espelhos intragrupo/triangular, faturamento na entrega
 * como rede de segurança e contabilização).
 */
export async function mudarStatusPedidoVenda(opts: {
  pedidoVendaId: string;
  novoStatus: StatusPedidoVenda;
  perfil: string | null | undefined;
  override?: boolean;
  dataConclusao?: string | null;
}): Promise<MudancaStatusResultado> {
  const { pedidoVendaId: id, novoStatus } = opts;
  const override = opts.override === true;

  const pedido = await prisma.pedidoVenda.findUnique({ where: { id } });
  if (!pedido) return { ok: false, status: 404, error: "Pedido não encontrado" };

  // Override só para ADMIN. Quando ativo, pula a validação da máquina de estados.
  if (override && opts.perfil !== "ADMIN") {
    return { ok: false, status: 403, error: "Apenas administradores podem forçar o status." };
  }
  if (pedido.status === novoStatus) {
    return { ok: true, data: { id: pedido.id, status: pedido.status } };
  }
  if (!override) {
    const allowed = TRANSITIONS[pedido.status as StatusPedidoVenda] ?? [];
    if (!allowed.includes(novoStatus)) {
      return { ok: false, status: 422, error: `Transição inválida: ${pedido.status} → ${novoStatus}` };
    }
  }

  // Não permite concluir enquanto houver material pendente de entrega
  // (qtd pedida ainda não totalmente coberta por minutas ENTREGUE). A venda à
  // ordem NÃO tem minuta própria — a entrega é feita no pedido de entrega da
  // origem e a conclusão da venda é automática; por isso não bloqueia aqui.
  if (novoStatus === "CONCLUIDO" && !pedido.estoqueOrigemEmpresaId) {
    const pendentes = await getItensPendentesEntrega(id);
    if (pendentes.length > 0) {
      return {
        ok: false, status: 422,
        error: "Há material pendente de entrega. Conclua as entregas (minutas marcadas como Entregue) antes de finalizar o pedido.",
        pendentes,
      };
    }
  }

  // Cancelamento reverte em cadeia (estoque/caixa/contábil) NOS DOIS caminhos.
  if (novoStatus === "CANCELADO") {
    await cancelarPedidoVendaEmCadeia(id);
    // Intragrupo: cancela a compra espelhada; à ordem: zera o pedido de entrega.
    await cancelarEspelhoVenda(id);
    await cancelarEntregaTriangular(id);
    return { ok: true, data: { id, status: "CANCELADO" } };
  }

  // Ao CONCLUIR, carimba a data de conclusão: usa a informada (lançamento
  // passado) ou o dia de hoje em Brasília, gravada como meia-noite UTC.
  const updateData: { status: StatusPedidoVenda; dataConclusao?: Date } = { status: novoStatus };
  if (novoStatus === "CONCLUIDO") {
    const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const dia = opts.dataConclusao || hojeSP;
    updateData.dataConclusao = new Date(`${dia}T00:00:00.000Z`);
  }

  const updated = await prisma.pedidoVenda.update({ where: { id }, data: updateData });

  // Intragrupo: venda para empresa do grupo gera a compra espelhada. Venda à
  // ordem (triangular): cria o Pedido de Entrega na empresa de origem.
  if (novoStatus === "CONFIRMADO") {
    await espelharConfirmacaoVenda(id);
    await espelharEntregaTriangular(id);
  }

  // Faturamento pela NEGOCIAÇÃO: os títulos nascem na confirmação, pelo valor
  // total do pedido e condição de pagamento (independem da entrega). No
  // CONCLUIDO roda de novo como rede de segurança (idempotente) p/ pedidos
  // confirmados antes desta regra ou editados depois da confirmação.
  if (novoStatus === "CONFIRMADO" || novoStatus === "CONCLUIDO") {
    await faturarPedido(id).catch((e) =>
      console.error(`[pedido-venda-status] faturarPedido(${id}) falhou:`, e));
  }

  // Contabiliza (best-effort, pós-commit) a venda/títulos do pedido.
  await contabilizarPedidoVenda(id).catch(() => {});

  return { ok: true, data: { id: updated.id, status: updated.status } };
}
