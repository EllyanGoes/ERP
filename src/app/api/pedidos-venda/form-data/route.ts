export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";

// Dados de apoio do formulário de pedido de venda — mesmo shape que a página
// /pedidos-venda/novo busca no servidor. Usado pelo painel lateral de criação
// (CreateDrawer), que roda no client.
export async function GET() {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const [clientes, itens, itensComodatoRaw] = await Promise.all([
    prisma.cliente.findMany({ where: { status: "ATIVO" }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true } }),
    prisma.item.findMany({
      where: { ativo: true, vendavel: true },
      orderBy: { codigo: "asc" },
      select: {
        id: true, codigo: true, descricao: true, precoVenda: true, unidadeMedida: true,
        unidade: { select: { id: true, sigla: true } },
        itemUnidades: {
          select: {
            unidadeId: true, fatorConversao: true,
            unidade: { select: { id: true, sigla: true, nome: true } },
          },
        },
      },
    }),
    prisma.item.findMany({
      where: { comodato: true, ativo: true },
      orderBy: { descricao: "asc" },
      select: { id: true, codigo: true, descricao: true, precoVenda: true },
    }),
  ]);

  const itensComodato = itensComodatoRaw.map((i) => ({
    id: i.id,
    codigo: i.codigo,
    descricao: i.descricao,
    precoVenda: decimalToNumber(i.precoVenda),
  }));

  return NextResponse.json({ data: { clientes, itens, itensComodato } });
}
