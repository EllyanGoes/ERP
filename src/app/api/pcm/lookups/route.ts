export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/pcm/lookups — listas de apoio do módulo de Manutenção. Session-only de
// propósito: a Solicitação de Serviço é aberta por QUALQUER usuário (precisa da
// lista de ativos), e SST/PCP/Requisição também escolhem ativo/OS.
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const [ativos, tipos, equipes, catalogo, colaboradores] = await Promise.all([
    prisma.manutAtivo.findMany({
      where: { ativo: true },
      select: { id: true, codApl: true, tag: true, nome: true, paiId: true, tipo: true, status: true, localizacao: true, centroCustoId: true, criticidade: true },
      orderBy: { tag: "asc" },
    }),
    prisma.manutTipo.findMany({ where: { ativo: true }, orderBy: [{ natureza: "asc" }, { nome: "asc" }] }),
    prisma.manutEquipe.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, externa: true, membros: { select: { colaboradorId: true } } } }),
    prisma.manutCatalogo.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, tipo: true, descricao: true } }),
    // usuarioId: sugere o responsável da OS a partir do membro da tarefa (Projetos).
    prisma.colaborador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, usuarioId: true } }),
  ]);
  // Caminho legível na árvore (Área › Equipamento) para a busca do combobox.
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const caminho = (id: string | null): string[] => {
    const out: string[] = [];
    let cur = id ? porId.get(id) : undefined;
    for (let i = 0; cur && i < 12; i++) { out.unshift(cur.nome); cur = cur.paiId ? porId.get(cur.paiId) : undefined; }
    return out;
  };
  return NextResponse.json({
    data: {
      ativos: ativos.map((a) => ({ ...a, caminho: caminho(a.paiId).join(" › ") })),
      tipos, equipes, colaboradores,
      sintomas: catalogo.filter((c) => c.tipo === "SINTOMA"),
      causas: catalogo.filter((c) => c.tipo === "CAUSA"),
      servicos: catalogo.filter((c) => c.tipo === "SERVICO"),
    },
  });
}
