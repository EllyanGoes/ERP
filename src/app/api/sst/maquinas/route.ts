export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

const INCLUDE = { setor: { select: { id: true, nome: true } }, protecoes: { select: { id: true, conforme: true } } };

// GET /api/sst/maquinas — inventário NR-12 da empresa ativa.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstMaquina.findMany({ orderBy: [{ status: "asc" }, { nome: "asc" }], include: INCLUDE });
  return NextResponse.json({ data });
}

// POST { nome, local?, setorId?, codApl?, fabricante?, anoFabricacao?, status?, observacoes? } | { lote: [{nome, local?, codApl?}] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const STATUS = ["NAO_AVALIADA", "NAO_CONFORME", "EM_ADEQUACAO", "CONFORME", "INTERDITADA", "DESATIVADA"];
  const lote: { nome: string; local?: string | null; codApl?: number | null }[] = Array.isArray(b.lote) ? b.lote.filter((m: { nome?: string }) => m?.nome?.trim()) : [];
  if (lote.length > 0) {
    // Importação (Engeman): pula codApl já cadastrado nesta empresa.
    const existentes = new Set((await prisma.sstMaquina.findMany({ where: { codApl: { not: null } }, select: { codApl: true } })).map((m) => m.codApl));
    const novas = lote.filter((m) => !m.codApl || !existentes.has(m.codApl));
    await prisma.sstMaquina.createMany({ data: novas.map((m) => ({ empresaId, nome: m.nome.trim(), local: m.local?.trim() || null, codApl: m.codApl ?? null, criadoPor: auth.session.nome })) });
    return NextResponse.json({ data: { criadas: novas.length, puladas: lote.length - novas.length } }, { status: 201 });
  }
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da máquina." }, { status: 400 });
  const m = await prisma.sstMaquina.create({
    data: {
      empresaId, nome, local: b.local?.trim() || null, setorId: b.setorId || null, codApl: b.codApl ? Number(b.codApl) : null,
      fabricante: b.fabricante?.trim() || null, anoFabricacao: b.anoFabricacao ? Number(b.anoFabricacao) : null,
      status: STATUS.includes(b.status) ? b.status : "NAO_AVALIADA", observacoes: b.observacoes?.trim() || null,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: m }, { status: 201 });
}
