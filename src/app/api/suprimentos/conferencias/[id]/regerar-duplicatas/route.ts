export const dynamic = "force-dynamic";
// Regera a GRADE de duplicatas de um Documento de Entrada CONCLUÍDO pela
// condição de pagamento atual do DE: apaga os títulos ABERTOS sem pagamento
// (com seus lançamentos contábeis e rateio) e recria as parcelas sobre a MESMA
// soma. Parcelas pagas/parciais são história financeira — ficam intocadas e a
// nova grade parcela só o restante em aberto. Chamado pela tela do DE quando a
// condição muda depois da conclusão.
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
// prismaSemEscopo: compras em grupo — o DE pode ser de outra empresa da sessão
// e ContaPagar não entra na leitura em grupo (o escopo esconderia os títulos).
import { prismaSemEscopo as prisma } from "@/lib/prisma";
import { calcularParcelas } from "@/lib/parcelas";
import { criarRateioInicialCp, distribuicaoNaturezas } from "@/lib/contas-pagar";
import { apagarLancamentosContabeis, recontabilizarTituloPagar } from "@/lib/contabilidade";
import { recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";
import { generateSimpleDocNumber } from "@/lib/utils";

const num = (d: unknown) => parseFloat(String(d ?? 0)) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModuloAny(["compras", "financeiro"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as { condicaoPagamentoId?: string | null }));

  const conferencia = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    select: { id: true, empresaId: true, status: true, dtEmissao: true, condicaoPagamentoId: true },
  });
  if (!conferencia) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  if (conferencia.status !== "CONCLUIDA" && conferencia.status !== "DIVERGENCIA") {
    return NextResponse.json({ error: "Só documentos concluídos têm grade de títulos para regerar." }, { status: 422 });
  }

  // Condição efetiva: a enviada no corpo (persistida no DE) ou a já salva.
  const condicaoId = body.condicaoPagamentoId !== undefined
    ? (body.condicaoPagamentoId || null)
    : conferencia.condicaoPagamentoId;
  const condicao = condicaoId
    ? await prisma.condicaoPagamento.findUnique({ where: { id: condicaoId } })
    : null;

  // Títulos regeráveis: os do DE, ABERTOS e sem nenhum pagamento. PA (nasce no
  // pedido) não tem conferenciaId e fica naturalmente de fora.
  const titulos = await prisma.contaPagar.findMany({
    where: { conferenciaId: conferencia.id },
    orderBy: { parcelaNumero: "asc" },
  });
  const abertos = titulos.filter((t) => t.status === "ABERTA" && num(t.valorPago) <= 0.005);
  if (abertos.length === 0) {
    return NextResponse.json({ error: "Nenhuma parcela em aberto (sem pagamento) para regerar." }, { status: 422 });
  }

  const soma = r2(abertos.reduce((s, t) => s + num(t.valorOriginal), 0));
  const hojeUTC = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const parcelas = calcularParcelas(condicao, soma, conferencia.dtEmissao ?? hojeUTC);
  if (parcelas.length === 0) {
    return NextResponse.json({ error: "A condição não gerou parcelas para o valor em aberto." }, { status: 422 });
  }

  // Distribuição de naturezas da grade antiga (rateio agregado) — a nova grade
  // nasce classificada igual; sem rateio, cai na natureza única do título.
  const modelo = abertos[0];
  const rateios = await prisma.contaPagarNatureza.findMany({
    where: { contaPagarId: { in: abertos.map((t) => t.id) } },
    select: { naturezaFinanceiraId: true, valor: true },
  });
  const dist = distribuicaoNaturezas(
    rateios.map((r) => ({ naturezaFinanceiraId: r.naturezaFinanceiraId, valor: num(r.valor) })),
    modelo.naturezaFinanceiraId,
  );
  const baseDesc = (modelo.descricao ?? "").replace(/ \(\d+\/\d+\)$/, "");

  let criados: string[];
  try {
    criados = await prisma.$transaction(async (tx) => {
      if (body.condicaoPagamentoId !== undefined && condicaoId !== conferencia.condicaoPagamentoId) {
        await tx.conferenciaCompra.update({ where: { id: conferencia.id }, data: { condicaoPagamentoId: condicaoId } });
      }
      // Apaga a grade antiga (rateio → lançamentos → título; partidas junto).
      for (const t of abertos) {
        await tx.contaPagarNatureza.deleteMany({ where: { contaPagarId: t.id } });
        await apagarLancamentosContabeis({ origemTipo: { in: ["COMPRA", "PAGAMENTO"] }, origemId: t.id }, tx);
        await tx.contaPagar.delete({ where: { id: t.id } });
      }
      // Recria pela condição, copiando a classificação/vínculos do título modelo.
      const ids: string[] = [];
      for (const p of parcelas) {
        const seq = await tx.sequencia.upsert({
          where: { empresaId_prefixo: { empresaId: conferencia.empresaId, prefixo: "CP" } },
          create: { empresaId: conferencia.empresaId, prefixo: "CP", ultimo: 1 },
          update: { ultimo: { increment: 1 } },
        });
        const cp = await tx.contaPagar.create({
          data: {
            empresaId: conferencia.empresaId,
            numero: generateSimpleDocNumber("CP", seq.ultimo),
            conferenciaId: conferencia.id,
            pedidoCompraId: modelo.pedidoCompraId,
            fornecedorId: modelo.fornecedorId,
            naturezaFinanceiraId: modelo.naturezaFinanceiraId,
            centroCustoId: modelo.centroCustoId,
            formaPagamentoPrevistaId: modelo.formaPagamentoPrevistaId,
            dataCompetencia: modelo.dataCompetencia,
            semProvisao: modelo.semProvisao,
            notaFiscal: modelo.notaFiscal,
            descricao: p.parcelaTotal ? `${baseDesc} (${p.parcelaNumero}/${p.parcelaTotal})` : baseDesc,
            valorOriginal: p.valor,
            dataVencimento: p.dataVencimento,
            status: "ABERTA",
            ...(p.grupoParcelamentoId
              ? { grupoParcelamentoId: p.grupoParcelamentoId, parcelaNumero: p.parcelaNumero, parcelaTotal: p.parcelaTotal }
              : {}),
          },
        });
        await criarRateioInicialCp(tx, cp.id, dist, Number(p.valor));
        ids.push(cp.id);
      }
      if (modelo.pedidoCompraId) await recomputarStatusFinanceiroCompra(tx, modelo.pedidoCompraId);
      return ids;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao regerar a grade.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Pós-commit: contabiliza os títulos novos (mesmo padrão da conclusão).
  for (const id of criados) await recontabilizarTituloPagar(id).catch(() => null);

  return NextResponse.json({ data: { removidos: abertos.length, criados: criados.length } });
}
