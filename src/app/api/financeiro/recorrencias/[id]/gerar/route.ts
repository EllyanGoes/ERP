export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { generateDocNumber } from "@/lib/utils";
import { avancarData, type Periodicidade } from "@/lib/financeiro";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

// Gera o título (CR ou CP) correspondente à recorrência e avança proximaGeracao.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const rec = await prisma.recorrencia.findUnique({ where: { id: params.id } });
  if (!rec) return NextResponse.json({ error: "Recorrência não encontrada" }, { status: 404 });
  if (!rec.ativo) return NextResponse.json({ error: "Recorrência inativa" }, { status: 400 });

  const vencimento = new Date(rec.proximaGeracao);

  const titulo = await prisma.$transaction(async (tx) => {
    let criado;
    if (rec.tipo === "RECEBER") {
      if (!rec.clienteId) throw new Error("SEM_CLIENTE");
      const seq = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CR" } },
        update: { ultimo: { increment: 1 } },
        create: { prefixo: "CR", ultimo: 1 },
      });
      criado = await tx.contaReceber.create({
        data: {
          numero: generateDocNumber("CR", seq.ultimo),
          clienteId: rec.clienteId,
          descricao: rec.descricao,
          valorOriginal: rec.valor,
          dataVencimento: vencimento,
          categoriaFinanceiraId: rec.categoriaFinanceiraId,
          centroCustoId: rec.centroCustoId,
          contaBancariaId: rec.contaBancariaId,
          recorrenciaId: rec.id,
        },
      });
    } else {
      const seq = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CP" } },
        update: { ultimo: { increment: 1 } },
        create: { prefixo: "CP", ultimo: 1 },
      });
      criado = await tx.contaPagar.create({
        data: {
          numero: generateDocNumber("CP", seq.ultimo),
          fornecedorId: rec.fornecedorId,
          descricao: rec.descricao,
          valorOriginal: rec.valor,
          dataVencimento: vencimento,
          categoriaFinanceiraId: rec.categoriaFinanceiraId,
          centroCustoId: rec.centroCustoId,
          contaBancariaId: rec.contaBancariaId,
          recorrenciaId: rec.id,
        },
      });
    }
    await tx.recorrencia.update({
      where: { id: rec.id },
      data: { proximaGeracao: avancarData(vencimento, rec.periodicidade as Periodicidade) },
    });
    return criado;
  }).catch((e: Error) => {
    if (e.message === "SEM_CLIENTE") return null;
    throw e;
  });

  if (titulo === null) {
    return NextResponse.json({ error: "Recorrência de recebimento precisa de um cliente" }, { status: 400 });
  }
  return NextResponse.json({ data: titulo }, { status: 201 });
}
