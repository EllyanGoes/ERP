export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]).optional(),
  razaoSocial: z.string().min(1).optional(),
  nomeFantasia: z.string().optional(),
  cpfCnpj: z.string().optional().nullable(),
  ie: z.string().optional(),
  email: z.string().optional(),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  contato: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  ativo: z.boolean().optional(),
  observacoes: z.string().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.fornecedor.findUnique({
    where: { id: params.id },
    include: {
      produtos: { include: { item: { select: { codigo: true, descricao: true } } } },
      pedidosCompra: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const data = { ...body.data, ...(body.data.cpfCnpj !== undefined ? { cpfCnpj: body.data.cpfCnpj?.trim() || null } : {}) };
  try {
    const record = await prisma.fornecedor.update({ where: { id: params.id }, data });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "CPF/CNPJ já cadastrado por outro fornecedor" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  // Block deletion if supplier has purchase orders or quotations
  const [pedidos, cotacoes] = await Promise.all([
    prisma.pedidoCompra.count({ where: { fornecedorId: params.id } }),
    prisma.cotacaoFornecedor.count({ where: { fornecedorId: params.id } }),
  ]);
  if (pedidos > 0 || cotacoes > 0) {
    const parts = [];
    if (pedidos > 0) parts.push(`${pedidos} pedido(s) de compra`);
    if (cotacoes > 0) parts.push(`${cotacoes} cotação(ões)`);
    return NextResponse.json(
      { error: `Não é possível excluir: fornecedor possui ${parts.join(" e ")} vinculado(s).` },
      { status: 409 }
    );
  }
  // Remove product links first, then delete
  await prisma.$transaction([
    prisma.produtoFornecedor.deleteMany({ where: { fornecedorId: params.id } }),
    prisma.fornecedor.delete({ where: { id: params.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
