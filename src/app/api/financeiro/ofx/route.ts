export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ofxImportarSchema } from "@/lib/validations/financeiro";
import { parseOFX } from "@/lib/ofx";

export async function GET() {
  const data = await prisma.importacaoOFX.findMany({
    include: {
      contaBancaria: { select: { id: true, nome: true } },
      _count: { select: { linhas: true } },
    },
    orderBy: { dataImportacao: "desc" },
  });
  return NextResponse.json({ data });
}

// Importa um extrato OFX: faz o parse e grava as linhas. Ignora linhas com FITID
// já importado anteriormente para a mesma conta (evita duplicar transações).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = ofxImportarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const conta = await prisma.contaBancaria.findUnique({ where: { id: parsed.data.contaBancariaId } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const transacoes = parseOFX(parsed.data.conteudo);
  if (transacoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma transação encontrada no arquivo OFX" }, { status: 400 });
  }

  // FITIDs já importados nesta conta (qualquer importação anterior).
  const fitIds = transacoes.map((t) => t.fitId).filter((f): f is string => !!f);
  const existentes = fitIds.length
    ? await prisma.linhaOFX.findMany({
        where: { fitId: { in: fitIds }, importacao: { contaBancariaId: conta.id } },
        select: { fitId: true },
      })
    : [];
  const jaImportados = new Set(existentes.map((e) => e.fitId));
  const novas = transacoes.filter((t) => !t.fitId || !jaImportados.has(t.fitId));

  const importacao = await prisma.importacaoOFX.create({
    data: {
      contaBancariaId: conta.id,
      nomeArquivo: parsed.data.nomeArquivo || null,
      totalLinhas: novas.length,
      linhas: {
        create: novas.map((t) => ({
          fitId: t.fitId,
          data: t.data,
          valor: t.valor,
          descricao: t.descricao,
        })),
      },
    },
    include: { _count: { select: { linhas: true } } },
  });

  return NextResponse.json(
    { data: importacao, ignoradas: transacoes.length - novas.length },
    { status: 201 },
  );
}
