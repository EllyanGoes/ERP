export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { cargoDe, nomeFuncao, sincronizarColaboradores } from "@/lib/sst-funcao";
import { prismaSemEscopo } from "@/lib/prisma";

const INCLUDE = {
  requisitosEpi: { include: { epi: { select: { id: true, nome: true, ca: true } } } },
  requisitosExame: { include: { exameTipo: { select: { id: true, nome: true } } } },
  requisitosTreinamento: { include: { treinamentoTipo: { select: { id: true, nome: true, validadeMeses: true } } } },
  _count: { select: { colaboradores: { where: { fim: null, colaborador: { ativo: true } } } } },
  colaboradores: { where: { fim: null }, select: { colaborador: { select: { id: true, nome: true, ativo: true } } } },
};

// GET /api/sst/funcoes — funções SST da empresa ativa com requisitos.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstFuncao.findMany({ orderBy: { nome: "asc" }, include: INCLUDE });
  return NextResponse.json({ data });
}

type ReqEpi = { epiId: string; obrigatorio?: boolean; quantidade?: number };
type ReqExame = { exameTipoId: string; periodicidadeMeses: number };
function lerRequisitos(b: Record<string, unknown>) {
  const epis: ReqEpi[] = Array.isArray(b.epis) ? (b.epis as ReqEpi[]).filter((e) => e && typeof e.epiId === "string") : [];
  const exames: ReqExame[] = Array.isArray(b.exames) ? (b.exames as ReqExame[]).filter((e) => e && typeof e.exameTipoId === "string" && Number(e.periodicidadeMeses) > 0) : [];
  return { epis, exames };
}

// POST /api/sst/funcoes { cargo, ghe? (ou nome "cargo — GHE"), cbo?, grauRisco?, epis: [{epiId, obrigatorio, quantidade}], exames: [{exameTipoId, periodicidadeMeses}] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  // Nome composto "cargo — GHE" (cargo/ghe separados; nome legado também serve).
  const cargo = String(b.cargo ?? cargoDe(String(b.nome ?? ""))).trim();
  if (!cargo) return NextResponse.json({ error: "Informe o nome da função." }, { status: 400 });
  const ghe = String(b.ghe ?? (b.cargo === undefined ? String(b.nome ?? "").split(" — ")[1] ?? "" : "")).trim() || null;
  const nome = nomeFuncao(cargo, ghe);
  const { epis, exames } = lerRequisitos(b);
  try {
    const funcao = await prisma.sstFuncao.create({
      data: {
        empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
        nome, ghe, cbo: b.cbo?.trim() || null, grauRisco: b.grauRisco ? Number(b.grauRisco) : null,
        requisitosEpi: { create: epis.map((e) => ({ epiId: e.epiId, obrigatorio: e.obrigatorio !== false, quantidade: Math.max(1, Number(e.quantidade) || 1) })) },
        requisitosExame: { create: exames.map((e) => ({ exameTipoId: e.exameTipoId, periodicidadeMeses: Number(e.periodicidadeMeses) })) },
        requisitosTreinamento: { create: (Array.isArray(b.treinamentos) ? (b.treinamentos as { treinamentoTipoId: string }[]).filter((t) => t?.treinamentoTipoId) : []).map((t) => ({ treinamentoTipoId: t.treinamentoTipoId })) },
      },
      include: INCLUDE,
    });
    if (Array.isArray(b.colaboradores) && b.colaboradores.length) {
      await prismaSemEscopo.$transaction((tx) => sincronizarColaboradores(tx, funcao.id, b.colaboradores as string[]));
      const comVinculos = await prisma.sstFuncao.findUnique({ where: { id: funcao.id }, include: INCLUDE });
      return NextResponse.json({ data: comVinculos }, { status: 201 });
    }
    return NextResponse.json({ data: funcao }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "Já existe uma função com esse nome nesta empresa." : "Erro ao criar função";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
