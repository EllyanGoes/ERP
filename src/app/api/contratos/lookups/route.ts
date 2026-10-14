export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// GET /api/contratos/lookups — fornecedores, clientes, usuários, centros e naturezas da empresa ativa.
export async function GET() {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const [fornecedores, clientes, usuarios, centros, naturezas, categorias] = await Promise.all([
    prismaSemEscopo.fornecedor.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true } }),
    prismaSemEscopo.cliente.findMany({ where: { status: "ATIVO" }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true } }),
    prismaSemEscopo.usuario.findMany({ where: { ativo: true, convidado: false }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    prisma.naturezaFinanceira.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }], select: { id: true, codigo: true, nome: true, tipo: true } }),
    prismaSemEscopo.documentoCategoria.findMany({ where: { ativo: true, slug: { startsWith: "contratos" } }, orderBy: { ordem: "asc" }, select: { id: true, nome: true, slug: true } }),
  ]);
  return NextResponse.json({ data: { fornecedores, clientes, usuarios, centros, naturezas, categorias } });
}
