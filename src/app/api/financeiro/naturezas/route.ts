export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { requireSession } from "@/lib/auth";
import { garantirContaContabilNatureza, vincularNaturezaConta } from "@/lib/conta-contabil";
import { z } from "zod";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;

const schema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  grupo: z.enum(GRUPOS),
  subgrupoId: z.string().optional().nullable().transform((v) => v || null),
  contaContabilId: z.string().optional().nullable().transform((v) => v || null),
  ativo: z.boolean().optional(),
});

// GET /api/financeiro/naturezas?tipo=ENTRADA|SAIDA&ativo=1
// Lista de referência (seletor de natureza no Pedido de Venda, Doc. de Entrada
// e lançamentos): basta estar autenticado — usada por vendedores que não têm o
// módulo financeiro. A criação (POST) continua restrita ao módulo financeiro.
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const somenteAtivas = searchParams.get("ativo") === "1";

  const data = await prisma.naturezaFinanceira.findMany({
    where: {
      ...(tipo === "ENTRADA" || tipo === "SAIDA" ? { tipo } : {}),
      ...(somenteAtivas ? { ativo: true } : {}),
    },
    include: {
      subgrupo: { select: { id: true, nome: true } },
      contasContabeis: { select: { id: true, codigo: true, nome: true } },
    },
    orderBy: [{ tipo: "asc" }, { grupo: "asc" }, { nome: "asc" }],
  });
  // Vínculo contábil: a conta de resultado ligada à natureza (1 por empresa).
  const naturezas = data.map(({ contasContabeis, ...n }) => ({
    ...n,
    contaContabilId: contasContabeis[0]?.id ?? null,
    contaContabil: contasContabeis[0] ?? null,
  }));

  // Contas de resultado (analíticas ativas) p/ o seletor do cadastro de natureza.
  const contasResultado = searchParams.get("comContas") === "1"
    ? await prisma.contaContabil.findMany({
        where: { grupo: "RESULTADO", tipo: "ANALITICA", ativo: true },
        select: { id: true, codigo: true, nome: true },
        orderBy: { codigo: "asc" },
      })
    : undefined;

  return NextResponse.json({ data: naturezas, contasResultado });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });

  const { contaContabilId, ...natData } = parsed.data;
  const data = await prisma.naturezaFinanceira.create({ data: natData });
  if (contaContabilId) await vincularNaturezaConta(data.empresaId, data.id, contaContabilId).catch(() => null);
  else await garantirContaContabilNatureza(data.id).catch(() => null);
  return NextResponse.json({ data }, { status: 201 });
}
