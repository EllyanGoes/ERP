// Baixa de título (Contas a Receber / Contas a Pagar) — núcleo compartilhado.
//
// Extraído dos PATCH de contas-receber/[id] e contas-pagar/[id] (eram ~90 linhas
// quase idênticas) e reusado pela baixa em lote. Regras que vivem AQUI:
//   • guard otimista: o updateMany condiciona em (status, valorPago) lidos na
//     mesma transação — duplo clique/concorrência cai no count === 0 (409);
//   • teto anti-overpay: a soma baixada não pode exceder
//     (valorOriginal + juros + multa − já pago) → 422;
//   • trava de roteamento: forma eletrônica não pode cair no Caixa em Dinheiro
//     (formaEletronicaNoCaixa) → 422;
//   • sentinel "caixa-geral": traduzido para a conta padrão do título ou o
//     caixa da empresa (contaCaixaIdDaEmpresa);
//   • um LancamentoFinanceiro por linha/forma; multa+juros entram na 1ª linha;
//   • rateio gerencial por natureza (só PAGAR): valida a soma contra o valor do
//     título e substitui o rateio anterior;
//   • recomputa o status financeiro do pedido (venda/compra) vinculado.
//
// TODAS as validações acontecem ANTES de qualquer escrita: um retorno de erro
// não deixa a transação do chamador com escrita parcial (o chamador pode
// simplesmente devolver o erro sem rollback explícito).
//
// A contabilização (recontabilizarTituloReceber/Pagar) fica com o CHAMADOR,
// pós-commit — este módulo só mexe no financeiro.
import type { Prisma, ContaPagar, ContaReceber } from "@prisma/client";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";
import { recomputarStatusPedido, recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";
import { naturezaSistema } from "@/lib/natureza-sistema";
import type { PagamentoFormData } from "@/lib/validations/financeiro";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LinhaBaixa = { forma: string | null; contaBancariaId: string | null; valor: number; maquinetaId?: string | null };
export type NaturezaRateio = { naturezaFinanceiraId: string; detalhamento?: string | null; valor: number };
export type BaixaErro = { msg: string; status: number };
export type ResultadoBaixa =
  | { erro: BaixaErro; conta: null }
  | { erro: null; conta: ContaReceber | ContaPagar };

/**
 * Normaliza o corpo do pagamentoSchema para a lista de linhas de baixa
 * (1 forma = compat com valorPago/formaPagamento/contaBancariaId únicos).
 */
export function normalizarLinhasPagamento(d: PagamentoFormData): {
  linhas: LinhaBaixa[];
  valorPagoTotal: number;
} {
  const linhas: LinhaBaixa[] = (d.pagamentos && d.pagamentos.length > 0)
    ? d.pagamentos.map((p) => ({ forma: p.forma ?? null, contaBancariaId: p.contaBancariaId ?? null, valor: p.valor, maquinetaId: p.maquinetaId ?? null }))
    : [{ forma: d.formaPagamento ?? null, contaBancariaId: d.contaBancariaId ?? null, valor: d.valorPago ?? 0 }];
  return { linhas, valorPagoTotal: r2(linhas.reduce((s, l) => s + l.valor, 0)) };
}

export async function baixarTitulo(
  tx: Prisma.TransactionClient,
  opts: {
    tipo: "RECEBER" | "PAGAR";
    tituloId: string;
    linhas: LinhaBaixa[];
    dataPagamento: string | Date;
    valorMulta?: number;
    valorJuros?: number;
    /**
     * Taxa/tarifa RETIDA no ato (recebe/paga MENOS que o baixado — taxa de
     * cartão, tarifa bancária): o título é quitado pela soma linhas+taxa, mas o
     * caixa só recebe as linhas. A taxa nunca contamina o principal — vira
     * despesa com natureza TRAVADA (taxaNaturezaId; default por lado).
     */
    valorTaxa?: number;
    taxaNaturezaId?: string | null;
    /** Rateio gerencial por natureza (só PAGAR) — substitui o rateio anterior. */
    naturezas?: NaturezaRateio[];
  },
): Promise<ResultadoBaixa> {
  const { tipo, tituloId, linhas } = opts;
  const isReceber = tipo === "RECEBER";
  const valorMulta = opts.valorMulta ?? 0;
  const valorJuros = opts.valorJuros ?? 0;
  // Taxa manual do modal (tarifa bancária etc.). A taxa de MAQUINETA é derivada
  // por linha mais abaixo e soma nesta na hora de persistir no título.
  const valorTaxaManual = r2(opts.valorTaxa ?? 0);
  const dataPag = new Date(opts.dataPagamento);
  // Quitação do título = Σ linhas (BRUTO — a taxa de maquineta está dentro do
  // valor da linha) + taxa manual retida.
  const valorPagoTotal = r2(linhas.reduce((s, l) => s + l.valor, 0) + valorTaxaManual);
  const formaResumo = Array.from(new Set(linhas.map((l) => l.forma).filter(Boolean))).join(" + ") || null;

  const conta = isReceber
    ? await tx.contaReceber.findUnique({ where: { id: tituloId } })
    : await tx.contaPagar.findUnique({ where: { id: tituloId } });
  if (!conta) return { erro: { msg: "Conta não encontrada", status: 404 }, conta: null };
  if (conta.status === "PAGA" || conta.status === "CANCELADA") {
    return { erro: { msg: `Conta já está ${conta.status === "PAGA" ? "paga" : "cancelada"}.`, status: 409 }, conta: null };
  }

  // ── Cartão com maquineta (só RECEBER): troca de credor ────────────────────
  // Linha com maquinetaId: a conta efetiva é a da ADMINISTRADORA (tipo CARTAO,
  // razão 1.1.8) e a taxa (valor × taxaPct do tipo crédito/débito) fica retida
  // no título — o lançamento entra pelo LÍQUIDO. Espelha a venda balcão.
  const maqIds = Array.from(new Set(linhas.map((l) => l.maquinetaId).filter((id): id is string => !!id)));
  if (maqIds.length > 0 && !isReceber) {
    return { erro: { msg: "Maquineta só se aplica a recebimentos no cartão.", status: 422 }, conta: null };
  }
  type MaquinetaBaixa = {
    id: string; nome: string; ativo: boolean; empresaId: string;
    administradora: { ativo: boolean; contaBancariaId: string };
    taxas: { tipoForma: string; taxaPct: Prisma.Decimal }[];
  };
  const maqDe = new Map<string, MaquinetaBaixa>();
  // Resolve nome→tipo da forma sempre que alguma linha tem forma (necessário
  // p/ detectar PERMUTA, além da validação de maquineta/cartão).
  let tipoDaForma: (nome: string | null) => string | null = () => null;
  if (maqIds.length > 0 || linhas.some((l) => l.forma)) {
    const formasInfo = await tx.formaPagamento.findMany({ select: { nome: true, tipo: true } });
    tipoDaForma = (nome) => formasInfo.find((f) => f.nome === nome)?.tipo ?? null;
  }
  if (maqIds.length > 0) {
    const maquinetas = await tx.maquineta.findMany({
      where: { id: { in: maqIds } },
      select: {
        id: true, nome: true, ativo: true, empresaId: true,
        administradora: { select: { ativo: true, contaBancariaId: true } },
        taxas: { select: { tipoForma: true, taxaPct: true } },
      },
    });
    for (const m of maquinetas) maqDe.set(m.id, m);
    for (const l of linhas) {
      if (!l.maquinetaId) continue;
      const tipoForma = tipoDaForma(l.forma);
      if (tipoForma !== "CARTAO_CREDITO" && tipoForma !== "CARTAO_DEBITO") {
        return { erro: { msg: `Maquineta só se aplica a formas de cartão — "${l.forma ?? "sem forma"}" não é cartão de crédito/débito.`, status: 422 }, conta: null };
      }
      const m = maqDe.get(l.maquinetaId);
      if (!m || !m.ativo || m.empresaId !== conta.empresaId || m.administradora.ativo === false) {
        return { erro: { msg: "Maquineta inválida ou inativa para a empresa do título.", status: 422 }, conta: null };
      }
      if (!m.taxas.some((t) => t.tipoForma === tipoForma)) {
        return { erro: { msg: `A maquineta "${m.nome}" não tem taxa cadastrada para ${tipoForma === "CARTAO_CREDITO" ? "cartão de crédito" : "cartão de débito"} — cadastre em Financeiro → Cartões.`, status: 422 }, conta: null };
      }
    }
  }
  // Taxa da linha de maquineta (valor × taxaPct, arredondada a 2 casas): o
  // lançamento entra pelo líquido = valor − taxa (exato) — o centavo de
  // arredondamento fica na taxa, nunca no caixa.
  const taxaDaLinha = (l: LinhaBaixa) => {
    if (!l.maquinetaId) return 0;
    const m = maqDe.get(l.maquinetaId);
    const pct = Number(m?.taxas.find((t) => t.tipoForma === tipoDaForma(l.forma))?.taxaPct ?? 0);
    return r2((l.valor * pct) / 100);
  };
  const taxaMaquinetas = r2(linhas.reduce((s, l) => s + taxaDaLinha(l), 0));
  // Total retido persistido no título (coluna valorTaxa): manual + maquinetas.
  const valorTaxa = r2(valorTaxaManual + taxaMaquinetas);

  const totalOriginal = parseFloat(conta.valorOriginal.toString());
  const jaPago = parseFloat(conta.valorPago.toString());
  const totalPago = r2(jaPago + valorPagoTotal);
  const newStatus = totalPago >= totalOriginal ? "PAGA" : "PARCIAL";

  // Taxa retida: valida a natureza travada (sistema=true, mesma empresa; default
  // por lado) e rejeita em título intragrupo — o motor pula caixa intragrupo e a
  // taxa sumiria silenciosamente do razão.
  let taxaNaturezaId: string | null = null;
  if (valorTaxa > 0.005) {
    if (conta.intragrupo) {
      return { erro: { msg: "Título intragrupo não aceita taxa/tarifa retida.", status: 422 }, conta: null };
    }
    if (opts.taxaNaturezaId) {
      const nat = await tx.naturezaFinanceira.findFirst({
        where: { id: opts.taxaNaturezaId, empresaId: conta.empresaId, sistema: true },
        select: { id: true },
      });
      if (!nat) {
        return { erro: { msg: "Natureza da taxa inválida — use uma natureza travada do sistema.", status: 422 }, conta: null };
      }
      taxaNaturezaId = nat.id;
    } else {
      const padrao = await naturezaSistema(tx, conta.empresaId, isReceber ? "taxa-cartao" : "tarifa-bancaria");
      if (!padrao) {
        return { erro: { msg: "Naturezas de encargo do sistema não semeadas nesta empresa.", status: 422 }, conta: null };
      }
      taxaNaturezaId = padrao.id;
    }
  }

  // Teto anti-overpay: o que ainda cabe no título = valorOriginal + juros +
  // multa (acumulados, incluindo os desta baixa) − o que já foi pago.
  const teto = r2(
    totalOriginal
    + parseFloat(conta.valorJuros.toString()) + valorJuros
    + parseFloat(conta.valorMulta.toString()) + valorMulta
    - jaPago,
  );
  if (valorPagoTotal > teto + 0.005) {
    return { erro: { msg: `A baixa de R$ ${valorPagoTotal.toFixed(2)} excede o saldo do título (R$ ${Math.max(0, teto).toFixed(2)}).`, status: 422 }, conta: null };
  }

  // Rateio gerencial por natureza (opcional, só PAGAR): a soma deve bater com o
  // valor do título (classifica a obrigação inteira).
  const naturezasRateio = !isReceber && opts.naturezas ? opts.naturezas : [];
  if (naturezasRateio.length > 0) {
    const somaNat = r2(naturezasRateio.reduce((s, n) => s + n.valor, 0));
    if (Math.abs(somaNat - totalOriginal) > 0.05) {
      return { erro: { msg: `A soma das naturezas (R$ ${somaNat.toFixed(2)}) deve bater com o valor do título (R$ ${totalOriginal.toFixed(2)}).`, status: 422 }, conta: null };
    }
  }

  // Permuta NÃO é forma de baixa unilateral: as duas pernas (CP e CR do mesmo
  // parceiro) liquidam juntas pelo Encontro de Contas com motivo PERMUTA —
  // mesmo lançamento atômico D Fornecedor / C Cliente, sem transitória.
  if (linhas.some((l) => tipoDaForma(l.forma) === "PERMUTA")) {
    return { erro: { msg: "Permuta não é baixa unilateral — quite pelo Encontro de Contas (motivo Permuta), que liquida os dois lados no mesmo lançamento.", status: 422 }, conta: null };
  }

  // Conta de destino/origem efetiva por linha: maquineta → conta da
  // administradora (derivada, nunca escolhida); sentinel "caixa-geral" (ou
  // linha sem conta) cai na conta padrão do título ou no caixa da empresa.
  const linhasComConta = linhas.map((l) => {
    const maq = l.maquinetaId ? maqDe.get(l.maquinetaId) : undefined;
    return {
      ...l,
      taxaLinha: taxaDaLinha(l),
      contaEfetiva: maq
        ? maq.administradora.contaBancariaId
        : l.contaBancariaId && l.contaBancariaId !== "caixa-geral"
          ? l.contaBancariaId
          : (conta.contaBancariaId ?? contaCaixaIdDaEmpresa(conta.empresaId)),
    };
  });
  // Trava: forma eletrônica não pode cair no Caixa em Dinheiro (se há banco).
  // Validada ANTES de qualquer escrita. Linha com maquineta fica de fora: a
  // conta é derivada da administradora, não escolhida.
  const ruim = await formaEletronicaNoCaixa(tx, conta.empresaId,
    linhasComConta.filter((l) => !l.maquinetaId).map((l) => ({ forma: l.forma, contaBancariaId: l.contaEfetiva })));
  if (ruim) {
    const como = isReceber ? "recebida no" : "paga pelo";
    const qual = isReceber ? "destino" : "origem";
    return { erro: { msg: `A forma "${ruim.forma}" não pode ser ${como} Caixa em Dinheiro — selecione a conta bancária de ${qual}.`, status: 422 }, conta: null };
  }

  // Guard otimista: só aplica se status/valorPago não mudaram desde a leitura —
  // a requisição concorrente que perder a corrida cai no count === 0.
  const guardWhere = { id: tituloId, status: conta.status, valorPago: conta.valorPago };
  const guardData = {
    valorPago: totalPago,
    valorMulta: r2(parseFloat(conta.valorMulta.toString()) + valorMulta),
    valorJuros: r2(parseFloat(conta.valorJuros.toString()) + valorJuros),
    ...(valorTaxa > 0.005
      ? { valorTaxa: r2(parseFloat(conta.valorTaxa.toString()) + valorTaxa), taxaNaturezaId }
      : {}),
    dataPagamento: newStatus === "PAGA" ? dataPag : null,
    formaPagamento: formaResumo ?? conta.formaPagamento,
    status: newStatus as "PAGA" | "PARCIAL",
  };
  const aplicado = isReceber
    ? await tx.contaReceber.updateMany({ where: guardWhere, data: guardData })
    : await tx.contaPagar.updateMany({ where: guardWhere, data: guardData });
  if (aplicado.count === 0) {
    return { erro: { msg: "A conta foi baixada por outra operação simultânea — recarregue e confira.", status: 409 }, conta: null };
  }

  // Persiste o rateio por natureza (substitui o anterior). Mantém a coluna única
  // do título na 1ª natureza p/ exibição e o caminho single-natureza coerente.
  if (naturezasRateio.length > 0) {
    await tx.contaPagarNatureza.deleteMany({ where: { contaPagarId: tituloId } });
    await tx.contaPagarNatureza.createMany({
      data: naturezasRateio.map((n) => ({
        contaPagarId: tituloId, naturezaFinanceiraId: n.naturezaFinanceiraId,
        detalhamento: n.detalhamento?.trim() || null, valor: n.valor,
      })),
    });
    await tx.contaPagar.update({ where: { id: tituloId }, data: { naturezaFinanceiraId: naturezasRateio[0].naturezaFinanceiraId } });
  }

  // Um lançamento por forma (cada um na sua conta). Linha de maquineta entra
  // pelo LÍQUIDO (valor − taxa), com maquinetaId (projeção de repasse). Multa/
  // juros entram na 1ª linha sem maquineta (senão na 1ª mesmo).
  const idxExtra = Math.max(0, linhasComConta.findIndex((l) => !l.maquinetaId));
  for (let i = 0; i < linhasComConta.length; i++) {
    const l = linhasComConta[i];
    const extra = i === idxExtra ? valorMulta + valorJuros : 0;
    await tx.lancamentoFinanceiro.create({
      data: {
        empresaId: conta.empresaId,
        tipo: isReceber ? "RECEITA" : "DESPESA",
        descricao: `${isReceber ? "Recebimento" : "Pagamento"} ${conta.numero}${linhas.length > 1 && l.forma ? ` (${l.forma})` : ""}`,
        valor: r2(l.valor - l.taxaLinha + extra),
        dataLancamento: dataPag,
        ...(isReceber ? { contaReceberId: tituloId } : { contaPagarId: tituloId }),
        contaBancariaId: l.contaEfetiva,
        ...(l.maquinetaId ? { maquinetaId: l.maquinetaId } : {}),
        naturezaFinanceiraId: conta.naturezaFinanceiraId ?? undefined,
        centroCustoId: conta.centroCustoId ?? undefined,
      },
    });
  }

  // Mudou o financeiro do pedido vinculado → recomputa o status (na mesma tx).
  if (isReceber && (conta as ContaReceber).pedidoVendaId) {
    await recomputarStatusPedido(tx, (conta as ContaReceber).pedidoVendaId!);
  }
  if (!isReceber && (conta as ContaPagar).pedidoCompraId) {
    await recomputarStatusFinanceiroCompra(tx, (conta as ContaPagar).pedidoCompraId!);
  }

  const atualizado = isReceber
    ? await tx.contaReceber.findUnique({ where: { id: tituloId } })
    : await tx.contaPagar.findUnique({ where: { id: tituloId } });
  return { erro: null, conta: atualizado! };
}
