export const dynamic = "force-dynamic";
// Registrar recebimento SEM entregar: o cliente paga o pedido agora, mas a
// entrega será agendada (minutas) depois. Cria a conta a receber PAGA e lança
// o recebimento no caixa (uma entrada por forma, na sua conta) e grava as
// formas no pedido — SEM baixar estoque nem criar minuta. Cobre os dois casos:
// venda de balcão que precisa entregar, e pedido agendado já pago.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
import { z } from "zod";

const pagamentoSchema = z.object({
  forma: z.string().min(1),
  contaBancariaId: z.string().optional().nullable(),
  valor: z.coerce.number().min(0),
  troco: z.boolean().optional(),
});

const schema = z.object({
  pagamentos: z.array(pagamentoSchema).min(1, "Informe ao menos uma forma de pagamento"),
  dataRecebimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { pagamentos: pagamentosIn, dataRecebimento } = parsed.data;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, empresaId: true, status: true, intragrupo: true, clienteId: true, valorTotal: true, dataEntrega: true, _count: { select: { contasReceber: true } } },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (["CANCELADO", "CONCLUIDO"].includes(pedido.status)) {
    return NextResponse.json({ error: `Pedido ${pedido.status.toLowerCase()} não pode receber pagamento.` }, { status: 422 });
  }
  if (pedido.intragrupo) {
    return NextResponse.json({ error: "Venda entre empresas do grupo não usa este recebimento." }, { status: 422 });
  }
  if (pedido._count.contasReceber > 0) {
    return NextResponse.json({ error: "Este pedido já possui conta a receber registrada." }, { status: 409 });
  }

  const valorTotal = parseFloat(pedido.valorTotal.toString());
  if (valorTotal <= 0) return NextResponse.json({ error: "Pedido sem valor a receber." }, { status: 422 });

  // Dia confirmado (ou hoje em Brasília), meia-noite UTC.
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${dataRecebimento || hojeSP}T00:00:00.000Z`);

  // Normaliza as formas (mesma lógica do balcão): soma cobre o total; troco só
  // sai das linhas de dinheiro; troco abatido para a soma fechar com o total.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const linhas = pagamentosIn.map((p) => ({
    forma: p.forma,
    contaBancariaId: p.contaBancariaId || "caixa-geral",
    valor: round2(p.valor),
    troco: !!p.troco,
  }));
  const somaPag = round2(linhas.reduce((s, l) => s + l.valor, 0));
  if (somaPag < valorTotal - 0.001) {
    return NextResponse.json({ error: `Pagamento insuficiente: faltam R$ ${round2(valorTotal - somaPag).toFixed(2)}.` }, { status: 422 });
  }
  const troco = round2(somaPag - valorTotal);
  const totalTroco = round2(linhas.filter((l) => l.troco).reduce((s, l) => s + l.valor, 0));
  if (troco > 0.001 && troco > totalTroco + 0.001) {
    return NextResponse.json({ error: "O troco excede o valor recebido em dinheiro." }, { status: 422 });
  }
  let restanteTroco = troco;
  for (const l of linhas) {
    if (restanteTroco <= 0.001) break;
    if (!l.troco) continue;
    const abate = Math.min(l.valor, restanteTroco);
    l.valor = round2(l.valor - abate);
    restanteTroco = round2(restanteTroco - abate);
  }
  const linhasReais = linhas.filter((l) => l.valor > 0.001);
  const formasResumo = Array.from(new Set(linhasReais.map((l) => l.forma))).join(" + ") || null;

  const numeroCR = generateDocNumber("CR", await proximaSequenciaDaEmpresa(pedido.empresaId, "CR"));

  try {
    const conta = await prisma.$transaction(async (tx) => {
      // Trava: só registra recebimento se ainda não há conta a receber.
      const jaTem = await tx.contaReceber.count({ where: { pedidoVendaId: pedido.id } });
      if (jaTem > 0) throw new Error("CONFLITO: já existe conta a receber para este pedido.");

      const novaConta = await tx.contaReceber.create({
        data: {
          empresaId: pedido.empresaId,
          numero: numeroCR,
          clienteId: pedido.clienteId,
          pedidoVendaId: pedido.id,
          descricao: `Recebimento ${pedido.numero} (entrega a agendar)`,
          valorOriginal: valorTotal,
          valorPago: valorTotal,
          dataVencimento: hoje,
          dataPagamento: hoje,
          status: "PAGA",
          formaPagamento: formasResumo,
        },
      });

      for (const l of linhasReais) {
        await tx.lancamentoFinanceiro.create({
          data: {
            empresaId: pedido.empresaId,
            tipo: "RECEITA",
            descricao: `Recebimento ${numeroCR} — ${pedido.numero}${linhasReais.length > 1 ? ` (${l.forma})` : ""}`,
            valor: l.valor,
            dataLancamento: hoje,
            contaReceberId: novaConta.id,
            contaBancariaId: l.contaBancariaId,
          },
        });
      }

      // Formas reais com a conta de destino, para o detalhe mostrar.
      await tx.pedidoVendaPagamento.deleteMany({ where: { pedidoVendaId: pedido.id } });
      await tx.pedidoVendaPagamento.createMany({
        data: linhasReais.map((l, i) => ({ pedidoVendaId: pedido.id, forma: l.forma, valor: l.valor, ordem: i, contaBancariaId: l.contaBancariaId })),
      });

      // Move para EM_AGENDAMENTO (pronto para agendar entregas) se ainda estava
      // em orçamento/confirmado. NÃO baixa estoque nem cria minuta.
      if (["ORCAMENTO", "CONFIRMADO"].includes(pedido.status)) {
        await tx.pedidoVenda.update({ where: { id: pedido.id }, data: { status: "EM_AGENDAMENTO" } });
      }

      return novaConta;
    });

    return NextResponse.json({ data: { contaNumero: conta.numero } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao registrar recebimento";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/receber]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
