export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { saldosTodasContas } from "@/lib/financeiro";
import { decimalToNumber } from "@/lib/utils";

// Posição "Cartões a Receber" por administradora: saldo atual da conta CARTAO,
// vendas (RECEITA) ainda não conciliadas com um repasse e a projeção da data de
// repasse de cada uma (dataLancamento + diasCompensacao da maquineta; o
// lançamento não guarda crédito/débito, então usa o MAIOR prazo da maquineta —
// projeção conservadora. Sem maquineta: maior prazo entre as da administradora).
export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const [admins, saldos] = await Promise.all([
    prisma.administradoraCartao.findMany({
      where: { ativo: true },
      include: { maquinetas: { include: { taxas: true } } },
      orderBy: { nome: "asc" },
    }),
    saldosTodasContas(),
  ]);

  const contaIds = admins.map((a) => a.contaBancariaId);
  const pendentes = contaIds.length
    ? await prisma.lancamentoFinanceiro.findMany({
        where: { contaBancariaId: { in: contaIds }, tipo: "RECEITA", conciliado: false },
        select: { id: true, contaBancariaId: true, dataLancamento: true, valor: true, descricao: true, maquinetaId: true },
        orderBy: { dataLancamento: "asc" },
      })
    : [];

  const data = admins.map((a) => {
    const diasPorMaquineta = new Map(a.maquinetas.map((m) => [m.id, Math.max(0, ...m.taxas.map((t) => t.diasCompensacao))]));
    const nomePorMaquineta = new Map(a.maquinetas.map((m) => [m.id, m.nome]));
    const diasDefault = Math.max(0, ...a.maquinetas.flatMap((m) => m.taxas.map((t) => t.diasCompensacao)));

    const lancamentos = pendentes
      .filter((l) => l.contaBancariaId === a.contaBancariaId)
      .map((l) => {
        const dias = (l.maquinetaId ? diasPorMaquineta.get(l.maquinetaId) : undefined) ?? diasDefault;
        const previsao = new Date(l.dataLancamento);
        previsao.setDate(previsao.getDate() + dias);
        return {
          id: l.id,
          data: l.dataLancamento,
          valor: decimalToNumber(l.valor),
          descricao: l.descricao,
          maquinetaId: l.maquinetaId,
          maquineta: l.maquinetaId ? nomePorMaquineta.get(l.maquinetaId) ?? null : null,
          diasCompensacao: dias,
          previsaoRepasse: previsao,
        };
      });

    return {
      administradoraId: a.id,
      nome: a.nome,
      contaBancariaId: a.contaBancariaId,
      saldo: saldos.get(a.contaBancariaId) ?? 0,
      totalPendente: Math.round(lancamentos.reduce((s, l) => s + l.valor, 0) * 100) / 100,
      lancamentos,
    };
  });

  return NextResponse.json({ data });
}
