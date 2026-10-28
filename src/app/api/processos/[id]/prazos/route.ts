export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { podeEditar, carregarProcesso } from "@/lib/processos";

type Ctx = { params: { id: string } };

async function ctx(id: string) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return { ok: false as const, res: auth.response };
  if (!(await podeEditar(auth.session))) return { ok: false as const, res: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  const p = await carregarProcesso(auth.session, id);
  if (!p) return { ok: false as const, res: NextResponse.json({ error: "Processo não encontrado." }, { status: 404 }) };
  return { ok: true as const, auth, p };
}

// POST { descricao, vence, avisoDias?, responsavelId? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const c = await ctx(params.id);
  if (!c.ok) return c.res;
  const b = await req.json().catch(() => ({}));
  if (!String(b.descricao ?? "").trim() || !b.vence) return NextResponse.json({ error: "Informe o prazo e a data." }, { status: 400 });
  const pr = await prismaSemEscopo.processoPrazo.create({
    data: { processoId: c.p.id, descricao: String(b.descricao).trim(), vence: new Date(b.vence), avisoDias: Math.max(0, Number(b.avisoDias ?? 5) || 0), responsavelId: b.responsavelId || c.p.responsavelId, criadoPor: c.auth.session.nome },
  });
  return NextResponse.json({ data: pr }, { status: 201 });
}

// PATCH { prazoId, acao: "cumprir" | "dispensar" | "reabrir" | "editar", motivo?, descricao?, vence?, avisoDias? }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const c = await ctx(params.id);
  if (!c.ok) return c.res;
  const b = await req.json().catch(() => ({}));
  const where = { id: String(b.prazoId ?? ""), processoId: c.p.id };
  if (b.acao === "cumprir") await prismaSemEscopo.processoPrazo.updateMany({ where, data: { status: "CUMPRIDO", cumpridoEm: new Date(), motivo: b.motivo?.trim() || null } });
  else if (b.acao === "dispensar") {
    if (!String(b.motivo ?? "").trim()) return NextResponse.json({ error: "Informe o motivo da dispensa." }, { status: 400 });
    await prismaSemEscopo.processoPrazo.updateMany({ where, data: { status: "DISPENSADO", cumpridoEm: new Date(), motivo: String(b.motivo).trim() } });
  } else if (b.acao === "reabrir") await prismaSemEscopo.processoPrazo.updateMany({ where, data: { status: "PENDENTE", cumpridoEm: null, motivo: null } });
  else if (b.acao === "editar") {
    await prismaSemEscopo.processoPrazo.updateMany({
      where,
      data: {
        ...(b.descricao?.trim() ? { descricao: b.descricao.trim() } : {}),
        ...(b.vence ? { vence: new Date(b.vence) } : {}),
        ...(b.avisoDias != null ? { avisoDias: Math.max(0, Number(b.avisoDias) || 0) } : {}),
      },
    });
  } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE ?prazoId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const c = await ctx(params.id);
  if (!c.ok) return c.res;
  await prismaSemEscopo.processoPrazo.deleteMany({ where: { id: req.nextUrl.searchParams.get("prazoId") ?? "", processoId: c.p.id } });
  return NextResponse.json({ ok: true });
}
