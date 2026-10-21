export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { CLINICA_INCLUDE, dadosClinica, salvarPrecosClinica } from "@/lib/sst-agendamento";

// GET /api/sst/clinicas?todas=1 — clínicas de medicina do trabalho da empresa ativa.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const todas = new URL(req.url).searchParams.get("todas") === "1";
  const data = await prisma.sstClinica.findMany({ where: todas ? {} : { ativo: true }, orderBy: { nome: "asc" }, include: CLINICA_INCLUDE });
  return NextResponse.json({ data });
}

// POST /api/sst/clinicas { nome, fornecedorId?, cnpj?, endereco?, telefone?, email?, contato?, observacoes?, precos?: [{exameTipoId, preco}] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const dados = dadosClinica(b);
  if (!dados.nome) return NextResponse.json({ error: "Informe o nome da clínica." }, { status: 400 });
  const data = await prisma.$transaction(async (tx) => {
    const c = await tx.sstClinica.create({ data: { ...dados, nome: dados.nome!, empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID } });
    await salvarPrecosClinica(tx, c.id, b.precos);
    return tx.sstClinica.findUnique({ where: { id: c.id }, include: CLINICA_INCLUDE });
  });
  return NextResponse.json({ data }, { status: 201 });
}
