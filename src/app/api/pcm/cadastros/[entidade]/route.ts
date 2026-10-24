export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Cadastros de apoio da Manutenção (do GRUPO, sem empresa): tipos de manutenção,
// catálogo técnico (sintoma/causa/serviço), equipes e famílias de ativo.
// GET lista tudo (inclusive inativos); POST cria; PATCH { id, ...campos } edita.
// Sem DELETE: o histórico de OS referencia — desative (ativo=false).

type Ctx = { params: Promise<{ entidade: string }> };

const NATUREZAS = ["CORRETIVA", "PREVENTIVA", "PREDITIVA", "INSPECAO", "LUBRIFICACAO", "MELHORIA", "OUTROS"];
const TIPOS_CATALOGO = ["SINTOMA", "CAUSA", "SERVICO"];

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { entidade } = await params;
  switch (entidade) {
    case "tipos":
      return NextResponse.json({ data: await prisma.manutTipo.findMany({ orderBy: [{ natureza: "asc" }, { sigla: "asc" }], include: { _count: { select: { ordens: true } } } }) });
    case "catalogo":
      return NextResponse.json({ data: await prisma.manutCatalogo.findMany({ orderBy: [{ tipo: "asc" }, { descricao: "asc" }] }) });
    case "equipes":
      return NextResponse.json({
        data: await prisma.manutEquipe.findMany({
          orderBy: { nome: "asc" },
          include: { membros: { select: { colaborador: { select: { id: true, nome: true } } } }, _count: { select: { ordens: true } } },
        }),
      });
    case "familias":
      return NextResponse.json({ data: await prisma.manutFamilia.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { ativos: true } } } }) });
  }
  return NextResponse.json({ error: "Cadastro inexistente." }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { entidade } = await params;
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ data: await salvar(entidade, null, b) }, { status: 201 });
  } catch (e) {
    return erro(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { entidade } = await params;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  try {
    return NextResponse.json({ data: await salvar(entidade, b.id, b) });
  } catch (e) {
    return erro(e);
  }
}

class ErroCadastro extends Error {}

function erro(e: unknown) {
  if (e instanceof ErroCadastro) return NextResponse.json({ error: e.message }, { status: 400 });
  if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Já existe um cadastro com esse código." }, { status: 409 });
  throw e;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function salvar(entidade: string, id: string | null, b: Record<string, unknown>) {
  const ativo = "ativo" in b ? !!b.ativo : undefined;
  switch (entidade) {
    case "tipos": {
      const sigla = texto(b.sigla).toUpperCase();
      const nome = texto(b.nome);
      const natureza = texto(b.natureza);
      if (!id && (!sigla || !nome)) throw new ErroCadastro("Informe sigla e nome.");
      if (natureza && !NATUREZAS.includes(natureza)) throw new ErroCadastro("Natureza inválida.");
      const data = {
        ...(sigla ? { sigla } : {}), ...(nome ? { nome } : {}), ...(natureza ? { natureza } : {}),
        ...("contaComoFalha" in b ? { contaComoFalha: !!b.contaComoFalha } : {}),
        ...(b.prioridade != null && b.prioridade !== "" ? { prioridade: Number(b.prioridade) } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      };
      return id ? prisma.manutTipo.update({ where: { id }, data }) : prisma.manutTipo.create({ data: { natureza: "OUTROS", ...data, sigla, nome } });
    }
    case "catalogo": {
      const descricao = texto(b.descricao);
      const tipo = texto(b.tipo);
      if (!id && (!descricao || !TIPOS_CATALOGO.includes(tipo))) throw new ErroCadastro("Informe o tipo e a descrição.");
      const data = { ...(descricao ? { descricao } : {}), ...(ativo !== undefined ? { ativo } : {}) };
      return id ? prisma.manutCatalogo.update({ where: { id }, data }) : prisma.manutCatalogo.create({ data: { tipo, descricao } });
    }
    case "equipes": {
      const nome = texto(b.nome);
      if (!id && !nome) throw new ErroCadastro("Informe o nome da equipe.");
      const data = {
        ...(nome ? { nome } : {}),
        ...("externa" in b ? { externa: !!b.externa } : {}),
        ...("custoHora" in b ? { custoHora: b.custoHora === "" || b.custoHora == null ? null : Number(b.custoHora) } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      };
      const eq = id ? await prisma.manutEquipe.update({ where: { id }, data }) : await prisma.manutEquipe.create({ data: { ...data, nome } });
      if (Array.isArray(b.membros)) {
        const ids = (b.membros as unknown[]).filter((x): x is string => typeof x === "string");
        await prisma.manutEquipeMembro.deleteMany({ where: { equipeId: eq.id, colaboradorId: { notIn: ids } } });
        await prisma.manutEquipeMembro.createMany({ data: ids.map((colaboradorId) => ({ equipeId: eq.id, colaboradorId })), skipDuplicates: true });
      }
      return eq;
    }
    case "familias": {
      const nome = texto(b.nome);
      if (!id && !nome) throw new ErroCadastro("Informe o nome da família.");
      const data = { ...(nome ? { nome } : {}), ...(ativo !== undefined ? { ativo } : {}) };
      return id ? prisma.manutFamilia.update({ where: { id }, data }) : prisma.manutFamilia.create({ data: { nome } });
    }
  }
  throw new ErroCadastro("Cadastro inexistente.");
}
