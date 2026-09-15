export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";

// GET /api/contabilidade/dre/lancamentos?contaIds=a,b&ano=2026&mes=5
// Partidas das contas (ERP) no mês (mes=0 → ano), com a contrapartida do
// mesmo lançamento — popup dos números da DRE.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const contaIds = (sp.get("contaIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ano = Number(sp.get("ano") ?? new Date().getUTCFullYear());
  const mes = Number(sp.get("mes") ?? 0);
  if (contaIds.length === 0) return NextResponse.json({ error: "Informe as contas." }, { status: 400 });
  const ini = mes >= 1 && mes <= 12 ? new Date(Date.UTC(ano, mes - 1, 1)) : new Date(Date.UTC(ano, 0, 1));
  const fim = mes >= 1 && mes <= 12 ? new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)) : new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

  const partidas = await prisma.partidaContabil.findMany({
    where: { contaId: { in: contaIds }, lancamento: { data: { gte: ini, lte: fim } } },
    select: {
      id: true, tipo: true, valor: true, contaId: true,
      conta: { select: { codigo: true, nome: true } },
      lancamento: {
        select: {
          id: true, numero: true, data: true, historico: true, origemTipo: true, origemId: true,
          partidas: { select: { tipo: true, valor: true, conta: { select: { codigo: true, nome: true } } } },
        },
      },
    },
    orderBy: [{ lancamento: { data: "asc" } }, { id: "asc" }],
  });

  const data = partidas.map((p) => {
    const contra = p.lancamento.partidas.filter((x) => x.tipo !== p.tipo).map((x) => `${x.conta.codigo} ${x.conta.nome}`);
    return {
      id: p.id, lancamentoId: p.lancamento.id, numero: p.lancamento.numero, data: p.lancamento.data.toISOString().slice(0, 10),
      historico: p.lancamento.historico, origemTipo: p.lancamento.origemTipo, origemId: p.lancamento.origemId,
      conta: `${p.conta.codigo} ${p.conta.nome}`, lado: p.tipo === "DEBITO" ? "D" : "C", valor: decimalToNumber(p.valor),
      contrapartida: contra.length === 1 ? contra[0] : contra.length > 1 ? `(${contra.length} contas) ${contra.join("; ")}` : "",
    };
  });
  return NextResponse.json({ data });
}
