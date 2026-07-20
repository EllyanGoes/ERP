export const dynamic = "force-dynamic";
// Criação de "lançamentos" financeiros como TÍTULOS (contas a receber/pagar),
// com rateio (várias categorias = várias parcelas/títulos) e status Pagamento
// (já pago → baixa na conta) ou Agendamento (em aberto). Formato inspirado no
// flow-charted-funds.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa, contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, generateSimpleDocNumber } from "@/lib/utils";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";
import { contabilizarTituloReceber, contabilizarTituloPagar } from "@/lib/contabilidade";
import { garantirContaImpostosRetidos } from "@/lib/conta-contabil";
import { espelharContaReceber } from "@/lib/intragrupo";
import { z } from "zod";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  tipo: z.enum(["receber", "pagar"]),
  status: z.enum(["PAGAMENTO", "AGENDAMENTO"]),
  contatoId: z.string().optional().nullable().transform((v) => v || null),
  beneficiarioTipo: z.enum(["CLIENTE", "FORNECEDOR", "COLABORADOR"]).optional().nullable(),
  beneficiarioId: z.string().optional().nullable().transform((v) => v || null),
  contaBancariaId: z.string().optional().nullable().transform((v) => v || null),
  descricao: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  dataPagamento: DATE.optional().nullable(),
  dataVencimento: DATE.optional().nullable(),
  dataCompetencia: DATE.optional().nullable(),
  dataEmissao: DATE.optional().nullable(),
  // Centro de custo gerencial do título (só saída sem material, quando o destino é
  // despesa/CIF). O razão segue pela natureza; centro é dimensão gerencial do título.
  centroCustoId: z.string().optional().nullable().transform((v) => v || null),
  // Valores detalhados (só status PAGAMENTO): juros/multa pagos além do principal.
  // Mesma convenção da baixa (src/lib/baixa-titulo.ts): valorPago = principal,
  // juros/multa nas colunas próprias e o caixa sai pelo efetivo (principal+j+m) —
  // o motor contábil deriva juros/multa pela fórmula por colunas (Σ caixa − pago).
  valorJuros: z.coerce.number().min(0).optional().default(0),
  valorMulta: z.coerce.number().min(0).optional().default(0),
  // Desconto (pagou/recebeu MENOS e quitou) — vira taxa retida com a natureza
  // travada de Descontos Recebidos/Concedidos. Exclusivo com retenções.
  valorDesconto: z.coerce.number().min(0).optional().default(0),
  // Retenção de impostos na fonte (só status PAGAMENTO): valores por imposto.
  // Pagar: caixa sai pelo líquido, crédito no passivo Impostos Retidos a
  // Recolher e cada imposto gera uma GUIA (CP aberta, natureza Pagamento de X
  // Retido). Receber: recebe o líquido e a retenção vira custo (X Retido sobre
  // a Receita).
  retencoes: z.object({
    iss: z.coerce.number().min(0).optional().default(0),
    irpj: z.coerce.number().min(0).optional().default(0),
    csll: z.coerce.number().min(0).optional().default(0),
    inss: z.coerce.number().min(0).optional().default(0),
    pis: z.coerce.number().min(0).optional().default(0),
    cofins: z.coerce.number().min(0).optional().default(0),
    outras: z.coerce.number().min(0).optional().default(0),
  }).optional(),
  linhas: z.array(z.object({
    naturezaFinanceiraId: z.string().min(1, "Selecione a natureza financeira de cada linha"),
    detalhamento: z.string().optional().nullable(),
    valor: z.coerce.number().positive(),
  })).min(1, "Adicione ao menos uma categoria"),
});

const dateUTC = (s?: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const f = parsed.data;

  const isReceber = f.tipo === "receber";
  // Beneficiário: compat com contatoId antigo. clienteId/fornecedorId (que guiam a
  // contabilização) só são preenchidos quando o tipo bate; COLABORADOR/sem vínculo
  // ficam sem cliente/fornecedor (a natureza define as contas).
  const benTipo = f.beneficiarioTipo ?? (f.contatoId ? (isReceber ? "CLIENTE" : "FORNECEDOR") : null);
  const benId = f.beneficiarioId ?? f.contatoId ?? null;
  const clienteId = isReceber && benTipo === "CLIENTE" ? benId : null;
  const fornecedorId = !isReceber && benTipo === "FORNECEDOR" ? benId : null;

  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const pago = f.status === "PAGAMENTO";

  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const venc = dateUTC(f.dataVencimento) ?? dateUTC(hojeSP)!;
  const competencia = dateUTC(f.dataCompetencia);
  const emissao = dateUTC(f.dataEmissao);
  const pagamento = pago ? (dateUTC(f.dataPagamento) ?? dateUTC(hojeSP)!) : null;
  const contaBancariaId = pago ? (f.contaBancariaId || contaCaixaIdDaEmpresa(empresaId)) : null;
  const prefixo = isReceber ? "CR" : "CP";

  // Trava: título já pago com forma eletrônica não pode cair no Caixa em Dinheiro.
  if (pago && contaBancariaId) {
    const ruim = await formaEletronicaNoCaixa(prisma, empresaId, [{ forma: f.formaPagamento ?? null, contaBancariaId }]);
    if (ruim) {
      const verbo = isReceber ? "recebida" : "paga";
      return NextResponse.json({ error: `A forma "${ruim.forma}" não pode ser ${verbo} pelo Caixa em Dinheiro — selecione a conta bancária.` }, { status: 422 });
    }
  }

  // UM título só; as naturezas viram RATEIO (dimensão gerencial), não títulos
  // separados. valorOriginal = soma das linhas; a 1ª natureza é a "principal"
  // (fallback da contabilização); rateio só quando há 2+ naturezas.
  const total = Math.round(f.linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  // Juros/multa/desconto/retenções só existem num pagamento já realizado; no
  // agendamento nascem zerados e são informados depois, na baixa.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const valorJuros = pago ? r2(f.valorJuros ?? 0) : 0;
  const valorMulta = pago ? r2(f.valorMulta ?? 0) : 0;
  const valorDesconto = pago ? r2(f.valorDesconto ?? 0) : 0;
  const IMPOSTOS = ["iss", "irpj", "csll", "inss", "pis", "cofins", "outras"] as const;
  const retencoes = IMPOSTOS
    .map((k) => ({ imposto: k, valor: pago ? r2(f.retencoes?.[k] ?? 0) : 0 }))
    .filter((x) => x.valor > 0);
  const totalRetido = r2(retencoes.reduce((s, x) => s + x.valor, 0));

  if (valorDesconto > 0 && totalRetido > 0) {
    return NextResponse.json({ error: "Use desconto OU retenção de impostos — não os dois no mesmo lançamento." }, { status: 422 });
  }
  const valorTaxa = r2(valorDesconto + totalRetido); // retido no ato (paga/recebe MENOS e quita)
  if (valorTaxa >= total) {
    return NextResponse.json({ error: "Desconto/retenções não podem ser iguais ou maiores que o total das naturezas." }, { status: 422 });
  }

  // Naturezas travadas que classificam a taxa retida (dimensão) e as guias.
  // Existem só onde o plano padrão foi aplicado (hoje: Cimento e Mix).
  let taxaNaturezaId: string | null = null;
  const guias: { imposto: string; valor: number; naturezaId: string }[] = [];
  if (valorTaxa > 0) {
    const natPorChave = async (chave: string) =>
      (await prisma.naturezaFinanceira.findFirst({ where: { sistemaChave: chave }, select: { id: true } }))?.id ?? null;

    if (valorDesconto > 0) {
      taxaNaturezaId = await natPorChave(isReceber ? "descontos-concedidos" : "descontos-recebidos");
      if (!taxaNaturezaId) {
        return NextResponse.json({ error: `A natureza padrão de Descontos ${isReceber ? "Concedidos" : "Recebidos"} não existe nesta empresa — aplique o plano de naturezas antes.` }, { status: 422 });
      }
    } else {
      const chavePrefixo = isReceber ? "ret-receita-" : "ret-pagto-";
      const porImposto = new Map<string, string>();
      for (const r of retencoes) {
        const id = await natPorChave(`${chavePrefixo}${r.imposto}`);
        if (!id) {
          return NextResponse.json({ error: "As naturezas padrão de retenção de impostos não existem nesta empresa — aplique o plano de naturezas antes." }, { status: 422 });
        }
        porImposto.set(r.imposto, id);
      }
      // Dimensão do título: a natureza do imposto (único) ou "outras" (misto).
      taxaNaturezaId = retencoes.length === 1
        ? porImposto.get(retencoes[0].imposto)!
        : await natPorChave(`${chavePrefixo}outras`);

      // Guias (só PAGAR): um título aberto por imposto, natureza "Pagamento de X Retido".
      if (!isReceber) {
        for (const r of retencoes) {
          const gid = await natPorChave(`pagto-ret-${r.imposto}`);
          if (!gid) {
            return NextResponse.json({ error: "As naturezas padrão de Pagamento de impostos retidos não existem nesta empresa — aplique o plano de naturezas antes." }, { status: 422 });
          }
          guias.push({ imposto: r.imposto.toUpperCase(), valor: r.valor, naturezaId: gid });
        }
      }
    }
  }

  const totalCaixa = r2(total + valorJuros + valorMulta - valorTaxa);

  // Passivo das retenções (as guias liquidam nele) — garantido fora da transação.
  const contaPassivoRetencaoId = guias.length > 0
    ? ((await garantirContaImpostosRetidos(empresaId))?.id ?? null)
    : null;
  const natPrincipal = f.linhas[0].naturezaFinanceiraId;
  const descricaoTitulo = f.descricao?.trim() || (f.linhas.length === 1 ? (f.linhas[0].detalhamento?.trim() || "Lançamento avulso") : "Lançamento avulso");
  const rateio = f.linhas.length > 1
    ? f.linhas.map((l) => ({ naturezaFinanceiraId: l.naturezaFinanceiraId, detalhamento: l.detalhamento?.trim() || null, valor: Math.round(l.valor * 100) / 100 }))
    : [];

  try {
    const criado = await prisma.$transaction(async (tx) => {
      // CP é numerado sem o ano (CP-0110); CR mantém o formato com ano.
      const numero = (isReceber ? generateDocNumber : generateSimpleDocNumber)(prefixo, await proximaSequenciaDaEmpresa(empresaId, prefixo));
      if (isReceber) {
        const cr = await tx.contaReceber.create({
          data: {
            empresaId, numero, clienteId, beneficiarioTipo: benTipo, beneficiarioId: benId, descricao: descricaoTitulo,
            valorOriginal: total, valorPago: pago ? total : 0,
            valorJuros, valorMulta,
            ...(valorTaxa > 0 ? { valorTaxa, taxaNaturezaId } : {}),
            dataVencimento: venc, dataPagamento: pagamento, dataCompetencia: competencia, dataEmissao: emissao,
            status: pago ? "PAGA" : "ABERTA",
            formaPagamento: f.formaPagamento || null,
            naturezaFinanceiraId: natPrincipal,
            ...(rateio.length ? { naturezas: { create: rateio } } : {}),
          },
        });
        if (pago) {
          await tx.lancamentoFinanceiro.create({
            data: { empresaId, tipo: "RECEITA", descricao: `Recebimento ${numero}`, valor: totalCaixa, dataLancamento: pagamento!, contaReceberId: cr.id, contaBancariaId: contaBancariaId! },
          });
        }
        return { id: cr.id, numero: cr.numero };
      } else {
        const cp = await tx.contaPagar.create({
          data: {
            empresaId, numero, fornecedorId, beneficiarioTipo: benTipo, beneficiarioId: benId, descricao: descricaoTitulo,
            valorOriginal: total, valorPago: pago ? total : 0,
            valorJuros, valorMulta,
            ...(valorTaxa > 0 ? { valorTaxa, taxaNaturezaId } : {}),
            dataVencimento: venc, dataPagamento: pagamento, dataCompetencia: competencia, dataEmissao: emissao,
            status: pago ? "PAGA" : "ABERTA",
            formaPagamento: f.formaPagamento || null,
            naturezaFinanceiraId: natPrincipal,
            centroCustoId: f.centroCustoId,
            ...(rateio.length ? { naturezas: { create: rateio } } : {}),
          },
        });
        if (pago) {
          await tx.lancamentoFinanceiro.create({
            data: { empresaId, tipo: "DESPESA", descricao: `Pagamento ${numero}`, valor: totalCaixa, dataLancamento: pagamento!, contaPagarId: cp.id, contaBancariaId: contaBancariaId! },
          });
        }

        // GUIAS das retenções: um título ABERTO por imposto retido, sem provisão
        // (a obrigação já nasceu como crédito no passivo Impostos Retidos a
        // Recolher no pagamento acima) — a baixa da guia debita esse passivo.
        // Vencimento: dia 20 do mês seguinte ao pagamento (editável no título).
        if (guias.length > 0) {
          const base = pagamento ?? venc;
          const vencGuia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 20));
          for (const g of guias) {
            const numeroGuia = generateSimpleDocNumber("CP", await proximaSequenciaDaEmpresa(empresaId, "CP"));
            await tx.contaPagar.create({
              data: {
                empresaId, numero: numeroGuia,
                descricao: `${g.imposto} retido — ${descricaoTitulo} (${numero})`,
                valorOriginal: g.valor, valorPago: 0, status: "ABERTA",
                dataVencimento: vencGuia, dataCompetencia: competencia,
                naturezaFinanceiraId: g.naturezaId,
                semProvisao: true,
                contaPassivoId: contaPassivoRetencaoId,
              },
            });
          }
        }
        return { id: cp.id, numero: cp.numero };
      }
    });

    // Contabiliza o título (best-effort, pós-commit) — a natureza/rateio gera as
    // partidas (resultado por natureza + contrapartida ativo/passivo).
    if (isReceber) { await espelharContaReceber(criado.id).catch((e) => console.error("[financeiro/titulos] espelhar intragrupo:", e)); await contabilizarTituloReceber(criado.id).catch((e) => console.error("[financeiro/titulos] contabilizar:", e)); }
    else await contabilizarTituloPagar(criado.id).catch((e) => console.error("[financeiro/titulos] contabilizar:", e));

    return NextResponse.json({ data: { numeros: [criado.numero], total: 1 } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar lançamento";
    console.error("[POST /api/financeiro/titulos]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
