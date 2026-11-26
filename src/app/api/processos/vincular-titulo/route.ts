export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { carregarProcesso } from "@/lib/processos";

// POST { tipo: "pagar"|"receber", tituloId, processoId|null } — liga/desliga um título do financeiro
// a um processo externo (editar título no Contas a Pagar/Receber). Só vínculo gerencial: não
// recontabiliza nada. O título é buscado pelo prisma escopado (empresa ativa).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const tituloId = String(b.tituloId ?? "");
  const receber = b.tipo === "receber";
  const titulo = receber
    ? await prisma.contaReceber.findUnique({ where: { id: tituloId }, select: { id: true, empresaId: true } })
    : await prisma.contaPagar.findUnique({ where: { id: tituloId }, select: { id: true, empresaId: true } });
  if (!titulo) return NextResponse.json({ error: "Título não encontrado." }, { status: 404 });
  let processoId: string | null = null;
  if (b.processoId) {
    const p = await carregarProcesso(auth.session, String(b.processoId));
    if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
    if (p.empresaId !== titulo.empresaId) return NextResponse.json({ error: `O processo ${p.codigo} é de outra empresa.` }, { status: 422 });
    processoId = p.id;
  }
  if (receber) await prisma.contaReceber.update({ where: { id: titulo.id }, data: { processoId } });
  else await prisma.contaPagar.update({ where: { id: titulo.id }, data: { processoId } });
  return NextResponse.json({ ok: true });
}
