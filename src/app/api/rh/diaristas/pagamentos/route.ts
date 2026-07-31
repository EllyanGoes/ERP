export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pagarDiariasAgrupadas, RhPagamentoErro } from "@/lib/rh-pagamentos";
import { decimalToNumber } from "@/lib/utils";

// Pagamento de diárias AGRUPADO POR PESSOA (módulo próprio): o diarista
// acumula diárias de várias folhas fechadas e recebe o total de uma vez.
//
// GET  → pendências agrupadas por colaborador (diárias de folhas FECHADAS sem
//        pagamento), com o detalhe por dia para expandir na tela.
// POST → paga os itens selecionados { itemIds, dataPagamento, contaBancariaId };
//        baixa o título de cada folha envolvida e posta o contábil por pessoa.
export async function GET() {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const itens = await prisma.diariaItem.findMany({
    where: { dataPagamento: null, grupo: { folha: { status: "FECHADA" } } },
    select: {
      id: true, valor: true, valorTotal: true, servico: true,
      colaborador: { select: { id: true, nome: true } },
      grupo: { select: { setor: true, folha: { select: { id: true, data: true, turno: true } } } },
    },
    orderBy: { grupo: { folha: { data: "asc" } } },
  });

  type Linha = {
    colaboradorId: string; nome: string; total: number;
    diarias: { id: string; data: string; turno: string; setor: string | null; servico: string | null; valor: number; folhaId: string }[];
  };
  const porPessoa = new Map<string, Linha>();
  for (const it of itens) {
    const valor = Math.round((decimalToNumber(it.valorTotal ?? 0) || decimalToNumber(it.valor)) * 100) / 100;
    if (valor <= 0) continue;
    const cur = porPessoa.get(it.colaborador.id) ?? { colaboradorId: it.colaborador.id, nome: it.colaborador.nome, total: 0, diarias: [] };
    cur.total = Math.round((cur.total + valor) * 100) / 100;
    cur.diarias.push({
      id: it.id, data: it.grupo.folha.data.toISOString().slice(0, 10), turno: it.grupo.folha.turno,
      setor: it.grupo.setor, servico: it.servico, valor, folhaId: it.grupo.folha.id,
    });
    porPessoa.set(it.colaborador.id, cur);
  }
  const data = Array.from(porPessoa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => null);
  const itemIds: string[] = Array.isArray(b?.itemIds) ? b.itemIds.filter((x: unknown) => typeof x === "string") : [];
  const dataPagamento = typeof b?.dataPagamento === "string" ? b.dataPagamento : "";
  const contaBancariaId = typeof b?.contaBancariaId === "string" ? b.contaBancariaId : "";
  if (itemIds.length === 0 || !/^\d{4}-\d{2}-\d{2}/.test(dataPagamento) || !contaBancariaId) {
    return NextResponse.json({ error: "Informe diárias, data e conta do pagamento." }, { status: 400 });
  }

  try {
    const r = await pagarDiariasAgrupadas({ itemIds, dataPagamento, contaBancariaId });
    return NextResponse.json({ data: r });
  } catch (e) {
    if (e instanceof RhPagamentoErro) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao registrar o pagamento" }, { status: 500 });
  }
}
