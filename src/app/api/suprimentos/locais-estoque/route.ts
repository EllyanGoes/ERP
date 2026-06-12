export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { custosPorEmpresaItem, chaveCustoEmpresa } from "@/lib/custo-empresa";
import { z } from "zod";

const schema = z.object({
  nome:      z.string().min(1),
  descricao: z.string().nullable().optional(),
  filialId:  z.string().min(1, "Filial é obrigatória"),
  ativo:     z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filialId = searchParams.get("filialId");
  const ativo    = searchParams.get("ativo");

  const data = await prisma.localEstoque.findMany({
    where: {
      AND: [
        filialId ? { filialId } : {},
        ativo !== null && ativo !== "" ? { ativo: ativo === "true" } : {},
      ],
    },
    orderBy: { nome: "asc" },
    include: {
      filial: { select: { id: true, razaoSocial: true } },
      _count: { select: { estoqueItens: true } },
      estoqueItens: {
        select: {
          itemId: true,
          quantidadeAtual: true,
          item: { select: { precoCusto: true } },
        },
      },
    },
  });

  // Custo por empresa: a valoração de cada local usa o CMPM da empresa dona
  // do local (fallback no CMPM global do Item, que já vem embutido).
  const custos = await custosPorEmpresaItem(
    prisma,
    data.flatMap((l) => l.estoqueItens.map((e) => ({ empresaId: l.empresaId, itemId: e.itemId }))),
  );
  const comCusto = data.map((l) => ({
    ...l,
    estoqueItens: l.estoqueItens.map((e) => {
      const proprio = custos.get(chaveCustoEmpresa(l.empresaId, e.itemId));
      // Estrito por empresa: sem custo próprio → sem custo (não herda o global).
      return { ...e, item: { ...e.item, precoCusto: proprio != null ? proprio : null } };
    }),
  }));
  return NextResponse.json(comCusto);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.localEstoque.create({ data: body.data });
  return NextResponse.json(record, { status: 201 });
}
