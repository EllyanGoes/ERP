export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

// CRM guardado só com dígitos/letras, maiúsculo — "52.123-4" e "521234" são o mesmo.
const normCrm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// GET /api/sst/medicos?todos=1 — médicos examinadores da empresa ativa.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const todos = new URL(req.url).searchParams.get("todos") === "1";
  const data = await prisma.sstMedico.findMany({
    where: todos ? {} : { ativo: true },
    orderBy: { nome: "asc" },
    include: { _count: { select: { asos: true } } },
  });
  return NextResponse.json({ data });
}

// POST /api/sst/medicos { nome, crm, uf?, especialidade? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  const crm = normCrm(b.crm);
  if (!nome) return NextResponse.json({ error: "Informe o nome do médico." }, { status: 400 });
  if (!crm) return NextResponse.json({ error: "Informe o CRM." }, { status: 400 });
  const existente = await prisma.sstMedico.findFirst({ where: { crm } });
  if (existente) return NextResponse.json({ error: `CRM ${crm} já cadastrado (${existente.nome}).`, data: existente }, { status: 409 });
  const data = await prisma.sstMedico.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      nome, crm, uf: String(b.uf ?? "").trim().toUpperCase().slice(0, 2) || null,
      especialidade: String(b.especialidade ?? "").trim() || null,
    },
  });
  return NextResponse.json({ data }, { status: 201 });
}
