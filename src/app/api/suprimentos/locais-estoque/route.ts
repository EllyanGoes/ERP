export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { custosPorEmpresaItem, chaveCustoEmpresa } from "@/lib/custo-empresa";
import { garantirContaContabilLocalEstoque } from "@/lib/conta-contabil";
import { valorUnitarioEstoque } from "@/lib/valor-estoque";
import { decimalToNumber } from "@/lib/utils";
import { CategoriaEstoque } from "@prisma/client";
import { z } from "zod";

const schema = z.object({
  nome:      z.string().min(1),
  descricao: z.string().nullable().optional(),
  filialId:  z.string().min(1, "Filial é obrigatória"),
  ativo:     z.boolean().optional(),
  categoriasAceitas: z.array(z.nativeEnum(CategoriaEstoque)).optional(),
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
          item: { select: { precoCusto: true, categoriaEstoque: true, precoVendaMedio: true, precoVenda: true } },
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
  // Saldo CONTÁBIL de cada local (conta 1.1.3.x vinculada por localEstoqueId) —
  // o "Custo Total" do local passa a refletir exatamente o razão/balancete.
  const localIds = data.map((l) => l.id);
  const contasLocais = localIds.length
    ? await prisma.contaContabil.findMany({ where: { localEstoqueId: { in: localIds } }, select: { id: true, localEstoqueId: true } })
    : [];
  const saldoContabilPorLocal = new Map<string, number>();
  if (contasLocais.length) {
    const partidas = await prisma.partidaContabil.groupBy({
      by: ["contaId", "tipo"],
      where: { contaId: { in: contasLocais.map((c) => c.id) } },
      _sum: { valor: true },
    });
    const saldoPorConta = new Map<string, number>();
    for (const pg of partidas) {
      const v = decimalToNumber(pg._sum.valor ?? 0);
      saldoPorConta.set(pg.contaId, (saldoPorConta.get(pg.contaId) ?? 0) + (pg.tipo === "DEBITO" ? v : -v));
    }
    for (const c of contasLocais) {
      if (c.localEstoqueId) saldoContabilPorLocal.set(c.localEstoqueId, Math.round((saldoPorConta.get(c.id) ?? 0) * 100) / 100);
    }
  }

  const comCusto = data.map((l) => {
    let custoFisico = 0;
    const estoqueItens = l.estoqueItens.map((e) => {
      const proprio = custos.get(chaveCustoEmpresa(l.empresaId, e.itemId));
      // Mesma regra de custeio do motor contábil (valorUnitarioEstoque): custo da
      // empresa quando houver; senão acabado pelo preço médio de venda e demais
      // pelo CMPM global. Mantém a tela de Locais alinhada ao razão/balancete.
      const valorUnit = valorUnitarioEstoque(
        {
          categoriaEstoque: e.item.categoriaEstoque,
          precoVendaMedio: e.item.precoVendaMedio != null ? decimalToNumber(e.item.precoVendaMedio) : null,
          precoVenda: e.item.precoVenda != null ? decimalToNumber(e.item.precoVenda) : null,
          precoCusto: e.item.precoCusto != null ? decimalToNumber(e.item.precoCusto) : null,
        },
        proprio ?? null,
      );
      custoFisico += decimalToNumber(e.quantidadeAtual) * valorUnit;
      return { ...e, item: { ...e.item, precoCusto: valorUnit } };
    });
    return {
      ...l,
      // Custo total FÍSICO = Σ(qtd × valor unitário) — é o valor exibido (o contábil
      // deve seguir o físico; reconciliação em /reconciliar alinha o razão).
      custoFisico: Math.round(custoFisico * 100) / 100,
      // Saldo CONTÁBIL do local (null quando não tem conta) — mantido p/ visibilidade
      // da divergência enquanto não reconciliado.
      custoContabil: saldoContabilPorLocal.has(l.id) ? saldoContabilPorLocal.get(l.id)! : null,
      estoqueItens,
    };
  });
  return NextResponse.json(comCusto);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.localEstoque.create({ data: body.data });
  await garantirContaContabilLocalEstoque(record.id).catch(() => null);
  return NextResponse.json(record, { status: 201 });
}
