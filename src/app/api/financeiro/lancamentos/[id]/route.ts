export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { lancamentoFinanceiroSchema } from "@/lib/validations/financeiro";

// Edição/exclusão de lançamento AVULSO (não vinculado a título). Recebimentos e
// pagamentos ligados a uma conta a receber/pagar são geridos pelo próprio título
// — editá-los aqui desencontraria o valor pago do título.
async function carregar(id: string) {
  return prisma.lancamentoFinanceiro.findUnique({
    where: { id },
    select: { id: true, contaReceberId: true, contaPagarId: true },
  });
}

function vinculadoAtitulo(l: { contaReceberId: string | null; contaPagarId: string | null }) {
  return !!(l.contaReceberId || l.contaPagarId);
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

  await prisma.lancamentoFinanceiro.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
