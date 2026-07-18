export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTransferencia } from "@/lib/contabilidade";
import { naturezaSistema } from "@/lib/natureza-sistema";
import { contabilizarDespesaCartao } from "../despesa-cartao";

// Repasse da administradora: transferência conta CARTAO (1.1.8.x) → banco
// (mesmo par TRANSFERENCIA do POST /api/financeiro/transferencias, contabilizado
// pós-commit). `valorDiferenca` cobre taxa descontada a maior no repasse —
// vira DESPESA na conta cartão com a natureza travada 'taxa-cartao'
// (D resultado / C 1.1.8.x). Os lançamentos de venda informados são marcados
// como conciliados (somem do "A Receber").

const schema = z.object({
  administradoraId: z.string().min(1, "Administradora é obrigatória"),
  contaDestinoId: z.string().min(1, "Conta de destino é obrigatória"),
  valor: z.coerce.number().min(0.01, "Valor inválido"),
  valorDiferenca: z.coerce.number().min(0).optional().default(0),
  dataLancamento: z.string().min(1, "Data é obrigatória"),
  lancamentoIds: z.array(z.string()).optional().default([]),
});

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const { administradoraId, contaDestinoId, lancamentoIds } = parsed.data;
  const valor = r2(parsed.data.valor);
  const valorDiferenca = r2(parsed.data.valorDiferenca);
  const data = new Date(parsed.data.dataLancamento);

  const admin = await prisma.administradoraCartao.findUnique({
    where: { id: administradoraId },
    select: { id: true, nome: true, empresaId: true, contaBancariaId: true },
  });
  if (!admin) return NextResponse.json({ error: "Administradora não encontrada" }, { status: 404 });

  const destino = await prisma.contaBancaria.findUnique({
    where: { id: contaDestinoId },
    select: { id: true, empresaId: true, tipo: true, compensacao: true, permuta: true },
  });
  if (!destino) return NextResponse.json({ error: "Conta de destino não encontrada" }, { status: 404 });
  if (destino.id === admin.contaBancariaId) {
    return NextResponse.json({ error: "Destino deve ser diferente da conta da administradora." }, { status: 422 });
  }
  // Espelho contábil (D destino / C origem) só balanceia dentro de UMA empresa.
  if (destino.empresaId !== admin.empresaId) {
    return NextResponse.json({ error: "Repasse exige contas da MESMA empresa." }, { status: 422 });
  }
  if (destino.tipo === "CARTAO" || destino.compensacao || destino.permuta) {
    return NextResponse.json({ error: "Destino deve ser uma conta banco/caixa da empresa." }, { status: 422 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Par de transferência — mesmo desenho do POST /financeiro/transferencias:
    // origem negativa (cartão), destino positiva (banco), ligadas por transferenciaParId.
    const descTransf = `Repasse ${admin.nome}`;
    const origem = await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "TRANSFERENCIA", descricao: descTransf, valor: -valor,
        dataLancamento: data, contaBancariaId: admin.contaBancariaId, empresaId: admin.empresaId,
      },
    });
    const destinoLf = await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "TRANSFERENCIA", descricao: descTransf, valor,
        dataLancamento: data, contaBancariaId: destino.id, empresaId: admin.empresaId,
        transferenciaParId: origem.id,
      },
    });
    await tx.lancamentoFinanceiro.update({ where: { id: origem.id }, data: { transferenciaParId: destinoLf.id } });

    // Diferença (taxa descontada a maior): DESPESA na conta cartão, natureza travada.
    let taxaLf: { id: string; naturezaFinanceiraId: string | null } | null = null;
    if (valorDiferenca > 0.005) {
      const nat = await naturezaSistema(tx, admin.empresaId, "taxa-cartao");
      taxaLf = await tx.lancamentoFinanceiro.create({
        data: {
          tipo: "DESPESA", descricao: `Taxa de cartão — repasse ${admin.nome}`, valor: valorDiferenca,
          dataLancamento: data, contaBancariaId: admin.contaBancariaId, empresaId: admin.empresaId,
          naturezaFinanceiraId: nat?.id ?? null, favorecido: admin.nome, conciliado: true,
        },
        select: { id: true, naturezaFinanceiraId: true },
      });
    }

    // Concilia as vendas cobertas pelo repasse (somem do "A Receber").
    if (lancamentoIds.length) {
      await tx.lancamentoFinanceiro.updateMany({
        where: { id: { in: lancamentoIds }, contaBancariaId: admin.contaBancariaId, tipo: "RECEITA" },
        data: { conciliado: true },
      });
    }
    return { origem, destino: destinoLf, taxaLf };
  });

  // Espelhos contábeis pós-commit — best-effort, idempotentes por origem.
  await contabilizarTransferencia(result.origem.id)
    .catch((e) => console.error("[cartoes/repasse] contabilizar transferência:", e));
  if (result.taxaLf) {
    await contabilizarDespesaCartao({
      empresaId: admin.empresaId,
      contaCartaoBancariaId: admin.contaBancariaId,
      naturezaFinanceiraId: result.taxaLf.naturezaFinanceiraId,
      valor: valorDiferenca,
      data,
      historico: `Taxa de cartão — repasse ${admin.nome}`,
      origemId: `repasse-dif-${result.taxaLf.id}`,
    }).catch((e) => console.error("[cartoes/repasse] contabilizar taxa:", e));
  }

  return NextResponse.json({ data: result }, { status: 201 });
}
