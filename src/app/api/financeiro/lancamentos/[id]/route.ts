export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { lancamentoFinanceiroSchema } from "@/lib/validations/financeiro";
import { apagarLancamentosContabeis, PeriodoFechadoError } from "@/lib/contabilidade";

// Edição/exclusão de lançamento AVULSO (não vinculado a título). Recebimentos e
// pagamentos ligados a uma conta a receber/pagar são geridos pelo próprio título
// — editá-los aqui desencontraria o valor pago do título.
async function carregar(id: string) {
  return prisma.lancamentoFinanceiro.findUnique({
    where: { id },
    select: { id: true, tipo: true, valor: true, transferenciaParId: true, contaReceberId: true, contaPagarId: true },
  });
}

function vinculadoAtitulo(l: { contaReceberId: string | null; contaPagarId: string | null }) {
  return !!(l.contaReceberId || l.contaPagarId);
}

function ehTransferencia(l: { tipo: string; transferenciaParId: string | null }) {
  return l.tipo === "TRANSFERENCIA" || !!l.transferenciaParId;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const atual = await carregar(params.id);
  if (!atual) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (vinculadoAtitulo(atual)) {
    return NextResponse.json(
      { error: "Este lançamento veio de um recebimento/pagamento — edite pelo título (conta a receber/pagar)." },
      { status: 422 },
    );
  }
  // Editar UMA perna desencontraria o par e o espelho contábil — exclua e refaça.
  if (ehTransferencia(atual)) {
    return NextResponse.json(
      { error: "Transferência não é editável — exclua as duas pernas e lance de novo." },
      { status: 422 },
    );
  }

  const parsed = lancamentoFinanceiroSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const lancamento = await prisma.lancamentoFinanceiro.update({
    where: { id: params.id },
    data: {
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      dataLancamento: new Date(parsed.data.dataLancamento),
      dataVencimento: parsed.data.dataVencimento ? new Date(parsed.data.dataVencimento) : null,
      dataCompetencia: parsed.data.dataCompetencia ? new Date(parsed.data.dataCompetencia) : null,
      contaBancariaId: parsed.data.contaBancariaId,
      naturezaFinanceiraId: parsed.data.naturezaFinanceiraId || null,
      centroCustoId: parsed.data.centroCustoId || null,
      favorecido: parsed.data.favorecido || null,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return NextResponse.json({ data: lancamento });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const atual = await carregar(params.id);
  if (!atual) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (vinculadoAtitulo(atual)) {
    return NextResponse.json(
      { error: "Este lançamento veio de um recebimento/pagamento — exclua pelo título (conta a receber/pagar)." },
      { status: 422 },
    );
  }

  try {
    if (ehTransferencia(atual)) {
      // Transferência: apaga AS DUAS pernas + o espelho contábil (idempotente pela
      // perna de ORIGEM — a de valor negativo) na MESMA transação.
      const par = atual.transferenciaParId
        ? await prisma.lancamentoFinanceiro.findUnique({
            where: { id: atual.transferenciaParId },
            select: { id: true, valor: true },
          })
        : null;
      const origemId = Number(atual.valor) < 0 ? atual.id : par?.id ?? atual.id;
      await prisma.$transaction(async (tx) => {
        const ids = [atual.id, ...(par ? [par.id] : [])];
        // As pernas se referenciam mutuamente (transferenciaParId) — solta o
        // vínculo antes de apagar para não violar a FK.
        await tx.lancamentoFinanceiro.updateMany({ where: { id: { in: ids } }, data: { transferenciaParId: null } });
        await tx.lancamentoFinanceiro.deleteMany({ where: { id: { in: ids } } });
        await apagarLancamentosContabeis({ origemTipo: "TRANSFERENCIA_CAIXA", origemId }, tx);
      });
    } else {
      // Avulso: limpa também o eventual espelho de taxa/deságio de cartão
      // (origemId derivado do id do lançamento — sem FK).
      await prisma.$transaction(async (tx) => {
        await tx.lancamentoFinanceiro.delete({ where: { id: params.id } });
        await apagarLancamentosContabeis(
          { origemTipo: "TRANSFERENCIA_CAIXA", origemId: { in: [`repasse-dif-${params.id}`, `antecipacao-desagio-${params.id}`] } },
          tx,
        );
      });
    }
  } catch (e) {
    if (e instanceof PeriodoFechadoError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
  return NextResponse.json({ data: { ok: true } });
}
