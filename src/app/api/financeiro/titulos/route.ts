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
import { z } from "zod";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  tipo: z.enum(["receber", "pagar"]),
  status: z.enum(["PAGAMENTO", "AGENDAMENTO"]),
  contatoId: z.string().optional().nullable().transform((v) => v || null),
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
  if (isReceber && !f.contatoId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });

  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const pago = f.status === "PAGAMENTO";

  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const venc = dateUTC(f.dataVencimento) ?? dateUTC(hojeSP)!;
  const competencia = dateUTC(f.dataCompetencia);
  const pagamento = pago ? (dateUTC(f.dataPagamento) ?? dateUTC(hojeSP)!) : null;
  const contaBancariaId = pago ? (f.contaBancariaId || contaCaixaIdDaEmpresa(empresaId)) : null;
  const prefixo = isReceber ? "CR" : "CP";

  try {
    const criados = await prisma.$transaction(async (tx) => {
      const out: string[] = [];
      for (const l of f.linhas) {
        const numero = generateDocNumber(prefixo, await proximaSequenciaDaEmpresa(empresaId, prefixo));
        const descricao = [f.descricao?.trim(), l.detalhamento?.trim()].filter(Boolean).join(" — ") || "Lançamento avulso";
        const valor = Math.round(l.valor * 100) / 100;

        if (isReceber) {
          const cr = await tx.contaReceber.create({
            data: {
              empresaId, numero, clienteId: f.contatoId!, descricao,
              valorOriginal: valor, valorPago: pago ? valor : 0,
              dataVencimento: venc, dataPagamento: pagamento, dataCompetencia: competencia,
              status: pago ? "PAGA" : "ABERTA",
              formaPagamento: f.formaPagamento || null,
              naturezaFinanceiraId: l.naturezaFinanceiraId,
            },
          });
          if (pago) {
            await tx.lancamentoFinanceiro.create({
              data: { empresaId, tipo: "RECEITA", descricao: `Recebimento ${numero}`, valor, dataLancamento: pagamento!, contaReceberId: cr.id, contaBancariaId: contaBancariaId! },
            });
          }
          out.push(cr.numero);
        } else {
          const cp = await tx.contaPagar.create({
            data: {
              empresaId, numero, fornecedorId: f.contatoId, descricao,
              valorOriginal: valor, valorPago: pago ? valor : 0,
              dataVencimento: venc, dataPagamento: pagamento, dataCompetencia: competencia,
              status: pago ? "PAGA" : "ABERTA",
              formaPagamento: f.formaPagamento || null,
              naturezaFinanceiraId: l.naturezaFinanceiraId,
            },
          });
          if (pago) {
            await tx.lancamentoFinanceiro.create({
              data: { empresaId, tipo: "DESPESA", descricao: `Pagamento ${numero}`, valor, dataLancamento: pagamento!, contaPagarId: cp.id, contaBancariaId: contaBancariaId! },
            });
          }
          out.push(cp.numero);
        }
      }
      return out;
    });

    return NextResponse.json({ data: { numeros: criados, total: criados.length } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar lançamento";
    console.error("[POST /api/financeiro/titulos]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
