export const dynamic = "force-dynamic";
// Venda balcão (retirada na loja): o caixa recebe o pagamento e conclui o
// pedido em uma ação só — minuta de RETIRADA criada já ENTREGUE com baixa de
// estoque, conta a receber nasce PAGA e o recebimento é lançado na conta
// indicada (padrão Caixa Geral). Fluxo da Cimento e Mix; pedidos com entrega
// continuam no fluxo normal de minutas.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa, contaCaixaIdDaEmpresa, empresasDoGrupo } from "@/lib/empresa";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { espelharEntregaTriangular } from "@/lib/intragrupo";
import { saldoCreditoCliente, consumirCreditoCliente } from "@/lib/credito-cliente";
import { generateDocNumber, generateSimpleDocNumber } from "@/lib/utils";
import { pedidoPrintData } from "@/lib/print-pedido-server";
import { contabilizarPedidoVenda, contabilizarCmvMinuta, contabilizarReceitaMinuta } from "@/lib/contabilidade";
import { resolverLocaisSaida } from "@/lib/local-saida";
import { z } from "zod";

const pagamentoSchema = z.object({
  forma: z.string().min(1),
  contaBancariaId: z.string().optional().nullable(),
  valor: z.coerce.number().min(0),
  troco: z.boolean().optional(), // linha em dinheiro: pode exceder o total (devolve troco)
});

const schema = z.object({
  localEstoqueId: z.string().min(1, "Informe o local de estoque da retirada"),
  // Pagamento misto: várias formas com valores. Mantém os campos únicos como
  // fallback (fluxo de 1 forma).
  pagamentos: z.array(pagamentoSchema).optional(),
  formaPagamento: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
  // Data do recebimento/conclusão (YYYY-MM-DD) — o caixa confirma; vazio = hoje.
  dataRecebimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // Venda à ordem marcada no caixa: estoque sai de outra empresa do grupo.
  estoqueOrigemEmpresaId: z.string().optional().nullable(),
  precoTransferencia: z.coerce.number().optional().nullable(),
  // Abatimento por crédito (vale) do cliente — o caixa cobre (total - crédito).
  creditoUsado: z.coerce.number().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { localEstoqueId, pagamentos: pagamentosIn, formaPagamento, contaBancariaId, dataRecebimento } = parsed.data;
  const origemBody = parsed.data.estoqueOrigemEmpresaId || null;
  const precoTransfBody = parsed.data.precoTransferencia != null && Number(parsed.data.precoTransferencia) > 0
    ? Number(parsed.data.precoTransferencia) : null;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      itens: true,
      minutas: { where: { status: { not: "CANCELADA" } }, select: { id: true } },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  if (!["ORCAMENTO", "CONFIRMADO"].includes(pedido.status)) {
    return NextResponse.json({ error: `Pedido ${pedido.status.toLowerCase()} não pode ser concluído no balcão.` }, { status: 422 });
  }
  if (pedido.intragrupo) {
    return NextResponse.json({ error: "Venda entre empresas do grupo segue o fluxo normal de confirmação e entrega." }, { status: 422 });
  }
  // Venda à ordem: o estoque sai de outra empresa do grupo. Pode já estar no
  // pedido ou ser marcada aqui no caixa (origemBody). A baixa normal é pulada;
  // os movimentos virtuais são gerados após o commit por gerarMovimentosTriangulares.
  let origemEfetiva = pedido.estoqueOrigemEmpresaId;
  if (origemBody && !pedido.estoqueOrigemEmpresaId) {
    if (origemBody === pedido.empresaId) {
      return NextResponse.json({ error: "A empresa de origem do estoque deve ser diferente da empresa da venda" }, { status: 400 });
    }
    // A origem pode ser qualquer empresa ativa do grupo, mesmo que o caixa não
    // tenha acesso a ela (venda à ordem). A baixa na origem usa prismaSemEscopo.
    const grupo = await empresasDoGrupo();
    if (!grupo.some((e) => e.id === origemBody)) {
      return NextResponse.json({ error: "Empresa de origem inválida" }, { status: 400 });
    }
    origemEfetiva = origemBody;
  }
  const triangular = !!origemEfetiva;
  // "Controle por minutas manuais": o caixa só RECEBE — não baixa estoque nem
  // cria minuta; o vendedor cria as minutas depois (controla o saldo a entregar).
  // "Cliente retirar tudo" (RETIRADA) segue baixando tudo na hora.
  const entregaManual = !triangular && pedido.necessidadeEntrega === "ENTREGA";
  // Sem baixa imediata no caixa (à ordem usa a origem; manual usa minutas depois).
  const semBaixa = triangular || entregaManual;

  if (pedido.minutas.length > 0) {
    return NextResponse.json({ error: "Este pedido já possui minutas — conclua pelo fluxo de entrega." }, { status: 422 });
  }
  if (pedido.itens.length === 0) {
    return NextResponse.json({ error: "Pedido sem itens." }, { status: 422 });
  }

  // À ordem e "minutas manuais": o caixa só RECEBE e o pedido permanece
  // CONFIRMADO. Como o status não vira CONCLUIDO, a trava por status dentro da
  // transação não impede reexecução — um novo clique no caixa receberia de novo,
  // DUPLICANDO a conta a receber. Bloqueia aqui se já há recebimento (PAGA).
  if (semBaixa && parseFloat(pedido.valorTotal.toString()) > 0) {
    const jaRecebido = await prisma.contaReceber.count({
      where: { pedidoVendaId: pedido.id, status: "PAGA" },
    });
    if (jaRecebido > 0) {
      return NextResponse.json(
        {
          error: triangular
            ? "Esta venda à ordem já foi recebida no caixa. A expedição é feita pela empresa de origem."
            : "Este pedido já foi recebido no caixa. Crie as minutas pelo fluxo de entrega.",
        },
        { status: 409 },
      );
    }
  }

  // Dia confirmado pelo caixa (ou hoje em horário de Brasília), gravado como
  // meia-noite UTC (padrão dos campos de data).
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${dataRecebimento || hojeSP}T00:00:00.000Z`);
  const valorTotal = parseFloat(pedido.valorTotal.toString());

  // ── Normaliza as formas de pagamento ──────────────────────────────────────
  // Pagamento misto: usa a lista `pagamentos`; sem ela, cai no fluxo de 1 forma
  // (formaPagamento + contaBancariaId únicos pelo valor total).
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // Crédito (vale) do cliente abatido nesta venda: o caixa cobre (total - crédito).
  const creditoUsado = Math.max(0, round2(Number(parsed.data.creditoUsado ?? 0)));
  const alvoCash = round2(Math.max(0, valorTotal - creditoUsado));
  const caixaPadrao = contaCaixaIdDaEmpresa(pedido.empresaId);
  const linhas = (pagamentosIn && pagamentosIn.length > 0)
    ? pagamentosIn.map((p) => ({
        forma: p.forma,
        contaBancariaId: p.contaBancariaId || caixaPadrao,
        valor: round2(p.valor),
        troco: !!p.troco,
      }))
    : (alvoCash > 0 ? [{
        forma: (formaPagamento ?? pedido.formaPagamento ?? "À vista"),
        contaBancariaId: contaBancariaId || caixaPadrao,
        valor: alvoCash,
        troco: false,
      }] : []);

  // Guarda de roteamento: forma eletrônica (Pix, cartão, transferência…) não
  // pode cair em conta tipo CAIXA (dinheiro físico). Espelha a trava do caixa e
  // protege contra Pix/cartão sendo lançados no Caixa em Dinheiro. Só vale se a
  // empresa TEM banco cadastrado — sem banco, o Caixa é a única conta possível.
  if (linhas.length > 0) {
    const temBanco = await prisma.contaBancaria.findFirst({
      where: { empresaId: pedido.empresaId, tipo: { not: "CAIXA" }, ativo: true },
      select: { id: true },
    });
    if (temBanco) {
      const contaIds = Array.from(new Set(linhas.map((l) => l.contaBancariaId)));
      const [contasInfo, formasInfo] = await Promise.all([
        prisma.contaBancaria.findMany({ where: { id: { in: contaIds } }, select: { id: true, tipo: true } }),
        prisma.formaPagamento.findMany({ select: { nome: true, tipo: true } }),
      ]);
      const ehDinheiro = (forma: string) => {
        const f = formasInfo.find((x) => x.nome === forma);
        return f ? f.tipo === "DINHEIRO" : /dinheiro|esp[ée]cie/i.test(forma);
      };
      const contaEhCaixa = (id: string) => id === "caixa-geral" || contasInfo.some((c) => c.id === id && c.tipo === "CAIXA");
      const ruim = linhas.find((l) => l.valor > 0 && !ehDinheiro(l.forma) && contaEhCaixa(l.contaBancariaId));
      if (ruim) {
        return NextResponse.json({ error: `A forma "${ruim.forma}" não pode ser recebida no Caixa em Dinheiro — selecione a conta bancária de destino.` }, { status: 422 });
      }
    }
  }

  if (alvoCash > 0) {
    const somaPag = round2(linhas.reduce((s, l) => s + l.valor, 0));
    if (somaPag < alvoCash - 0.001) {
      return NextResponse.json({ error: `Pagamento insuficiente: faltam R$ ${round2(alvoCash - somaPag).toFixed(2)}.` }, { status: 422 });
    }
    // O excesso (troco) só pode sair das linhas de dinheiro (troco=true).
    const troco = round2(somaPag - alvoCash);
    const totalTroco = round2(linhas.filter((l) => l.troco).reduce((s, l) => s + l.valor, 0));
    if (troco > 0.001 && troco > totalTroco + 0.001) {
      return NextResponse.json({ error: "O troco excede o valor recebido em dinheiro." }, { status: 422 });
    }
    // Abate o troco da(s) linha(s) de dinheiro para o total recebido fechar
    // com o valor da venda (o troco devolvido não entra no caixa).
    let restanteTroco = troco;
    for (const l of linhas) {
      if (restanteTroco <= 0.001) break;
      if (!l.troco) continue;
      const abate = Math.min(l.valor, restanteTroco);
      l.valor = round2(l.valor - abate);
      restanteTroco = round2(restanteTroco - abate);
    }
  }
  // Linhas efetivas com valor > 0 (após abater troco), resumo das formas.
  const linhasReais = linhas.filter((l) => l.valor > 0.001);
  const formasResumo = [
    ...Array.from(new Set(linhasReais.map((l) => l.forma))),
    ...(creditoUsado > 0 ? ["Crédito"] : []),
  ].join(" + ") || (formaPagamento ?? pedido.formaPagamento ?? null);

  // Compensação por forma (ex.: cartão de crédito = 30 dias): linhas com
  // diasCompensacao > 0 NÃO entram no caixa na hora — viram conta a receber com
  // vencimento +N dias. As demais (dinheiro/Pix/débito) são recebidas no ato.
  const formasComp = await prisma.formaPagamento.findMany({ select: { nome: true, diasCompensacao: true } });
  const diasDaForma = (forma: string) => formasComp.find((f) => f.nome === forma)?.diasCompensacao ?? 0;
  const linhasRecebidas = linhasReais.filter((l) => diasDaForma(l.forma) <= 0);
  const linhasAReceber = linhasReais.filter((l) => diasDaForma(l.forma) > 0);
  const valorRecebido = round2(linhasRecebidas.reduce((s, l) => s + l.valor, 0));
  const valorAReceber = round2(linhasAReceber.reduce((s, l) => s + l.valor, 0));
  const maxDiasComp = linhasAReceber.reduce((m, l) => Math.max(m, diasDaForma(l.forma)), 0);

  // Valida o crédito antes da transação (erro limpo).
  if (creditoUsado > 0) {
    if (creditoUsado > valorTotal + 0.001) {
      return NextResponse.json({ error: "O crédito abatido excede o valor da venda." }, { status: 422 });
    }
    const saldo = await saldoCreditoCliente(prisma, pedido.empresaId, pedido.clienteId);
    if (creditoUsado > saldo + 0.001) {
      return NextResponse.json({ error: `Crédito insuficiente do cliente (saldo R$ ${saldo.toFixed(2)}).` }, { status: 422 });
    }
  }

  // Numeração da empresa DONA do pedido (modo grupo pode operar outra empresa).
  const numeroMin = generateSimpleDocNumber("MIN", await proximaSequenciaDaEmpresa(pedido.empresaId, "MIN"));
  const seqMov = await proximaSequenciaDaEmpresa(pedido.empresaId, "MOV");
  const movNumero = `MOV-${new Date().getFullYear()}-${String(seqMov).padStart(4, "0")}`;
  const numeroCR = valorTotal > 0
    ? generateDocNumber("CR", await proximaSequenciaDaEmpresa(pedido.empresaId, "CR"))
    : null;
  // 2º número para o título a receber (cartão de crédito) numa venda nova.
  const numeroCR2 = valorAReceber > 0
    ? generateDocNumber("CR", await proximaSequenciaDaEmpresa(pedido.empresaId, "CR"))
    : null;
  const vencCompensacao = new Date(hoje.getTime() + maxDiasComp * 86400000);

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Trava a conclusão: só UMA requisição move o pedido para CONCLUIDO.
      // Duplo clique no caixa não pode baixar estoque nem receber duas vezes.
      const claimed = await tx.pedidoVenda.updateMany({
        where: { id: params.id, status: { in: ["ORCAMENTO", "CONFIRMADO"] } },
        // data confirmada pelo caixa prevalece sobre a previsão do pedido; a
        // forma de pagamento confirmada fica carimbada no pedido (e no cupom)
        data: {
          // À ordem e "minutas manuais": o caixa só RECEBE; a venda fica
          // CONFIRMADA (à ordem: expedição na origem; manual: minutas depois).
          // "Cliente retirar tudo" conclui na hora.
          status: semBaixa ? "CONFIRMADO" : "CONCLUIDO",
          dataEntrega: dataRecebimento ? hoje : (pedido.dataEntrega ?? hoje),
          ...(semBaixa ? {} : { dataConclusao: hoje }),
          ...(formasResumo ? { formaPagamento: formasResumo } : {}),
          // À ordem marcada no caixa: grava a origem (e preço de transferência)
          // p/ o pedido de entrega ser criado na origem (espelharEntregaTriangular).
          ...(origemBody && !pedido.estoqueOrigemEmpresaId
            ? { estoqueOrigemEmpresaId: origemEfetiva, precoTransferencia: precoTransfBody }
            : {}),
        },
      });
      if (claimed.count === 0) {
        throw new Error("CONFLITO: o pedido já foi concluído por outra operação — recarregue a página.");
      }

      // Sem baixa imediata (à ordem ou minutas manuais): não cria minuta aqui.
      // "Cliente retirar tudo": minuta de RETIRADA já ENTREGUE com baixa total.
      const minuta = semBaixa ? null : await tx.minuta.create({
        data: {
          numero: numeroMin,
          empresaId: pedido.empresaId,
          pedidoVendaId: pedido.id,
          localEstoqueId,
          tipo: "RETIRADA",
          status: "ENTREGUE",
          dataEntrega: hoje,
          observacoes: "Venda balcão — retirada na loja",
          itens: {
            create: pedido.itens.map((it) => ({
              pedidoVendaItemId: it.id,
              itemId: it.itemId,
              quantidade: it.quantidade,
            })),
          },
        },
      });

      // Pula a baixa normal quando à ordem (movimentos virtuais pós-commit) ou
      // "minutas manuais" (a baixa virá nas minutas criadas depois).
      if (!semBaixa) {
        const lote = await tx.loteMovimentacao.create({
          data: {
            empresaId: pedido.empresaId,
            numero: movNumero,
            tipo: "SAIDA",
            documento: minuta!.numero,
            observacoes: `Venda balcão ${pedido.numero} — minuta ${minuta!.numero}`,
          },
        });

        // Cada item sai do SEU local (categoria/saldo); o local da retirada é
        // só fallback. Evita baixar tudo num único local e estourar saldo (e a
        // conta contábil) de itens que não pertencem àquele local.
        const locaisPorItem = await resolverLocaisSaida(
          tx, pedido.empresaId, pedido.itens.map((i) => i.itemId), localEstoqueId,
        );

        for (const item of pedido.itens) {
          const quantidade = parseFloat(item.quantidade.toString());
          const itemLocal = locaisPorItem.get(item.itemId) ?? localEstoqueId;

          let estoque = await tx.estoqueItem.findFirst({
            where: { empresaId: pedido.empresaId, itemId: item.itemId, localEstoqueId: itemLocal, clienteDonoId: null },
          });
          if (!estoque) {
            estoque = await tx.estoqueItem.create({
              data: { empresaId: pedido.empresaId, itemId: item.itemId, localEstoqueId: itemLocal, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null },
            });
          }

          // decrement atômico: o saldo da linha deriva do valor pós-update.
          const atualizado = await tx.estoqueItem.update({
            where: { id: estoque.id },
            data: { quantidadeAtual: { decrement: quantidade } },
          });
          const saldoDepois = parseFloat(atualizado.quantidadeAtual.toString());

          await tx.movimentacaoEstoque.create({
            data: {
              empresaId: pedido.empresaId,
              itemId: item.itemId,
              localEstoqueId: itemLocal,
              loteId: lote.id,
              pedidoVendaItemId: item.id,
              tipo: "SAIDA",
              quantidade,
              saldoAntes: saldoDepois + quantidade,
              saldoDepois,
              documento: minuta!.numero,
              observacoes: `Venda balcão — minuta ${minuta!.numero}`,
            },
          });
        }
      }

      // Recebimento à vista: o dinheiro entra na conta indicada. Se o pedido JÁ
      // tem título(s) em aberto (gerado na confirmação), eles são RECEBIDOS
      // (baixados) — não cria outro. Senão, cria uma conta já PAGA.
      // Cria os lançamentos de caixa (recebimento de fato) de um conjunto de linhas.
      const receberLinhas = async (contaId: string, lns: typeof linhasReais) => {
        for (const l of lns) {
          await tx.lancamentoFinanceiro.create({
            data: {
              empresaId: pedido.empresaId,
              tipo: "RECEITA",
              descricao: `Recebimento — venda balcão${linhasReais.length > 1 ? ` (${l.forma})` : ""}`,
              valor: l.valor,
              dataLancamento: hoje,
              contaReceberId: contaId,
              contaBancariaId: l.contaBancariaId,
            },
          });
        }
      };

      let conta: { id: string; numero: string } | null = null;
      if (valorTotal > 0) {
        const abertos = await tx.contaReceber.findMany({
          where: { pedidoVendaId: pedido.id, status: { in: ["ABERTA", "PARCIAL", "VENCIDA"] } },
          orderBy: [{ parcelaNumero: "asc" }, { dataVencimento: "asc" }],
          select: { id: true, numero: true, valorOriginal: true },
        });
        if (abertos.length > 0) {
          // Títulos pré-gerados (a prazo): baixa todos e recebe no caixa.
          for (const ab of abertos) {
            await tx.contaReceber.update({
              where: { id: ab.id },
              data: { valorPago: ab.valorOriginal, dataPagamento: hoje, status: "PAGA", formaPagamento: formasResumo },
            });
          }
          conta = { id: abertos[0].id, numero: abertos[0].numero };
          // Distribui o recebimento POR PARCELA: cada título ganha lançamento(s) de
          // caixa pelo seu próprio valor — NUNCA concentra o total na 1ª parcela
          // (senão o caixa e a contabilidade por título saem divergentes). Preenche
          // cada CR com as linhas de pagamento em ordem (cobre pagamento misto).
          let li = 0;
          let restanteLinha = linhasReais[0]?.valor ?? 0;
          for (const ab of abertos) {
            let restanteCR = parseFloat(ab.valorOriginal.toString());
            while (restanteCR > 0.001 && li < linhasReais.length) {
              const usar = round2(Math.min(restanteCR, restanteLinha));
              if (usar > 0.001) {
                await tx.lancamentoFinanceiro.create({
                  data: {
                    empresaId: pedido.empresaId, tipo: "RECEITA",
                    descricao: `Recebimento — venda balcão${linhasReais.length > 1 ? ` (${linhasReais[li].forma})` : ""}`,
                    valor: usar, dataLancamento: hoje,
                    contaReceberId: ab.id, contaBancariaId: linhasReais[li].contaBancariaId,
                  },
                });
              }
              restanteCR = round2(restanteCR - usar);
              restanteLinha = round2(restanteLinha - usar);
              if (restanteLinha <= 0.001) { li++; restanteLinha = linhasReais[li]?.valor ?? 0; }
            }
          }
        } else {
          // Venda nova: o recebido no ato (dinheiro/Pix/débito) baixa o caixa; o
          // cartão de crédito (diasCompensacao > 0) vira conta A RECEBER (+N dias).
          if (valorRecebido > 0 && numeroCR) {
            conta = await tx.contaReceber.create({
              data: {
                empresaId: pedido.empresaId, numero: numeroCR, clienteId: pedido.clienteId, pedidoVendaId: pedido.id,
                descricao: `Venda balcão ${pedido.numero}`, valorOriginal: valorRecebido, valorPago: valorRecebido,
                dataVencimento: hoje, dataPagamento: hoje, status: "PAGA", formaPagamento: formasResumo,
              },
              select: { id: true, numero: true },
            });
            await receberLinhas(conta.id, linhasRecebidas);
          }
          if (valorAReceber > 0 && numeroCR2) {
            const formaCred = linhasAReceber.map((l) => l.forma).join(" + ");
            const crAR = await tx.contaReceber.create({
              data: {
                empresaId: pedido.empresaId, numero: numeroCR2, clienteId: pedido.clienteId, pedidoVendaId: pedido.id,
                descricao: `Venda balcão ${pedido.numero} — ${formaCred} (a receber ${maxDiasComp}d)`,
                valorOriginal: valorAReceber, valorPago: 0, dataVencimento: vencCompensacao, status: "ABERTA", formaPagamento: formaCred,
              },
              select: { id: true, numero: true },
            });
            if (!conta) conta = crAR;
          }
        }
      }
      if (conta) {

        // Registra no pedido as formas REAIS recebidas, com a conta de destino
        // (ex.: PIX → Banco X), para o detalhe mostrar onde cada forma caiu.
        await tx.pedidoVendaPagamento.deleteMany({ where: { pedidoVendaId: pedido.id } });
        await tx.pedidoVendaPagamento.createMany({
          data: linhasReais.map((l, i) => ({
            pedidoVendaId: pedido.id,
            forma: l.forma,
            valor: l.valor,
            ordem: i,
            contaBancariaId: l.contaBancariaId,
          })),
        });

        // Crédito (vale) do cliente: debita o saldo (FIFO) e registra a forma —
        // sem lançamento de caixa (não é entrada de dinheiro). A CR fica PAGA.
        if (creditoUsado > 0) {
          await consumirCreditoCliente(tx, pedido.empresaId, pedido.clienteId, creditoUsado);
          await tx.pedidoVendaPagamento.create({
            data: { pedidoVendaId: pedido.id, forma: "Crédito do cliente", valor: creditoUsado, ordem: linhasReais.length },
          });
        }
      }

      await recomputarStatusPedido(tx, pedido.id);
      return { minuta, conta };
    });

    // Venda à ordem: cria o Pedido de Entrega na origem (Tramontin) — a baixa e
    // a expedição acontecem lá; a compra virtual + financeiro disparam quando a
    // origem entregar. O caixa apenas recebeu o pagamento (venda oficial).
    if (triangular) await espelharEntregaTriangular(pedido.id);

    // Dados de impressão do cupom (o PDV imprime direto da resposta).
    const pedidoImpresso = await prisma.pedidoVenda.findUnique({
      where: { id: params.id },
      include: {
        cliente: true,
        empresa: true,
        vendedor: { select: { nome: true } },
        itens: { include: { item: { include: { unidade: { select: { sigla: true } } } } } },
      },
    });

    // Contabiliza (best-effort, pós-commit) a(s) conta(s) a receber do pedido.
    await contabilizarPedidoVenda(params.id).catch(() => {});
    if (resultado.minuta?.id) {
      await contabilizarCmvMinuta(resultado.minuta.id).catch(() => {});
      await contabilizarReceitaMinuta(resultado.minuta.id).catch(() => {});
    }

    return NextResponse.json({
      data: {
        minutaId: resultado.minuta?.id ?? null,
        minutaNumero: resultado.minuta?.numero ?? null,
        contaNumero: resultado.conta?.numero ?? null,
        triangular,
        print: pedidoImpresso ? pedidoPrintData(pedidoImpresso) : null,
      },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao concluir venda balcão";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/balcao]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
