export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/pcm/ativos/lookups — cadastros usados no formulário do ativo
// (família, setor, centro de custo, imobilizado, fornecedor). Lookup do próprio
// módulo para não depender da permissão de Financeiro/Compras/Contabilidade.
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const [familias, setores, centrosCusto, imobilizados, fornecedores] = await Promise.all([
    prisma.manutFamilia.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.setor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    prisma.imobilizado.findMany({ where: { status: "ATIVO" }, orderBy: { descricao: "asc" }, select: { id: true, descricao: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
  ]);

  return NextResponse.json({ data: { familias, setores, centrosCusto, imobilizados, fornecedores } });
}
