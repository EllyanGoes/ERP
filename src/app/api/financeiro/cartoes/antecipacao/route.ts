export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTransferencia } from "@/lib/contabilidade";
import { naturezaSistema } from "@/lib/natureza-sistema";
import { contabilizarDespesaCartao } from "../despesa-cartao";

// Antecipação de recebíveis: a administradora deposita o LÍQUIDO (bruto − deságio)
// antes do prazo. Transferência cartão→banco pelo líquido + DESPESA do deságio na
// conta cartão (natureza travada 'desagio-antecipacao'). Resultado contábil:
//   D Banco (líquido) + D Deságio (resultado)  /  C Cartões a Receber (bruto).

const schema = z.object({
  administradoraId: z.string().min(1, "Administradora é obrigatória"),
  contaDestinoId: z.string().min(1, "Conta de destino é obrigatória"),
  valorBruto: z.coerce.number().min(0.01, "Valor bruto inválido"),
  valorDesagio: z.coerce.number().min(0, "Deságio inválido"),
  dataLancamento: z.string().min(1, "Data é obrigatória"),
});

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const { administradoraId, contaDestinoId } = parsed.data;
  const valorBruto = r2(parsed.data.valorBruto);
  const valorDesagio = r2(parsed.data.valorDesagio);
  const valorLiquido = r2(valorBruto - valorDesagio);
  const data = new Date(parsed.data.dataLancamento);

  if (valorLiquido <= 0) {
    return NextResponse.json({ error: "Deságio deve ser menor que o valor bruto." }, { status: 422 });
  }

  const admin = await prisma.administradoraCartao.findUnique({
    where: { id: administradoraId },
    select: { id: true, nome: true, empresaId: true, contaBancariaId: true },
  });
  if (!admin) return NextResponse.json({ error: "Administradora não encontrada" }, { status: 404 });

  const destino = await prisma.contaBancaria.findUnique({
    where: { id: contaDestinoId },
    select: { id: true, empresaId: true, tipo: true, compensacao: true },
  });
  if (!destino) return NextResponse.json({ error: "Conta de destino não encontrada" }, { status: 404 });
  if (destino.id === admin.contaBancariaId) {
    return NextResponse.json({ error: "Destino deve ser diferente da conta da administradora." }, { status: 422 });
  }
  if (destino.empresaId !== admin.empresaId) {
    return NextResponse.json({ error: "Antecipação exige contas da MESMA empresa." }, { status: 422 });
  }
  if (destino.tipo === "CARTAO" || destino.compensacao) {
    return NextResponse.json({ error: "Destino deve ser uma conta banco/caixa da empresa." }, { status: 422 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Par de transferência pelo LÍQUIDO (mesmo desenho do POST /financeiro/transferencias).
    const descTransf = `Antecipação ${admin.nome}`;
    const origem = await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "TRANSFERENCIA", descricao: descTransf, valor: -valorLiquido,
        dataLancamento: data, contaBancariaId: admin.contaBancariaId, empresaId: admin.empresaId,
      },
    });
    const destinoLf = await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "TRANSFERENCIA", descricao: descTransf, valor: valorLiquido,
        dataLancamento: data, contaBancariaId: destino.id, empresaId: admin.empresaId,
        transferenciaParId: origem.id,
      },
    });
    await tx.lancamentoFinanceiro.update({ where: { id: origem.id }, data: { transferenciaParId: destinoLf.id } });

    // Deságio: DESPESA na conta cartão — junto com o líquido, baixa o BRUTO do 1.1.8.x.
    let desagioLf: { id: string; naturezaFinanceiraId: string | null } | null = null;
    if (valorDesagio > 0.005) {
      const nat = await naturezaSistema(tx, admin.empresaId, "desagio-antecipacao");
      desagioLf = await tx.lancamentoFinanceiro.create({
        data: {
          tipo: "DESPESA", descricao: `Deságio antecipação — ${admin.nome}`, valor: valorDesagio,
          dataLancamento: data, contaBancariaId: admin.contaBancariaId, empresaId: admin.empresaId,
          naturezaFinanceiraId: nat?.id ?? null, favorecido: admin.nome, conciliado: true,
        },
        select: { id: true, naturezaFinanceiraId: true },
      });
    }
    return { origem, destino: destinoLf, desagioLf };
  });

  // Espelhos contábeis pós-commit — best-effort, idempotentes por origem.
  await contabilizarTransferencia(result.origem.id)
    .catch((e) => console.error("[cartoes/antecipacao] contabilizar transferência:", e));
  if (result.desagioLf) {
    await contabilizarDespesaCartao({
      empresaId: admin.empresaId,
      contaCartaoBancariaId: admin.contaBancariaId,
      naturezaFinanceiraId: result.desagioLf.naturezaFinanceiraId,
      valor: valorDesagio,
      data,
      historico: `Deságio antecipação — ${admin.nome}`,
      origemId: `antecipacao-desagio-${result.desagioLf.id}`,
    }).catch((e) => console.error("[cartoes/antecipacao] contabilizar deságio:", e));
  }

  return NextResponse.json({ data: result }, { status: 201 });
}
