export const dynamic = "force-dynamic";
// Concluir um pedido que ainda tem SALDO A ENTREGAR quando o cliente JÁ retirou
// o material: cria uma minuta de RETIRADA já ENTREGUE com as quantidades
// PENDENTES (baixa o estoque do que faltava) e conclui o pedido. Os itens já
// entregues por minutas anteriores não são baixados de novo. Não mexe no
// financeiro (o recebimento é lançado à parte).
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { generateSimpleDocNumber } from "@/lib/utils";
import { baixarEstoqueVenda } from "@/lib/baixa-estoque";
import { SaldoNegativoError, respostaSaldoNegativo } from "@/lib/estoque-guard";
import { faturarPedido } from "@/lib/contas-receber";
import { contabilizarPedidoVenda } from "@/lib/contabilidade";
import { z } from "zod";

const schema = z.object({
  localEstoqueId: z.string().min(1, "Informe o local de estoque da retirada"),
  dataConclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const num = (d: unknown) => parseFloat(String(d));

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { localEstoqueId, dataConclusao } = parsed.data;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        select: {
          id: true, itemId: true, quantidade: true,
          // Quantidades que JÁ saíram do estoque (minuta despachada ou entregue):
          // não baixar de novo — o saldo a baixar é só o que nunca saiu.
          minutaItens: { where: { minuta: { status: { in: ["SAIU_PARA_ENTREGA", "ENTREGUE"] } } }, select: { quantidade: true } },
        },
      },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  if (pedido.status !== "EM_AGENDAMENTO") {
    return NextResponse.json({ error: `Pedido ${pedido.status.toLowerCase()} não pode ser concluído aqui.` }, { status: 422 });
  }
  if (pedido.estoqueOrigemEmpresaId) {
    return NextResponse.json({ error: "Venda à ordem: a saída do estoque é feita pela empresa de origem." }, { status: 422 });
  }

  // Saldo pendente por item (pedido − entregue em minutas ENTREGUE).
  const pendentes = pedido.itens
    .map((it) => ({
      pedidoVendaItemId: it.id,
      itemId: it.itemId,
      pendente: num(it.quantidade) - it.minutaItens.reduce((s, mi) => s + num(mi.quantidade), 0),
    }))
    .filter((p) => p.pendente > 0.0001);

  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${dataConclusao || hojeSP}T00:00:00.000Z`);

  // Sem saldo pendente: só conclui (não cria minuta).
  if (pendentes.length === 0) {
    const updated = await prisma.pedidoVenda.update({
      where: { id: params.id },
      data: { status: "CONCLUIDO", dataConclusao: hoje },
    });
    // Faturamento na ENTREGA (rede de segurança) + contabilização.
    await faturarPedido(params.id).catch((e) =>
      console.error(`[concluir-com-saida] faturarPedido(${params.id}) falhou:`, e));
    await contabilizarPedidoVenda(params.id).catch(() => {});
    return NextResponse.json({ data: { pedidoId: updated.id, minutaNumero: null } }, { status: 200 });
  }

  const numeroMin = generateSimpleDocNumber("MIN", await proximaSequenciaDaEmpresa(pedido.empresaId, "MIN"));
  const seqMov = await proximaSequenciaDaEmpresa(pedido.empresaId, "MOV");
  const movNumero = `MOV-${new Date().getFullYear()}-${String(seqMov).padStart(4, "0")}`;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Trava: só conclui (e baixa) uma vez.
      const claimed = await tx.pedidoVenda.updateMany({
        where: { id: params.id, status: "EM_AGENDAMENTO" },
        data: { status: "CONCLUIDO", dataConclusao: hoje, dataEntrega: hoje },
      });
      if (claimed.count === 0) {
        throw new Error("CONFLITO: o pedido já mudou de status — recarregue a página.");
      }

      const minuta = await tx.minuta.create({
        data: {
          numero: numeroMin,
          empresaId: pedido.empresaId,
          pedidoVendaId: pedido.id,
          localEstoqueId,
          tipo: "RETIRADA",
          status: "ENTREGUE",
          dataEntrega: hoje,
          observacoes: "Conclusão — saída do saldo pendente (cliente já retirou)",
          itens: {
            create: pendentes.map((p) => ({
              pedidoVendaItemId: p.pedidoVendaItemId,
              itemId: p.itemId,
              quantidade: p.pendente,
            })),
          },
        },
      });

      const lote = await tx.loteMovimentacao.create({
        data: {
          empresaId: pedido.empresaId,
          numero: movNumero,
          tipo: "SAIDA",
          documento: minuta.numero,
          observacoes: `Saída saldo pendente ${pedido.numero} — minuta ${minuta.numero}`,
        },
      });

      // Baixa UNIFICADA (src/lib/baixa-estoque.ts): cada item pendente sai do
      // SEU local (categoria/saldo — o local informado é só fallback; antes
      // baixava TUDO no local único, um bug) com hard block de saldo negativo.
      const descrs = await tx.item.findMany({
        where: { id: { in: pendentes.map((p) => p.itemId) } },
        select: { id: true, descricao: true },
      });
      const descrDe = new Map(descrs.map((d) => [d.id, d.descricao]));
      await baixarEstoqueVenda(tx, {
        empresaId: pedido.empresaId,
        itens: pendentes.map((p) => ({
          itemId: p.itemId,
          quantidade: p.pendente,
          pedidoVendaItemId: p.pedidoVendaItemId,
          descricao: descrDe.get(p.itemId) ?? null,
        })),
        fallbackLocalId: localEstoqueId,
        documento: minuta.numero,
        observacoes: `Saída saldo pendente — minuta ${minuta.numero}`,
        loteId: lote.id,
      });

      await recomputarStatusPedido(tx, pedido.id);
      return { minuta };
    });

    // Faturamento na ENTREGA: a entrega total acabou de se completar — gera o
    // contas a receber (idempotente) e contabiliza o pedido.
    await faturarPedido(params.id).catch((e) =>
      console.error(`[concluir-com-saida] faturarPedido(${params.id}) falhou:`, e));
    await contabilizarPedidoVenda(params.id).catch(() => {});

    return NextResponse.json({ data: { pedidoId: params.id, minutaNumero: resultado.minuta.numero } }, { status: 201 });
  } catch (err) {
    if (err instanceof SaldoNegativoError) return respostaSaldoNegativo(err);
    const msg = err instanceof Error ? err.message : "Erro ao concluir com saída do saldo";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/concluir-com-saida]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
