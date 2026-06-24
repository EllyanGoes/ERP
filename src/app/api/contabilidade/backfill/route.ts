export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTituloReceber, contabilizarTituloPagar, contabilizarEntradaEstoque, contabilizarCmvMinuta, contabilizarReceitaMinuta, contabilizarVendaPedido, contabilizarSaldoInicialEstoque, contabilizarLoteMovimentacao, apagarLancamentosContabeis } from "@/lib/contabilidade";

// POST /api/contabilidade/backfill
// Gera (idempotente) os lançamentos contábeis retroativos a partir dos títulos
// já existentes — contas a receber (venda + recebimento) e a pagar (compra +
// pagamento). Reusa os mesmos helpers dos hooks ao vivo.
export async function POST(req: Request) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  let processados = 0;
  const erros: string[] = [];

  // Trava contra execução concorrente (clique duplo / refresh + reclique): o
  // reprocesso apaga e regrava em massa; dois rodando juntos se atropelam e
  // deixam o balanço inconsistente. Advisory lock global; liberado no finally.
  const LOCK_KEY = 778899;
  const [{ locked }] = await prismaSemEscopo.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
  if (!locked) {
    return NextResponse.json({ error: "Já há um reprocesso em execução. Aguarde ele terminar antes de rodar de novo." }, { status: 409 });
  }

  try {
  // Processa itens em LOTES paralelos (acelera ~Nx os round-trips ao banco). A
  // criação de contas analíticas é resiliente a corrida (criarAnaliticaComRetry),
  // e cada origem aparece uma vez por fase — seguro para idempotência.
  const LOTE = 20;
  const emLotes = async <T,>(itens: T[], rotulo: (t: T) => string, fn: (t: T) => Promise<void>) => {
    for (let i = 0; i < itens.length; i += LOTE) {
      await Promise.all(itens.slice(i, i + LOTE).map(async (it) => {
        try { await fn(it); processados++; }
        catch (e) { erros.push(`${rotulo(it)}: ${(e as Error).message}`); }
      }));
    }
  };

  // Limpa partidas órfãs (lançamento já apagado, partida ficou) — sem FK em
  // cascata no banco, deletes antigos podem ter deixado lixo que corrompe o saldo.
  await prismaSemEscopo.$executeRaw`DELETE FROM "PartidaContabil" p WHERE NOT EXISTS (SELECT 1 FROM "LancamentoContabil" l WHERE l.id = p."lancamentoId")`;

  // ?reset=vendas → apaga venda/entrega/recebimento (E suas partidas) e regrava
  // do zero (modelo clássico: D Clientes / C Material a Entregar na confirmação).
  const reset = new URL(req.url).searchParams.get("reset");
  if (reset === "vendas") {
    await apagarLancamentosContabeis({ origemTipo: { in: ["VENDA", "RECEITA_ENTREGA", "RECEBIMENTO"] } });
  }

  // 0) Saldo de abertura de estoque por empresa (antes das saídas).
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true } });
  await emLotes(empresas, (e) => `Abertura estoque ${e.id}`, (e) => contabilizarSaldoInicialEstoque(e.id));

  // 1) Entradas de estoque (conferências) — ANTES das CPs (fornecedor já creditado).
  const confs = await prismaSemEscopo.conferenciaCompra.findMany({ where: { status: "CONCLUIDA" }, select: { id: true, numero: true } });
  await emLotes(confs, (c) => `Conf ${c.numero}`, (c) => contabilizarEntradaEstoque(c.id));

  // Venda pelo PEDIDO (D Clientes / C Material a Entregar).
  const pedidos = await prismaSemEscopo.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] }, intragrupo: false },
    select: { id: true, numero: true },
  });
  await emLotes(pedidos, (p) => `Pedido ${p.numero}`, (p) => contabilizarVendaPedido(p.id));

  // Contas a receber: venda avulsa + recebimento.
  const crs = await prismaSemEscopo.contaReceber.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true, numero: true } });
  await emLotes(crs, (cr) => `CR ${cr.numero}`, (cr) => contabilizarTituloReceber(cr.id));

  // Contas a pagar (inclui sem fornecedor: despesa direta ou passivo da natureza).
  const cps = await prismaSemEscopo.contaPagar.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true, numero: true } });
  await emLotes(cps, (cp) => `CP ${cp.numero}`, (cp) => contabilizarTituloPagar(cp.id));

  // 2) CMV + Receita na entrega (minutas com saída de estoque).
  const minutas = await prismaSemEscopo.minuta.findMany({ where: { status: { in: ["SAIU_PARA_ENTREGA", "ENTREGUE"] } }, select: { id: true, numero: true } });
  await emLotes(minutas, (m) => `Minuta ${m.numero}`, async (m) => { await contabilizarCmvMinuta(m.id); await contabilizarReceitaMinuta(m.id); });

  // 3) Lotes de movimentação manual (entradas/transferências/ajustes) — re-sincroniza
  // ao custo ATUAL (ex.: produção lançada na mão no PA, agora avaliada ao custo de
  // produção em vez do preço de venda). Idempotente por lote.
  const lotes = await prismaSemEscopo.loteMovimentacao.findMany({ select: { id: true, numero: true } });
  await emLotes(lotes, (l) => `Lote ${l.numero}`, (l) => contabilizarLoteMovimentacao(l.id));

  return NextResponse.json({ ok: true, processados, erros: erros.slice(0, 20) });
  } finally {
    await prismaSemEscopo.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  }
}
