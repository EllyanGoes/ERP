export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { podeEditar, carregarProcesso } from "@/lib/processos";

type Ctx = { params: { id: string } };

// POST { documentoIds: string[] } — liga documentos já existentes no GED ao processo.
// (Upload novo vai por /api/documentos com processoId.)
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.documentoIds) ? b.documentoIds.map(String) : [];
  const r = await prisma.documento.updateMany({ where: { id: { in: ids } }, data: { processoId: p.id } });
  return NextResponse.json({ ok: true, ligados: r.count });
}

// DELETE ?documentoId= — desfaz o vínculo (o documento continua no GED).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  await prismaSemEscopo.documento.updateMany({ where: { id: req.nextUrl.searchParams.get("documentoId") ?? "", processoId: p.id }, data: { processoId: null } });
  return NextResponse.json({ ok: true });
}
