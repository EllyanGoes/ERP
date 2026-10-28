export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { PAPEIS_PARTE, podeEditar, textoOuNull, carregarProcesso } from "@/lib/processos";

type Ctx = { params: { id: string } };

// POST { papel, nome, documento?, contato? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (!String(b.nome ?? "").trim()) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  const parte = await prismaSemEscopo.processoParte.create({
    data: { processoId: p.id, papel: PAPEIS_PARTE[String(b.papel)] ? String(b.papel) : "OUTRO", nome: String(b.nome).trim(), documento: textoOuNull(b.documento), contato: textoOuNull(b.contato) },
  });
  return NextResponse.json({ data: parte }, { status: 201 });
}

// DELETE ?parteId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  await prismaSemEscopo.processoParte.deleteMany({ where: { id: req.nextUrl.searchParams.get("parteId") ?? "", processoId: p.id } });
  return NextResponse.json({ ok: true });
}
