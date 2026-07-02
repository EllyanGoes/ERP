import { registrarLancamento, contaDoBanco, contaDaNatureza } from "@/lib/contabilidade";
import { garantirContaContabilBanco, garantirContaContabilNatureza } from "@/lib/conta-contabil";

/**
 * Espelho contábil das despesas de cartão lançadas na conta da administradora
 * (taxa descontada no repasse / deságio de antecipação):
 *   D conta de resultado da natureza travada ('taxa-cartao' / 'desagio-antecipacao')
 *   C conta 1.1.8.x da administradora (Cartões a Receber)
 * Idempotente por (empresa, TRANSFERENCIA_CAIXA, origemId) — origemId derivado do
 * id do LancamentoFinanceiro da despesa ("repasse-dif-<id>" / "antecipacao-desagio-<id>"),
 * o que permite ao DELETE do lançamento limpar o espelho sem FK.
 * Best-effort (pós-commit): sem natureza/conta resolvida, não lança.
 */
export async function contabilizarDespesaCartao(args: {
  empresaId: string;
  contaCartaoBancariaId: string;
  naturezaFinanceiraId: string | null;
  valor: number;
  data: Date;
  historico: string;
  origemId: string;
}) {
  const { empresaId, contaCartaoBancariaId, naturezaFinanceiraId, valor, data, historico, origemId } = args;
  if (valor <= 0.005 || !naturezaFinanceiraId) return;

  const [contaCartao, contaResultado] = await Promise.all([
    contaDoBanco(empresaId, contaCartaoBancariaId).then((c) => c ?? garantirContaContabilBanco(contaCartaoBancariaId)),
    contaDaNatureza(empresaId, naturezaFinanceiraId).then((c) => c ?? garantirContaContabilNatureza(naturezaFinanceiraId)),
  ]);
  if (!contaCartao || !contaResultado) return;

  await registrarLancamento({
    empresaId,
    data,
    historico,
    origemTipo: "TRANSFERENCIA_CAIXA",
    origemId,
    partidas: [
      { contaId: contaResultado.id, tipo: "DEBITO", valor, naturezaId: naturezaFinanceiraId },
      { contaId: contaCartao.id, tipo: "CREDITO", valor },
    ],
  });
}
