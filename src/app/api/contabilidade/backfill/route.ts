export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTituloReceber, contabilizarTituloPagar, contabilizarEntradaEstoque, contabilizarCmvMinuta, contabilizarReceitaMinuta, contabilizarVendaPedido, contabilizarSaldoInicialEstoque, contabilizarLoteMovimentacao, apagarLancamentosContabeis } from "@/lib/contabilidade";

// Progresso e última execução persistidos em Configuracao (key-value). Como o
// status mora no banco (e não na memória de uma instância), a barra sobrevive a
// trocar de aba/sessão e funciona em serverless atrás de pooler. O job atualiza
// um `heartbeat` a cada lote; se parar de bater por mais que HEARTBEAT_MS,
// consideramos o job morto (crash) — sem trava presa eternamente.
const PROGRESSO_KEY = "reprocesso:progresso";
const ULTIMA_KEY = "reprocesso:ultimaExecucao";
const HEARTBEAT_MS = 90_000;

type Progresso = { running: boolean; pct: number; fase: string; processados?: number; total?: number; heartbeat: number };

async function lerProgresso(): Promise<Progresso | null> {
  const row = await prismaSemEscopo.configuracao.findUnique({ where: { chave: PROGRESSO_KEY } });
  if (!row?.valor) return null;
  try { return JSON.parse(row.valor) as Progresso; } catch { return null; }
}
function estaRodando(p: Progresso | null): boolean {
  return !!(p?.running && p.heartbeat && Date.now() - p.heartbeat < HEARTBEAT_MS);
}
async function gravarProgresso(p: Progresso) {
  const valor = JSON.stringify(p);
  try {
    await prismaSemEscopo.configuracao.upsert({
      where: { chave: PROGRESSO_KEY },
      create: { chave: PROGRESSO_KEY, valor },
      update: { valor },
    });
  } catch { /* progresso é best-effort */ }
}

async function registrarUltimaExecucao(payload: Record<string, unknown>) {
  const valor = JSON.stringify({ at: new Date().toISOString(), ...payload });
  try {
    await prismaSemEscopo.configuracao.upsert({
      where: { chave: ULTIMA_KEY },
      create: { chave: ULTIMA_KEY, valor },
      update: { valor },
    });
  } catch { /* best-effort */ }
}

// GET /api/contabilidade/backfill — status: `{ running, progresso, ultima }`.
// Tudo vem da Configuracao: `running` é o heartbeat ainda fresco; `progresso`
// (% e fase) e `ultima` (quando rodou por último) são lidos do banco — então a
// UI reconstrói a barra mesmo se o job foi iniciado em outra aba/sessão.
export async function GET() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const p = await lerProgresso();
  const running = estaRodando(p);
  const progresso = running && p ? { pct: p.pct, fase: p.fase, processados: p.processados, total: p.total } : null;
  let ultima: { at: string; processados?: number; total?: number; erros?: number; ok?: boolean; error?: string } | null = null;
  const ultimaRow = await prismaSemEscopo.configuracao.findUnique({ where: { chave: ULTIMA_KEY } });
  if (ultimaRow?.valor) { try { ultima = JSON.parse(ultimaRow.valor); } catch { /* ignore */ } }
  return NextResponse.json({ running, progresso, ultima });
}

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

  // Guarda contra execução concorrente (clique duplo / refresh + reclique): se já
  // há um reprocesso com heartbeat recente, recusa. Heartbeat em vez de advisory
  // lock — confiável em pooler e sem ficar preso após um crash.
  if (estaRodando(await lerProgresso())) {
    return NextResponse.json({ error: "Já há um reprocesso em execução. Aguarde ele terminar antes de rodar de novo." }, { status: 409 });
  }
  // Marca como rodando JÁ (fecha a janela de corrida do duplo clique).
  await gravarProgresso({ running: true, pct: 0, fase: "Iniciando", processados: 0, total: 0, heartbeat: Date.now() });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let processados = 0;
      const erros: string[] = [];
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* stream fechado */ }
      };
      // Atualiza progresso + heartbeat (running=true) p/ a UI reconstruir a barra.
      const tick = (pct: number, fase: string, total: number) =>
        gravarProgresso({ running: true, pct, fase, processados, total, heartbeat: Date.now() });

      try {
        // Limpa partidas órfãs (lançamento já apagado, partida ficou) — sem FK em
        // cascata no banco, deletes antigos podem ter deixado lixo que corrompe o saldo.
        await prismaSemEscopo.$executeRaw`DELETE FROM "PartidaContabil" p WHERE NOT EXISTS (SELECT 1 FROM "LancamentoContabil" l WHERE l.id = p."lancamentoId")`;

        // ?reset=vendas → apaga venda/entrega/recebimento (E suas partidas) e regrava
        // do zero (modelo clássico: D Clientes / C Material a Entregar na confirmação).
        if (reset === "vendas") {
          await apagarLancamentosContabeis({ origemTipo: { in: ["VENDA", "RECEITA_ENTREGA", "RECEBIMENTO"] } });
        }
        // Batimento extra antes da coleta (apagar pode demorar e não tem ticks).
        await gravarProgresso({ running: true, pct: 0, fase: "Preparando", processados: 0, total: 0, heartbeat: Date.now() });

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
        await tick(0, "Preparando", total);

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
            await tick(pct(), fase, total);
          }
          // Garante um tick de progresso mesmo quando a fase não tem itens.
          if (itens.length === 0) { send({ total, processados, pct: pct(), fase }); await tick(pct(), fase, total); }
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
        await gravarProgresso({ running: false, pct: 100, fase: "Concluído", processados, total, heartbeat: Date.now() });
        await registrarUltimaExecucao({ ok: true, processados, total, erros: erros.length });
      } catch (e) {
        send({ done: true, error: (e as Error).message });
        await gravarProgresso({ running: false, pct: 0, fase: "Erro", processados, heartbeat: Date.now() });
        await registrarUltimaExecucao({ ok: false, error: (e as Error).message });
      } finally {
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
