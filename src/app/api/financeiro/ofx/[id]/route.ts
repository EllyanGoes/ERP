export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const JANELA_DIAS = 3;

// Valor "efetivo" (sinalizado) de um lançamento: RECEITA +, DESPESA −,
// TRANSFERENCIA já vem sinalizado.
function valorEfetivo(tipo: string, valor: number): number {
  return tipo === "DESPESA" ? -Math.abs(valor) : valor;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const importacao = await prisma.importacaoOFX.findUnique({
    where: { id: params.id },
    include: {
      contaBancaria: { select: { id: true, nome: true } },
      linhas: {
        orderBy: { data: "asc" },
        include: {
          lancamentoConciliado: { select: { id: true, descricao: true, valor: true, tipo: true } },
        },
      },
    },
  });
  if (!importacao) return NextResponse.json({ error: "Importação não encontrada" }, { status: 404 });

  // Candidatos: lançamentos da conta ainda não conciliados e sem linha OFX vinculada.
  const candidatos = await prisma.lancamentoFinanceiro.findMany({
    where: {
      contaBancariaId: importacao.contaBancariaId,
      conciliado: false,
      linhaOFX: { is: null },
    },
    select: { id: true, descricao: true, valor: true, tipo: true, dataLancamento: true },
  });

  const linhas = importacao.linhas.map((l) => {
    if (l.lancamentoConciliadoId) return { ...l, sugestoes: [] };
    const valorLinha = Number(l.valor);
    const sugestoes = candidatos
      .filter((c) => {
        const diff = Math.abs(valorEfetivo(c.tipo, Number(c.valor)) - valorLinha);
        if (diff > 0.001) return false;
        const dias = Math.abs((c.dataLancamento.getTime() - l.data.getTime()) / 86400000);
        return dias <= JANELA_DIAS;
      })
      .map((c) => ({ id: c.id, descricao: c.descricao, valor: c.valor, tipo: c.tipo, dataLancamento: c.dataLancamento }))
      .slice(0, 5);
    return { ...l, sugestoes };
  });

  return NextResponse.json({ data: { ...importacao, linhas } });
}

// Exclui uma importação (e suas linhas, via cascade). Lançamentos conciliados
// não são apagados — apenas o vínculo some.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.importacaoOFX.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
