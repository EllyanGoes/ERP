export const dynamic = "force-dynamic";
// Devolução de venda (B1: ESTORNO). Cliente devolve itens (parcial por item):
// ENTRADA de estoque de volta ao CUSTO (venda normal) ou reversão do triangular
// (à ordem) + resolução financeira:
//   • ESTORNO — primeiro ABATE as contas a receber ABERTAS/PARCIAIS do pedido
//     (reduz o saldo devedor; registrado em Devolucao.valorAbatidoCr) e só
//     devolve em DINHEIRO o que foi efetivamente pago (LancamentoFinanceiro de
//     saída com devolucaoId). 422 se pedirem dinheiro além do pago.
//   • CRÉDITO/TROCA — gera vale (CreditoCliente).
// A validação de quantidade roda DENTRO da transação e compara com o ENTREGUE
// (minutas ENTREGUE) — não se devolve o que nunca saiu.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa, contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { reverterMovimentosTriangulares } from "@/lib/venda-ordem";
import { valoresEstoqueDaEmpresa } from "@/lib/valor-estoque";
import { contabilizarDevolucao, recontabilizarTituloReceber } from "@/lib/contabilidade";
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

// Erro de validação levantado dentro da transação → HTTP 422.
class ValidacaoError extends Error {}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const f = parsed.data;
  const isEstorno = f.tipoResolucao === "ESTORNO";

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: f.pedidoVendaId },
    include: { itens: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (pedido.status === "CANCELADO") return NextResponse.json({ error: "Pedido cancelado não pode ter devolução." }, { status: 422 });

  const empresaId = pedido.empresaId;
  const itemById = new Map(pedido.itens.map((i) => [i.id, i]));

  // Monta as linhas da devolução (o valor devolvido ao cliente é pelo PREÇO DE
  // VENDA; a validação de quantidade contra entregue/já devolvido roda DENTRO
  // da transação, ao lado das escritas — sem janela para corrida).
  const linhas: { pedidoVendaItemId: string; itemId: string; quantidade: number; valorUnitario: number; valorTotal: number }[] = [];
  for (const it of f.itens) {
    const pvi = itemById.get(it.pedidoVendaItemId);
    if (!pvi) return NextResponse.json({ error: "Item não pertence ao pedido." }, { status: 400 });
    const precoUnit = Number(pvi.precoUnitario);
    linhas.push({
      pedidoVendaItemId: pvi.id, itemId: pvi.itemId, quantidade: it.quantidade,
      valorUnitario: precoUnit, valorTotal: r2(it.quantidade * precoUnit),
    });
  }
  const valorTotal = r2(linhas.reduce((s, l) => s + l.valorTotal, 0));
  if (valorTotal <= 0) return NextResponse.json({ error: "Valor da devolução inválido." }, { status: 400 });

  const triangular = !!pedido.estoqueOrigemEmpresaId;
  const contaId = isEstorno ? (f.contaBancariaId && f.contaBancariaId !== "caixa-geral" ? f.contaBancariaId : contaCaixaIdDaEmpresa(empresaId)) : null;
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${hojeSP}T00:00:00.000Z`);

  // CUSTO dos itens devolvidos (regra de custeio da empresa): a ENTRADA de
  // estoque volta ao custo, nunca ao preço de venda — senão o estoque infla.
  const custos = await valoresEstoqueDaEmpresa(empresaId, linhas.map((l) => l.itemId));

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // ── Validação de quantidades DENTRO da tx, contra o ENTREGUE ─────────
      // Disponível = entregue (minutas ENTREGUE) − já devolvido (devoluções
      // CONCLUIDAS). Venda à ordem não tem minuta própria (a entrega é o pedido
      // de entrega da origem) → cai no vendido como teto.
      const pviIds = linhas.map((l) => l.pedidoVendaItemId);
      const [entregues, jaDevolvidos] = await Promise.all([
        tx.minutaItem.groupBy({
          by: ["pedidoVendaItemId"],
          where: { pedidoVendaItemId: { in: pviIds }, minuta: { status: "ENTREGUE" } },
          _sum: { quantidade: true },
        }),
        tx.devolucaoItem.groupBy({
          by: ["pedidoVendaItemId"],
          where: { devolucao: { pedidoVendaId: pedido.id, status: "CONCLUIDA" } },
          _sum: { quantidade: true },
        }),
      ]);
      const entregueById = new Map(entregues.map((g) => [g.pedidoVendaItemId, Number(g._sum.quantidade ?? 0)]));
      const devolvidoById = new Map(jaDevolvidos.map((g) => [g.pedidoVendaItemId, Number(g._sum.quantidade ?? 0)]));
      for (const l of linhas) {
        const pvi = itemById.get(l.pedidoVendaItemId)!;
        const teto = triangular ? Number(pvi.quantidade) : (entregueById.get(l.pedidoVendaItemId) ?? 0);
        const jaDev = devolvidoById.get(l.pedidoVendaItemId) ?? 0;
        if (l.quantidade > teto - jaDev + 1e-6) {
          throw new ValidacaoError(
            `Quantidade a devolver maior que a entregue disponível (entregue ${teto}, já devolvido ${jaDev}).`,
          );
        }
      }

      const numero = generateDocNumber("DEV", await proximaSequenciaDaEmpresa(empresaId, "DEV"));
      const dev = await tx.devolucao.create({
        data: {
          empresaId, numero, pedidoVendaId: pedido.id, clienteId: pedido.clienteId,
          valorTotal, tipoResolucao: f.tipoResolucao, contaBancariaId: contaId,
          observacoes: f.observacoes?.trim() || null,
          itens: { create: linhas },
        },
      });

      // ── Estoque de volta ─────────────────────────────────────────────────
      // À ordem: revertido após o commit (cruza empresas). Venda normal: ENTRADA
      // na empresa da venda no local padrão, valorada ao CUSTO.
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
          // valorUnitario = CUSTO (o motor contábil da devolução reverte o
          // CPV/CMV por este valor) — nunca o preço de venda.
          const custoUnit = custos.get(l.itemId)?.valorUnitario ?? 0;
          await tx.movimentacaoEstoque.create({
            data: {
              empresaId, itemId: l.itemId, localEstoqueId: local.id, loteId: lote.id, tipo: "ENTRADA",
              quantidade: l.quantidade, saldoAntes: saldoDepois - l.quantidade, saldoDepois,
              documento: numero, observacoes: `Devolução ${numero} — retorno do cliente`,
              valorUnitario: custoUnit, devolucaoId: dev.id, pedidoVendaItemId: l.pedidoVendaItemId,
            },
          });
        }
      }

      // ── Resolução financeira ─────────────────────────────────────────────
      const crsAjustadas: string[] = [];
      if (isEstorno) {
        // 1) ABATE primeiro as contas a receber ABERTAS do pedido: a devolução
        //    reduz o saldo devedor antes de qualquer dinheiro sair do caixa.
        //    Rateio proporcional ao saldo de cada título, com recompute de status.
        const crs = await tx.contaReceber.findMany({
          where: { pedidoVendaId: pedido.id, status: { in: ["ABERTA", "PARCIAL", "VENCIDA"] } },
          orderBy: { dataVencimento: "asc" },
          select: { id: true, valorOriginal: true, valorPago: true, dataPagamento: true },
        });
        const comSaldo = crs
          .map((c) => ({ ...c, saldo: r2(Number(c.valorOriginal) - Number(c.valorPago)) }))
          .filter((c) => c.saldo > 0.001);
        const totalSaldo = r2(comSaldo.reduce((s, c) => s + c.saldo, 0));
        let valorAbatidoCr = 0;
        if (totalSaldo > 0.001) {
          const alvo = Math.min(valorTotal, totalSaldo);
          let restante = alvo;
          for (let i = 0; i < comSaldo.length && restante > 0.001; i++) {
            const c = comSaldo[i];
            const proporcional = i === comSaldo.length - 1 ? restante : r2(alvo * (c.saldo / totalSaldo));
            const abate = r2(Math.min(c.saldo, proporcional, restante));
            if (abate <= 0.001) continue;
            const novoOriginal = r2(Number(c.valorOriginal) - abate);
            const pago = Number(c.valorPago);
            const novoStatus = pago >= novoOriginal - 0.001 ? "PAGA" : pago > 0 ? "PARCIAL" : "ABERTA";
            await tx.contaReceber.update({
              where: { id: c.id },
              data: {
                valorOriginal: novoOriginal,
                status: novoStatus,
                ...(novoStatus === "PAGA" && !c.dataPagamento ? { dataPagamento: hoje } : {}),
              },
            });
            crsAjustadas.push(c.id);
            restante = r2(restante - abate);
            valorAbatidoCr = r2(valorAbatidoCr + abate);
          }
          if (valorAbatidoCr > 0) {
            await tx.devolucao.update({ where: { id: dev.id }, data: { valorAbatidoCr } });
          }
        }

        // 2) DINHEIRO só do que foi efetivamente pago: (valor da devolução −
        //    abatido) não pode exceder o pago do pedido menos o que devoluções
        //    anteriores já devolveram em dinheiro.
        const dinheiro = r2(valorTotal - valorAbatidoCr);
        if (dinheiro > 0.001) {
          const [crsTodas, devsPedido] = await Promise.all([
            tx.contaReceber.findMany({
              where: { pedidoVendaId: pedido.id, status: { not: "CANCELADA" } },
              select: { valorPago: true },
            }),
            tx.devolucao.findMany({ where: { pedidoVendaId: pedido.id, status: "CONCLUIDA" }, select: { id: true } }),
          ]);
          const totalPago = r2(crsTodas.reduce((s, c) => s + Number(c.valorPago), 0));
          const devIds = devsPedido.map((d) => d.id);
          const estornosAnteriores = devIds.length
            ? await tx.lancamentoFinanceiro.findMany({
                where: { devolucaoId: { in: devIds.filter((id) => id !== dev.id) }, tipo: "DESPESA" },
                select: { valor: true },
              })
            : [];
          const jaDevolvidoDinheiro = r2(estornosAnteriores.reduce((s, lf) => s + Number(lf.valor), 0));
          const disponivel = r2(totalPago - jaDevolvidoDinheiro);
          if (dinheiro > disponivel + 0.001) {
            throw new ValidacaoError(
              `Estorno em dinheiro (R$ ${dinheiro.toFixed(2)}) maior que o valor efetivamente pago disponível ` +
              `(R$ ${Math.max(0, disponivel).toFixed(2)}). Use crédito do cliente para a diferença.`,
            );
          }
          await tx.lancamentoFinanceiro.create({
            data: {
              empresaId, tipo: "DESPESA", valor: dinheiro, dataLancamento: hoje,
              descricao: `Devolução ${numero} — PV ${pedido.numero}`, contaBancariaId: contaId!,
              devolucaoId: dev.id,
            },
          });
        }
      } else {
        // Crédito/Troca: gera vale do cliente (saldo p/ compras futuras).
        const nCRC = generateDocNumber("CRC", await proximaSequenciaDaEmpresa(empresaId, "CRC"));
        await tx.creditoCliente.create({
          data: {
            empresaId, numero: nCRC, clienteId: pedido.clienteId, origemDevolucaoId: dev.id,
            valor: valorTotal, status: "ATIVO",
            observacoes: `${f.tipoResolucao === "TROCA" ? "Troca" : "Crédito"} — devolução ${numero} (PV ${pedido.numero})`,
          },
        });
      }

      await recomputarStatusPedido(tx, pedido.id);
      return { dev, crsAjustadas };
    });

    const { dev, crsAjustadas } = resultado;

    // À ordem: reverte os movimentos virtuais (volta para a origem) — cruza
    // empresas, roda pós-commit. Falha NÃO é engolida: loga e avisa na resposta.
    let aviso: string | null = null;
    if (triangular) {
      try {
        await reverterMovimentosTriangulares(dev.id);
      } catch (e) {
        console.error(`[POST /api/comercial/devolucoes] reverterMovimentosTriangulares(${dev.id}) falhou:`, e);
        aviso = "Devolução registrada, mas a reversão dos movimentos da venda à ordem FALHOU — confira o estoque das empresas envolvidas e reprocesse.";
      }
    }

    // Re-sincroniza o contábil dos títulos abatidos e contabiliza a devolução
    // (estorno de receita + retorno do estoque ao custo) — pós-commit.
    for (const crId of crsAjustadas) {
      await recontabilizarTituloReceber(crId).catch((e) =>
        console.error(`[POST /api/comercial/devolucoes] recontabilizarTituloReceber(${crId}) falhou:`, e));
    }
    await contabilizarDevolucao(dev.id).catch((e) =>
      console.error(`[POST /api/comercial/devolucoes] contabilizarDevolucao(${dev.id}) falhou:`, e));

    return NextResponse.json(
      { data: { id: dev.id, numero: dev.numero, ...(aviso ? { aviso } : {}) } },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ValidacaoError) return NextResponse.json({ error: e.message }, { status: 422 });
    const msg = e instanceof Error ? e.message : "Erro ao registrar devolução";
    console.error("[POST /api/comercial/devolucoes]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
