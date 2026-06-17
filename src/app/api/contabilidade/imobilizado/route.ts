export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { garantirContaImobilizadoBem, garantirContasImobilizado } from "@/lib/conta-contabil";
import { z } from "zod";

const schema = z.object({
  descricao: z.string().min(1, "Descrição é obrigatória"),
  dataAquisicao: z.string().min(1, "Data de aquisição é obrigatória"),
  valorAquisicao: z.coerce.number().positive("Valor deve ser positivo"),
  valorResidual: z.coerce.number().min(0).optional().default(0),
  vidaUtilMeses: z.coerce.number().int().positive("Vida útil deve ser positiva"),
  observacoes: z.string().optional().nullable(),
});

// GET → lista de bens com depreciação acumulada e conta vinculada.
export async function GET() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const bens = await prisma.imobilizado.findMany({
    orderBy: { createdAt: "desc" },
    include: { depreciacoes: { select: { valor: true } } },
  });
  const data = bens.map((b) => {
    const acumulado = b.depreciacoes.reduce((s, d) => s + Number(d.valor), 0);
    const valorContabil = Number(b.valorAquisicao) - acumulado;
    return {
      ...b,
      depreciacoes: undefined,
      depreciacaoAcumulada: acumulado,
      valorContabil,
    };
  });
  return NextResponse.json({ data });
}

// POST → cadastra um bem e cria sua analítica sob 1.2.1, vinculando as contas.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().formErrors[0] ?? "Dados inválidos" }, { status: 400 });
  }
  const d = parsed.data;

  const bem = await prisma.imobilizado.create({
    data: {
      descricao: d.descricao,
      dataAquisicao: new Date(d.dataAquisicao),
      valorAquisicao: d.valorAquisicao,
      valorResidual: d.valorResidual ?? 0,
      vidaUtilMeses: d.vidaUtilMeses,
      observacoes: d.observacoes?.trim() || null,
    },
  });

  // Cria a analítica do bem (1.2.1.NNNN) e resolve as contas compartilhadas.
  const [contaBem, compart] = await Promise.all([
    garantirContaImobilizadoBem(bem.empresaId, d.descricao).catch(() => null),
    garantirContasImobilizado(bem.empresaId).catch(() => ({ deprAcumId: null, despesaId: null })),
  ]);
  const atualizado = await prisma.imobilizado.update({
    where: { id: bem.id },
    data: {
      contaAtivoId: contaBem?.id ?? null,
      contaDepreciacaoAcumuladaId: compart.deprAcumId,
      contaDespesaId: compart.despesaId,
    },
  });

  return NextResponse.json({ data: atualizado }, { status: 201 });
}
