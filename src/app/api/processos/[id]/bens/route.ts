export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { carregarProcesso, podeEditar, textoOuNull } from "@/lib/processos";

type Ctx = { params: { id: string } };

// Bens do imobilizado ligados ao processo (fase 2) — ex.: processo fundiário ↔ terreno.
// GET → bens da empresa do processo para o droplist (só descrição/status: nada de valores contábeis).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const data = await prismaSemEscopo.imobilizado.findMany({ where: { empresaId: p.empresaId }, orderBy: { descricao: "asc" }, select: { id: true, descricao: true, status: true } });
  return NextResponse.json({ data });
}

// POST { imobilizadoId, observacao? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const bem = await prismaSemEscopo.imobilizado.findFirst({ where: { id: String(b.imobilizadoId ?? ""), empresaId: p.empresaId }, select: { id: true } });
  if (!bem) return NextResponse.json({ error: "Bem não encontrado nesta empresa." }, { status: 404 });
  await prismaSemEscopo.processoBem.upsert({
    where: { processoId_imobilizadoId: { processoId: p.id, imobilizadoId: bem.id } },
    create: { processoId: p.id, imobilizadoId: bem.id, observacao: textoOuNull(b.observacao) },
    update: { observacao: textoOuNull(b.observacao) },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE ?vinculoId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  await prismaSemEscopo.processoBem.deleteMany({ where: { id: req.nextUrl.searchParams.get("vinculoId") ?? "", processoId: p.id } });
  return NextResponse.json({ ok: true });
}
