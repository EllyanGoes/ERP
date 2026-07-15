export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { generateDocNumber, generateSimpleDocNumber } from "@/lib/utils";
import { avancarData, type Periodicidade } from "@/lib/financeiro";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { contabilizarTituloReceber, contabilizarTituloPagar } from "@/lib/contabilidade";

// Gera o título (CR ou CP) correspondente à recorrência e avança proximaGeracao.
// Concorrência: o CLAIM é um updateMany condicionado à proximaGeracao lida — dois
// cliques simultâneos não geram o título duas vezes (quem perde cai no count === 0).
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const rec = await prisma.recorrencia.findUnique({ where: { id: params.id } });
  if (!rec) return NextResponse.json({ error: "Recorrência não encontrada" }, { status: 404 });
  if (!rec.ativo) return NextResponse.json({ error: "Recorrência inativa" }, { status: 400 });
  if (rec.tipo === "RECEBER" && !rec.clienteId) {
    return NextResponse.json({ error: "Recorrência de recebimento precisa de um cliente" }, { status: 400 });
  }

  const vencimento = new Date(rec.proximaGeracao);

  const titulo = await prisma.$transaction(async (tx) => {
    // CLAIM atômico contra dupla geração: só avança se a proximaGeracao ainda é a
    // que lemos — a requisição concorrente que perder a corrida cai no count === 0.
    const claim = await tx.recorrencia.updateMany({
      where: { id: rec.id, proximaGeracao: rec.proximaGeracao },
      data: { proximaGeracao: avancarData(vencimento, rec.periodicidade as Periodicidade) },
    });
    if (claim.count === 0) throw new Error("JA_GERADA");

    if (rec.tipo === "RECEBER") {
      const seq = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CR" } },
        update: { ultimo: { increment: 1 } },
        create: { prefixo: "CR", ultimo: 1 },
      });
      return tx.contaReceber.create({
        data: {
          numero: generateDocNumber("CR", seq.ultimo),
          clienteId: rec.clienteId,
          descricao: rec.descricao,
          valorOriginal: rec.valor,
          dataVencimento: vencimento,
          naturezaFinanceiraId: rec.naturezaFinanceiraId,
          centroCustoId: rec.centroCustoId,
          contaBancariaId: rec.contaBancariaId,
          recorrenciaId: rec.id,
        },
      });
    }
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "CP" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "CP", ultimo: 1 },
    });
    return tx.contaPagar.create({
      data: {
        numero: generateSimpleDocNumber("CP", seq.ultimo),
        fornecedorId: rec.fornecedorId,
        descricao: rec.descricao,
        valorOriginal: rec.valor,
        dataVencimento: vencimento,
        naturezaFinanceiraId: rec.naturezaFinanceiraId,
        centroCustoId: rec.centroCustoId,
        contaBancariaId: rec.contaBancariaId,
        recorrenciaId: rec.id,
      },
    });
  }).catch((e: Error) => {
    if (e.message === "JA_GERADA") return null;
    throw e;
  });

  if (titulo === null) {
    return NextResponse.json({ error: "Este título já foi gerado por outra operação simultânea." }, { status: 409 });
  }

  // Contabiliza o título recém-criado (best-effort, pós-commit).
  if (rec.tipo === "RECEBER") await contabilizarTituloReceber(titulo.id).catch((e) => console.error("[recorrencias/gerar] contabilizar:", e));
  else await contabilizarTituloPagar(titulo.id).catch((e) => console.error("[recorrencias/gerar] contabilizar:", e));

  return NextResponse.json({ data: titulo }, { status: 201 });
}
