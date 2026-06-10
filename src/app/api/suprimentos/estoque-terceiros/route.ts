export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// ── GET — saldos e movimentações de mercadoria de terceiros sob guarda ───────
export async function GET() {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const [saldos, movimentacoes] = await Promise.all([
    prisma.estoqueItem.findMany({
      where: { clienteDonoId: { not: null } },
      include: {
        item:         { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
        localEstoque: { select: { id: true, nome: true } },
        clienteDono:  { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.movimentacaoEstoque.findMany({
      where: { clienteDonoId: { not: null } },
      include: {
        item:         { select: { id: true, codigo: true, descricao: true } },
        localEstoque: { select: { id: true, nome: true } },
        clienteDono:  { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        lote:         { select: { numero: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return NextResponse.json({ data: { saldos, movimentacoes } });
}
