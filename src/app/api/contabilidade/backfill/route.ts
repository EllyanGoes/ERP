export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTituloReceber, contabilizarTituloPagar, contabilizarEntradaEstoque, contabilizarCmvMinuta, contabilizarReceitaMinuta, contabilizarVendaPedido, contabilizarSaldoInicialEstoque, contabilizarLoteMovimentacao, apagarLancamentosContabeis } from "@/lib/contabilidade";

// POST /api/contabilidade/backfill
// Gera (idempotente) os lançamentos contábeis retroativos a partir dos títulos
// já existentes — contas a receber (venda + recebimento) e a pagar (compra +
// pagamento). Reusa os mesmos helpers dos hooks ao vivo.
//
// Resposta em STREAM (SSE): emite o progresso `{ pct, processados, total, fase }`
// linha a linha e, no fim, um evento `{ done: true, processados, erros }`, para a
// UI mostrar a porcentagem concluída em tempo real.
export async function POST(req: Request) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const reset = new URL(req.url).searchParams.get("reset");

  // Trava contra execução concorrente (clique duplo / refresh + reclique): o
  // reprocesso apaga e regrava em massa; dois rodando juntos se atropelam e
  // deixam o balanço inconsistente. Advisory lock global; liberado no finally.
  const LOCK_KEY = 778899;
  const [{ locked }] = await prismaSemEscopo.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
  if (!locked) {
    return NextResponse.json({ error: "Já há um reprocesso em execução. Aguarde ele terminar antes de rodar de novo." }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let processados = 0;
      const erros: string[] = [];
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* stream fechado */ }
      };

      try {
        // Limpa partidas órfãs (lançamento já apagado, partida ficou) — sem FK em
        // cascata no banco, deletes antigos podem ter deixado lixo que corrompe o saldo.
        await prismaSemEscopo.$executeRaw`DELETE FROM "PartidaContabil" p WHERE NOT EXISTS (SELECT 1 FROM "LancamentoContabil" l WHERE l.id = p."lancamentoId")`;

        // ?reset=vendas → apaga venda/entrega/recebimento (E suas partidas) e regrava
        // do zero (modelo clássico: D Clientes / C Material a Entregar na confirmação).
        if (reset === "vendas") {
          await apagarLancamentosContabeis({ origemTipo: { in: ["VENDA", "RECEITA_ENTREGA", "RECEBIMENTO"] } });
        }

        // Coleta tudo primeiro para saber o TOTAL e calcular a porcentagem.
        const [empresas, confs, pedidos, crs, cps, minutas, lotes] = await Promise.all([
          prismaSemEscopo.empresa.findMany({ select: { id: true } }),
          prismaSemEscopo.conferenciaCompra.findMany({ where: { status: "CONCLUIDA" }, select: { id: true, numero: true } }),
          prismaSemEscopo.pedidoVenda.findMany({ where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] }, intragrupo: false }, select: { id: true, numero: true } }),
          prismaSemEscopo.contaReceber.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true, numero: true } }),
          prismaSemEscopo.contaPagar.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true, numero: true } }),
          prismaSemEscopo.minuta.findMany({ where: { status: { in: ["SAIU_PARA_ENTREGA", "ENTREGUE"] } }, select: { id: true, numero: true } }),
          prismaSemEscopo.loteMovimentacao.findMany({ select: { id: true, numero: true } }),
        ]);

        const total = empresas.length + confs.length + pedidos.length + crs.length + cps.length + minutas.length + lotes.length;
        const pct = () => (total > 0 ? Math.min(99, Math.round((processados / total) * 100)) : 100);
        send({ total, processados: 0, pct: 0, fase: "Preparando" });

        // Processa itens em LOTES paralelos (acelera ~Nx os round-trips ao banco). A
        // criação de contas analíticas é resiliente a corrida (criarAnaliticaComRetry),
        // e cada origem aparece uma vez por fase — seguro para idempotência.
        const LOTE = 20;
        const emLotes = async <T,>(itens: T[], rotulo: (t: T) => string, fn: (t: T) => Promise<void>, fase: string) => {
          for (let i = 0; i < itens.length; i += LOTE) {
            await Promise.all(itens.slice(i, i + LOTE).map(async (it) => {
              try { await fn(it); processados++; }
              catch (e) { erros.push(`${rotulo(it)}: ${(e as Error).message}`); processados++; }
            }));
            send({ total, processados, pct: pct(), fase });
          }
          // Garante um tick de progresso mesmo quando a fase não tem itens.
          if (itens.length === 0) send({ total, processados, pct: pct(), fase });
        };

        // 0) Saldo de abertura de estoque por empresa (antes das saídas).
        await emLotes(empresas, (e) => `Abertura estoque ${e.id}`, (e) => contabilizarSaldoInicialEstoque(e.id), "Abertura de estoque");
        // 1) Entradas de estoque (conferências) — ANTES das CPs (fornecedor já creditado).
        await emLotes(confs, (c) => `Conf ${c.numero}`, (c) => contabilizarEntradaEstoque(c.id), "Entradas de estoque");
        // Venda pelo PEDIDO (D Clientes / C Material a Entregar).
        await emLotes(pedidos, (p) => `Pedido ${p.numero}`, (p) => contabilizarVendaPedido(p.id), "Vendas (pedidos)");
        // Contas a receber: venda avulsa + recebimento.
        await emLotes(crs, (cr) => `CR ${cr.numero}`, (cr) => contabilizarTituloReceber(cr.id), "Contas a receber");
        // Contas a pagar (inclui sem fornecedor: despesa direta ou passivo da natureza).
        await emLotes(cps, (cp) => `CP ${cp.numero}`, (cp) => contabilizarTituloPagar(cp.id), "Contas a pagar");
        // 2) CMV + Receita na entrega (minutas com saída de estoque).
        await emLotes(minutas, (m) => `Minuta ${m.numero}`, async (m) => { await contabilizarCmvMinuta(m.id); await contabilizarReceitaMinuta(m.id); }, "CMV / receita");
        // 3) Lotes de movimentação manual (entradas/transferências/ajustes).
        await emLotes(lotes, (l) => `Lote ${l.numero}`, (l) => contabilizarLoteMovimentacao(l.id), "Movimentações manuais");

        send({ done: true, ok: true, processados, total, pct: 100, erros: erros.slice(0, 20) });
      } catch (e) {
        send({ done: true, error: (e as Error).message });
      } finally {
        await prismaSemEscopo.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
