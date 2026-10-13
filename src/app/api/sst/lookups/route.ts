export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// GET /api/sst/lookups — listas auxiliares dos formulários do módulo.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const [locais, categorias, usuarios, itens, setores, projetos, maquinas] = await Promise.all([
    prisma.localEstoque.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prismaSemEscopo.documentoCategoria.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true, slug: true } }),
    prismaSemEscopo.usuario.findMany({ where: { ativo: true, convidado: false }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prismaSemEscopo.item.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, take: 2000, select: { id: true, codigo: true, descricao: true } }),
    prismaSemEscopo.setor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // Projetos em que o usuário participa (p/ criar a tarefa de adequação).
    prismaSemEscopo.projeto.findMany({ where: { status: "ATIVO", OR: [{ donoId: auth.session.sub }, { membros: { some: { usuarioId: auth.session.sub } } }] }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.sstMaquina.findMany({ where: { status: { not: "DESATIVADA" } }, orderBy: { nome: "asc" }, select: { id: true, nome: true, local: true } }),
  ]);
  return NextResponse.json({ data: { locais, categorias, usuarios, itens, setores, projetos, maquinas } });
}
