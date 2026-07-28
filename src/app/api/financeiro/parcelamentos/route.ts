export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber, isVencida } from "@/lib/utils";

// ── Parcelamentos do Contas a Pagar ──────────────────────────────────────────
// Agrega os títulos que compartilham grupoParcelamentoId em UMA linha por
// parcelamento (fornecedor + descrição-base + progresso + próxima parcela),
// levando junto a grade completa de parcelas para o detalhe expandido da tela.
// Só leitura — quem cria/baixa parcelas continua sendo o fluxo normal do CP.

type ParcelaOut = {
  id: string;
  numero: string;
  parcelaNumero: number | null;
  dataVencimento: string | null;
  valorOriginal: number;
  valorPago: number;
  status: string;
  vencida: boolean; // derivado: em aberto/parcial com vencimento passado
};

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  // prisma escopado por sessão: no escopo "grupo" vêm os títulos de todas as
  // empresas — por isso a linha carrega empresaId (EmpresaTag na tela).
  const titulos = await prisma.contaPagar.findMany({
    where: { grupoParcelamentoId: { not: null } },
    select: {
      id: true,
      empresaId: true,
      numero: true,
      descricao: true,
      grupoParcelamentoId: true,
      parcelaNumero: true,
      parcelaTotal: true,
      valorOriginal: true,
      valorPago: true,
      dataVencimento: true,
      dataPagamento: true,
      status: true,
      fornecedor: { select: { razaoSocial: true } },
      // Origem do parcelamento (como no CP): DE direto, DE do pedido ou pedido.
      recorrenciaId: true,
      conferencia: { select: { id: true, numero: true } },
      pedidoCompra: { select: { id: true, numero: true, conferencia: { select: { id: true, numero: true } } } },
    },
    orderBy: [{ parcelaNumero: "asc" }, { dataVencimento: "asc" }],
  });

  // Agrupa em memória por grupoParcelamentoId (o volume é pequeno: 1 linha por
  // parcela, não por lançamento).
  const grupos = new Map<string, typeof titulos>();
  for (const t of titulos) {
    const key = t.grupoParcelamentoId!;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(t);
  }

  const data = Array.from(grupos.entries()).map(([grupoId, parcelas]) => {
    // Canceladas ficam FORA dos totais/progresso (senão inflam o valor do
    // parcelamento) — mas continuam na grade do detalhe, marcadas pelo status.
    const validas = parcelas.filter((p) => p.status !== "CANCELADA");
    const primeira = validas[0] ?? parcelas[0];

    // Descrição-base: a da 1ª parcela sem o sufixo " (n/m)".
    const descricaoBase = primeira.descricao.replace(/\s*\(\d+\/\d+\)\s*$/, "");

    const valorTotal = validas.reduce((s, p) => s + decimalToNumber(p.valorOriginal), 0);
    const valorPago = validas.reduce((s, p) => s + decimalToNumber(p.valorPago), 0);
    const pagas = validas.filter((p) => p.status === "PAGA").length;
    const totalParcelas = primeira.parcelaTotal ?? validas.length;

    const emAberto = validas.filter((p) => p.status === "ABERTA" || p.status === "PARCIAL");
    const vencidasEmAberto = emAberto.filter((p) => isVencida(p.dataVencimento, p.dataPagamento)).length;

    // Próxima parcela em aberto: menor vencimento (sem data vai pro fim).
    const proxima = [...emAberto].sort((a, b) => {
      const va = a.dataVencimento ? a.dataVencimento.getTime() : Infinity;
      const vb = b.dataVencimento ? b.dataVencimento.getTime() : Infinity;
      return va - vb;
    })[0] ?? null;

    // Última parcela (maior vencimento) — mostra até quando o compromisso vai.
    const ultima = [...validas].sort((a, b) => {
      const va = a.dataVencimento ? a.dataVencimento.getTime() : -Infinity;
      const vb = b.dataVencimento ? b.dataVencimento.getTime() : -Infinity;
      return vb - va;
    })[0] ?? null;

    const situacao = emAberto.length === 0 ? "QUITADO" : vencidasEmAberto > 0 ? "COM_VENCIDAS" : "EM_DIA";

    // Origem (mesma precedência da tela de CP): DE vinculado (direto ou via
    // pedido) → clicável na tela; senão pedido/recorrência/manual.
    const conf = primeira.conferencia ?? primeira.pedidoCompra?.conferencia ?? null;
    const origem = conf
      ? { label: "Documento de Entrada", ref: conf.numero, deId: conf.id }
      : primeira.pedidoCompra
      ? { label: "Pedido de Compra", ref: primeira.pedidoCompra.numero, deId: null }
      : primeira.recorrenciaId
      ? { label: "Recorrência", ref: null, deId: null }
      : { label: "Manual", ref: null, deId: null };

    const parcelasOut: ParcelaOut[] = parcelas.map((p) => ({
      id: p.id,
      numero: p.numero,
      parcelaNumero: p.parcelaNumero,
      dataVencimento: p.dataVencimento?.toISOString() ?? null,
      valorOriginal: decimalToNumber(p.valorOriginal),
      valorPago: decimalToNumber(p.valorPago),
      status: p.status,
      vencida: (p.status === "ABERTA" || p.status === "PARCIAL") && isVencida(p.dataVencimento, p.dataPagamento),
    }));

    return {
      grupoId,
      empresaId: primeira.empresaId,
      fornecedor: primeira.fornecedor?.razaoSocial ?? null,
      descricao: descricaoBase,
      origem,
      totalParcelas,
      parcelasPagas: pagas,
      valorTotal,
      valorPago,
      saldo: valorTotal - valorPago,
      vencidasEmAberto,
      situacao,
      proximaParcela: proxima
        ? {
            parcelaNumero: proxima.parcelaNumero,
            dataVencimento: proxima.dataVencimento?.toISOString() ?? null,
            valor: decimalToNumber(proxima.valorOriginal) - decimalToNumber(proxima.valorPago),
            vencida: isVencida(proxima.dataVencimento, proxima.dataPagamento),
          }
        : null,
      ultimaParcela: ultima
        ? { parcelaNumero: ultima.parcelaNumero, dataVencimento: ultima.dataVencimento?.toISOString() ?? null }
        : null,
      parcelas: parcelasOut,
    };
  });

  // Com vencidas primeiro, depois em dia (pela próxima parcela), quitados no fim.
  const peso = { COM_VENCIDAS: 0, EM_DIA: 1, QUITADO: 2 } as Record<string, number>;
  data.sort((a, b) => {
    const d = (peso[a.situacao] ?? 9) - (peso[b.situacao] ?? 9);
    if (d !== 0) return d;
    const va = a.proximaParcela?.dataVencimento ?? "9999";
    const vb = b.proximaParcela?.dataVencimento ?? "9999";
    return va.localeCompare(vb);
  });

  return NextResponse.json({ data });
}
