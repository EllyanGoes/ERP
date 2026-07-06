export const dynamic = "force-dynamic";

// Seed fiscal da empresa ativa: operações padrão + uma regra GERAL (fallback,
// todas as dimensões null) por operação. A regra geral nasce genérica de
// propósito (CFOP/CST revisáveis com o contador) — o motor nunca chuta: sem
// regra que case, a emissão falha explicitamente.

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const OPERACOES_PADRAO = [
  { codigo: "VENDA", descricao: "Venda de mercadoria", finalidade: 1, tipoOperacao: 1, cfop: "5102", cstIcms: "00" },
  { codigo: "VENDA_PRODUCAO", descricao: "Venda de produção do estabelecimento", finalidade: 1, tipoOperacao: 1, cfop: "5101", cstIcms: "00" },
  { codigo: "DEVOLUCAO_VENDA", descricao: "Devolução de venda", finalidade: 4, tipoOperacao: 0, cfop: "1202", cstIcms: "00" },
  { codigo: "DEVOLUCAO_COMPRA", descricao: "Devolução de compra", finalidade: 4, tipoOperacao: 1, cfop: "5202", cstIcms: "00" },
  { codigo: "REMESSA", descricao: "Remessa de mercadoria", finalidade: 1, tipoOperacao: 1, cfop: "5949", cstIcms: "41" },
  { codigo: "TRANSFERENCIA", descricao: "Transferência de mercadoria", finalidade: 1, tipoOperacao: 1, cfop: "5152", cstIcms: "00" },
  { codigo: "BONIFICACAO", descricao: "Bonificação, doação ou brinde", finalidade: 1, tipoOperacao: 1, cfop: "5910", cstIcms: "00" },
];

export async function POST() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const criadas: string[] = [];
  for (const op of OPERACOES_PADRAO) {
    const existente = await prisma.operacaoFiscal.findFirst({ where: { codigo: op.codigo } });
    if (existente) continue;

    const operacao = await prisma.operacaoFiscal.create({
      data: {
        codigo: op.codigo,
        descricao: op.descricao,
        finalidade: op.finalidade,
        tipoOperacao: op.tipoOperacao,
      },
    });
    // Regra geral (fallback): tudo null = casa com qualquer item/destino.
    await prisma.regraTributacao.create({
      data: {
        operacaoFiscalId: operacao.id,
        cfop: op.cfop,
        cstIcms: op.cstIcms,
        mensagemFiscal: "Regra geral criada pelo seed — revisar CFOP/CST/alíquotas com o contador.",
      },
    });
    criadas.push(op.codigo);
  }

  return NextResponse.json({ criadas, mensagem: criadas.length ? `${criadas.length} operações criadas com regra geral` : "Nada a criar — operações já existem" });
}
