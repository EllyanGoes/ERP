export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { listarPastasComCaminho } from "@/lib/documentos";

// GET /api/sst/lookups — listas auxiliares dos formulários do módulo.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const [locais, categorias, usuarios, itens, setores, projetos, maquinas] = await Promise.all([
    prisma.localEstoque.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // Pastas do GED com o caminho ("SST › PGR (NR-01)") no nome.
    listarPastasComCaminho({ apenasAtivas: true }).then((ps) => ps.map((p) => ({ id: p.id, nome: p.caminho, slug: p.slug }))),
    prismaSemEscopo.usuario.findMany({ where: { ativo: true, convidado: false }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prismaSemEscopo.item.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, take: 2000, select: { id: true, codigo: true, descricao: true } }),
    prismaSemEscopo.setor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // Projetos em que o usuário participa (p/ criar a tarefa de adequação).
    prismaSemEscopo.projeto.findMany({ where: { status: "ATIVO", OR: [{ donoId: auth.session.sub }, { membros: { some: { usuarioId: auth.session.sub } } }] }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.sstMaquina.findMany({ where: { status: { not: "DESATIVADA" } }, orderBy: { nome: "asc" }, select: { id: true, nome: true, local: true } }),
  ]);
  // Saldo físico próprio da empresa ativa por item (somado entre locais) — o
  // seletor de item do EPI mostra quanto há em estoque.
  const saldos = await prisma.estoqueItem.groupBy({ by: ["itemId"], where: { clienteDonoId: null }, _sum: { quantidadeAtual: true } });
  const porItem = new Map(saldos.map((x) => [x.itemId, Number(x._sum.quantidadeAtual ?? 0)]));
  const itensComSaldo = itens.map((i) => ({ ...i, saldo: porItem.get(i.id) ?? 0 }));
  return NextResponse.json({ data: { locais, categorias, usuarios, itens: itensComSaldo, setores, projetos, maquinas } });
}
