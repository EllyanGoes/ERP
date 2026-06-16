export const dynamic = "force-dynamic";
// Devolução de venda (B1: ESTORNO). Cliente devolve itens (parcial por item):
// ENTRADA de estoque de volta (venda normal) ou reversão do triangular (à
// ordem) + estorno em dinheiro (LancamentoFinanceiro de saída na conta/caixa).
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa, contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { reverterMovimentosTriangulares } from "@/lib/venda-ordem";
import { z } from "zod";

const schema = z.object({
  pedidoVendaId: z.string().min(1),
  tipoResolucao: z.enum(["ESTORNO", "CREDITO", "TROCA"]),
  contaBancariaId: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  itens: z.array(z.object({
    pedidoVendaItemId: z.string().min(1),
    quantidade: z.coerce.number().positive(),
  })).min(1, "Selecione ao menos um item para devolver"),
});

export async function POST(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const f = parsed.data;

  // B1 cobre só ESTORNO; crédito/troca chegam nas fases B2/B3.
  if (f.tipoResolucao !== "ESTORNO") {
    return NextResponse.json({ error: "Por enquanto a devolução suporta apenas Estorno (dinheiro de volta). Crédito e Troca em breve." }, { status: 400 });
  }

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: f.pedidoVendaId },
    include: { itens: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (pedido.status === "CANCELADO") return NextResponse.json({ error: "Pedido cancelado não pode ter devolução." }, { status: 422 });

  const empresaId = pedido.empresaId;
  const itemById = new Map(pedido.itens.map((i) => [i.id, i]));

  // Quantidades já devolvidas por item (devoluções concluídas deste pedido).
  const jaDevolvidos = await prisma.devolucaoItem.groupBy({
    by: ["pedidoVendaItemId"],
    where: { devolucao: { pedidoVendaId: pedido.id, status: "CONCLUIDA" } },
    _sum: { quantidade: true },
  });
  const devolvidoById = new Map(jaDevolvidos.map((g) => [g.pedidoVendaItemId, Number(g._sum.quantidade ?? 0)]));

  // Valida e monta as linhas da devolução.
  const linhas: { pedidoVendaItemId: string; itemId: string; quantidade: number; valorUnitario: number; valorTotal: number }[] = [];
  for (const it of f.itens) {
    const pvi = itemById.get(it.pedidoVendaItemId);
    if (!pvi) return NextResponse.json({ error: "Item não pertence ao pedido." }, { status: 400 });
    const vendido = Number(pvi.quantidade);
    const jaDev = devolvidoById.get(it.pedidoVendaItemId) ?? 0;
    if (it.quantidade > vendido - jaDev + 1e-6) {
      return NextResponse.json({ error: `Quantidade a devolver maior que a disponível (vendido ${vendido}, já devolvido ${jaDev}).` }, { status: 422 });
    }
    const precoUnit = Number(pvi.precoUnitario);
    linhas.push({
      pedidoVendaItemId: pvi.id, itemId: pvi.itemId, quantidade: it.quantidade,
      valorUnitario: precoUnit, valorTotal: Math.round(it.quantidade * precoUnit * 100) / 100,
    });
  }
  const valorTotal = Math.round(linhas.reduce((s, l) => s + l.valorTotal, 0) * 100) / 100;
  if (valorTotal <= 0) return NextResponse.json({ error: "Valor da devolução inválido." }, { status: 400 });

  const triangular = !!pedido.estoqueOrigemEmpresaId;
  const contaId = f.contaBancariaId || contaCaixaIdDaEmpresa(empresaId);
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${hojeSP}T00:00:00.000Z`);

  try {
    const devolucao = await prisma.$transaction(async (tx) => {
      const numero = generateDocNumber("DEV", await proximaSequenciaDaEmpresa(empresaId, "DEV"));
      const dev = await tx.devolucao.create({
        data: {
          empresaId, numero, pedidoVendaId: pedido.id, clienteId: pedido.clienteId,
          valorTotal, tipoResolucao: "ESTORNO", contaBancariaId: contaId,
          observacoes: f.observacoes?.trim() || null,
          itens: { create: linhas },
        },
      });

      // ── Estoque de volta ─────────────────────────────────────────────────
      // À ordem: revertido após o commit (cruza empresas). Venda normal: ENTRADA
      // na empresa da venda no local padrão.
      if (!triangular) {
        const local = await tx.localEstoque.findFirst({ where: { empresaId, ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!local) throw new Error("Empresa sem local de estoque para registrar a devolução.");
        const ano = new Date().getFullYear();
        const seq = await proximaSequenciaDaEmpresa(empresaId, "MOV");
        const lote = await tx.loteMovimentacao.create({
          data: { empresaId, numero: `MOV-${ano}-${String(seq).padStart(4, "0")}`, tipo: "ENTRADA", documento: numero, observacoes: `Devolução ${numero} — PV ${pedido.numero}` },
        });
        for (const l of linhas) {
          let estoque = await tx.estoqueItem.findFirst({ where: { empresaId, itemId: l.itemId, localEstoqueId: local.id, clienteDonoId: null } });
          if (!estoque) {
            estoque = await tx.estoqueItem.create({ data: { empresaId, itemId: l.itemId, localEstoqueId: local.id, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null } });
          }
          const atualizado = await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: { increment: l.quantidade } } });
          const saldoDepois = Number(atualizado.quantidadeAtual);
          await tx.movimentacaoEstoque.create({
            data: {
              empresaId, itemId: l.itemId, localEstoqueId: local.id, loteId: lote.id, tipo: "ENTRADA",
              quantidade: l.quantidade, saldoAntes: saldoDepois - l.quantidade, saldoDepois,
              documento: numero, observacoes: `Devolução ${numero} — retorno do cliente`,
              valorUnitario: l.valorUnitario, devolucaoId: dev.id, pedidoVendaItemId: l.pedidoVendaItemId,
            },
          });
        }
      }

      // ── Estorno em dinheiro (venda oficial) ──────────────────────────────
      await tx.lancamentoFinanceiro.create({
        data: {
          empresaId, tipo: "DESPESA", valor: valorTotal, dataLancamento: hoje,
          descricao: `Devolução ${numero} — PV ${pedido.numero}`, contaBancariaId: contaId,
        },
      });

      await recomputarStatusPedido(tx, pedido.id);
      return dev;
    });

    // À ordem: reverte os movimentos virtuais (volta para a origem) — cruza empresas.
    if (triangular) await reverterMovimentosTriangulares(devolucao.id);

    return NextResponse.json({ data: { id: devolucao.id, numero: devolucao.numero } }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao registrar devolução";
    console.error("[POST /api/comercial/devolucoes]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
