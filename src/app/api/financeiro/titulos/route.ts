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
import { generateDocNumber } from "@/lib/utils";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";
import { contabilizarTituloReceber, contabilizarTituloPagar } from "@/lib/contabilidade";
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
  const natPrincipal = f.linhas[0].naturezaFinanceiraId;
  const descricaoTitulo = f.descricao?.trim() || (f.linhas.length === 1 ? (f.linhas[0].detalhamento?.trim() || "Lançamento avulso") : "Lançamento avulso");
  const rateio = f.linhas.length > 1
    ? f.linhas.map((l) => ({ naturezaFinanceiraId: l.naturezaFinanceiraId, detalhamento: l.detalhamento?.trim() || null, valor: Math.round(l.valor * 100) / 100 }))
    : [];

  try {
    const criado = await prisma.$transaction(async (tx) => {
      const numero = generateDocNumber(prefixo, await proximaSequenciaDaEmpresa(empresaId, prefixo));
      if (isReceber) {
        const cr = await tx.contaReceber.create({
          data: {
            empresaId, numero, clienteId, beneficiarioTipo: benTipo, beneficiarioId: benId, descricao: descricaoTitulo,
            valorOriginal: total, valorPago: pago ? total : 0,
            dataVencimento: venc, dataPagamento: pagamento, dataCompetencia: competencia,
            status: pago ? "PAGA" : "ABERTA",
            formaPagamento: f.formaPagamento || null,
            naturezaFinanceiraId: natPrincipal,
            ...(rateio.length ? { naturezas: { create: rateio } } : {}),
          },
        });
        if (pago) {
          await tx.lancamentoFinanceiro.create({
            data: { empresaId, tipo: "RECEITA", descricao: `Recebimento ${numero}`, valor: total, dataLancamento: pagamento!, contaReceberId: cr.id, contaBancariaId: contaBancariaId! },
          });
        }
        return { id: cr.id, numero: cr.numero };
      } else {
        const cp = await tx.contaPagar.create({
          data: {
            empresaId, numero, fornecedorId, beneficiarioTipo: benTipo, beneficiarioId: benId, descricao: descricaoTitulo,
            valorOriginal: total, valorPago: pago ? total : 0,
            dataVencimento: venc, dataPagamento: pagamento, dataCompetencia: competencia,
            status: pago ? "PAGA" : "ABERTA",
            formaPagamento: f.formaPagamento || null,
            naturezaFinanceiraId: natPrincipal,
            ...(rateio.length ? { naturezas: { create: rateio } } : {}),
          },
        });
        if (pago) {
          await tx.lancamentoFinanceiro.create({
            data: { empresaId, tipo: "DESPESA", descricao: `Pagamento ${numero}`, valor: total, dataLancamento: pagamento!, contaPagarId: cp.id, contaBancariaId: contaBancariaId! },
          });
        }
        return { id: cp.id, numero: cp.numero };
      }
    });

    // Contabiliza o título (best-effort, pós-commit) — a natureza/rateio gera as
    // partidas (resultado por natureza + contrapartida ativo/passivo).
    if (isReceber) { await espelharContaReceber(criado.id).catch(() => {}); await contabilizarTituloReceber(criado.id).catch(() => {}); }
    else await contabilizarTituloPagar(criado.id).catch(() => {});

    return NextResponse.json({ data: { numeros: [criado.numero], total: 1 } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar lançamento";
    console.error("[POST /api/financeiro/titulos]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
