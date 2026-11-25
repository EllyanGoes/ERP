export const dynamic = "force-dynamic";
// Documentos de Entrada candidatos a receber o vínculo de um Contas a Pagar
// manual (espelho do `?semDE=1` dos pedidos de compra): DEs concluídos SEM
// nenhum título vinculado — nem próprio, nem via pedido. Usado pelo modal
// "Vincular a Documento de Entrada" do Contas a Pagar.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const fornecedorId = sp.get("fornecedorId") || null;
  const search = sp.get("search")?.trim() || null;

  const rows = await prisma.conferenciaCompra.findMany({
    where: {
      status: { in: ["CONCLUIDA", "DIVERGENCIA"] },
      contasPagar: { none: {} },
      ...(fornecedorId ? { fornecedorId } : {}),
      // Os dois OR juntos num AND: antes o OR da busca sobrescrevia o filtro
      // "pedido sem título" e entradas já faturadas apareciam como candidatas.
      AND: [
        { OR: [{ pedidoId: null }, { pedido: { contasPagar: { none: {} } } }] },
        ...(search
          ? [{
              OR: [
                { numero: { contains: search, mode: "insensitive" as const } },
                { numeroCompra: { contains: search, mode: "insensitive" as const } },
                { numeroNF: { contains: search, mode: "insensitive" as const } },
                { fornecedor: { razaoSocial: { contains: search, mode: "insensitive" as const } } },
                { fornecedor: { nomeFantasia: { contains: search, mode: "insensitive" as const } } },
              ],
            }]
          : []),
      ],
    },
    select: {
      id: true, numero: true, numeroCompra: true, numeroNF: true, dtEmissao: true, status: true,
      empresaId: true, vrTotal: true,
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      pedido: { select: { numero: true, numeroCompra: true, fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } } } },
      itens: { select: { vlrTotal: true } },
    },
    orderBy: { dtEmissao: "desc" },
    take: 20,
  });

  const num = (d: unknown) => (d == null ? 0 : parseFloat(String(d)) || 0);
  const data = rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    numeroNF: r.numeroNF,
    dtEmissao: r.dtEmissao,
    status: r.status,
    empresaId: r.empresaId,
    fornecedor: r.fornecedor ?? r.pedido?.fornecedor ?? null,
    pedido: r.pedido?.numero ?? null,
    // Número único da compra (o que a tela mostra no lugar do DE-).
    numeroCompra: r.numeroCompra ?? r.pedido?.numeroCompra ?? null,
    valor: Math.round((num(r.vrTotal) || r.itens.reduce((s, i) => s + num(i.vlrTotal), 0)) * 100) / 100,
  }));

  return NextResponse.json({ data });
}
