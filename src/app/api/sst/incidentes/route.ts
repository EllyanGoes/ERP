export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";

const INCLUDE = {
  setor: { select: { id: true, nome: true } }, maquina: { select: { id: true, nome: true } }, colaborador: { select: { id: true, nome: true } },
  acoes: { orderBy: { createdAt: "asc" as const }, include: { responsavel: { select: { id: true, nome: true } } } },
};
const TIPOS = ["QUASE_ACIDENTE", "ACIDENTE_SEM_AFASTAMENTO", "ACIDENTE_COM_AFASTAMENTO", "TRAJETO", "DOENCA_OCUPACIONAL"];

export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstIncidente.findMany({ orderBy: { data: "desc" }, take: 500, include: INCLUDE });
  return NextResponse.json({ data });
}

// POST { tipo, data, descricao, local?, setorId?, maquinaId?, colaboradorId?, parteCorpo?, agente?, diasAfastamento?, evidencias?: [docId] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva o ocorrido." }, { status: 400 });
  if (!TIPOS.includes(b.tipo)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const numero = generateSimpleDocNumber("INC", await proximaSequenciaDaEmpresa(empresaId, "INC"));
  const i = await prisma.sstIncidente.create({
    data: {
      empresaId, numero, tipo: b.tipo, data: b.data ? new Date(b.data) : new Date(), descricao,
      local: b.local?.trim() || null, setorId: b.setorId || null, maquinaId: b.maquinaId || null, colaboradorId: b.colaboradorId || null,
      parteCorpo: b.parteCorpo?.trim() || null, agente: b.agente?.trim() || null, diasAfastamento: b.diasAfastamento ? Number(b.diasAfastamento) : null,
      evidencias: Array.isArray(b.evidencias) ? b.evidencias.filter((x: unknown) => typeof x === "string") : [],
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: i }, { status: 201 });
}
