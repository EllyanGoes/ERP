export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// Lookups do formulário de documento (só id+nome; exige o módulo documentos).
export async function GET() {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;

  const [usuarios, fornecedores, clientes, colaboradores, imobilizados] = await Promise.all([
    prismaSemEscopo.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prismaSemEscopo.fornecedor.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
    prismaSemEscopo.cliente.findMany({ select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
    prismaSemEscopo.colaborador.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.imobilizado.findMany({ where: { status: "ATIVO" }, select: { id: true, descricao: true }, orderBy: { descricao: "asc" } }),
  ]);

  return NextResponse.json({
    data: {
      usuarios,
      fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nomeFantasia || f.razaoSocial })),
      clientes: clientes.map((c) => ({ id: c.id, nome: c.nomeFantasia || c.razaoSocial })),
      colaboradores,
      imobilizados: imobilizados.map((i) => ({ id: i.id, nome: i.descricao })),
    },
  });
}
