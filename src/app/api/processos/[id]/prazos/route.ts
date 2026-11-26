export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { podeEditar, carregarProcesso, dadosPagamentoPrazo, dadosPrazo } from "@/lib/processos";
import { sincronizarPrazosDoTitulo } from "@/lib/processos-prazo-titulo";
import { temFinanceiro } from "@/lib/processos-pagamento";

type Ctx = { params: { id: string } };

async function ctx(id: string) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return { ok: false as const, res: auth.response };
  if (!(await podeEditar(auth.session))) return { ok: false as const, res: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  const p = await carregarProcesso(auth.session, id);
  if (!p) return { ok: false as const, res: NextResponse.json({ error: "Processo não encontrado." }, { status: 404 }) };
  return { ok: true as const, auth, p };
}

// POST { descricao, vence | (inicioContagem, prazoDias, diasUteis?, suspensaoForense?), fundamento?, avisoDias?, responsavelId?,
//        valorPagar?, descontoAte?, valorComDesconto? | descontoPercentual? }  (pagamento/desconto — §8.3)
export async function POST(req: NextRequest, { params }: Ctx) {
  const c = await ctx(params.id);
  if (!c.ok) return c.res;
  const b = await req.json().catch(() => ({}));
  if (!String(b.descricao ?? "").trim()) return NextResponse.json({ error: "Descreva o prazo." }, { status: 400 });
  const tipo = (await prismaSemEscopo.processo.findUnique({ where: { id: c.p.id }, select: { tipo: true } }))?.tipo;
  const dp = dadosPrazo(b, tipo);
  if (!dp.ok) return NextResponse.json({ error: dp.erro }, { status: 400 });
  const pg = dadosPagamentoPrazo(b);
  if (!pg.ok) return NextResponse.json({ error: pg.erro }, { status: 400 });
  const pr = await prismaSemEscopo.processoPrazo.create({
    data: { processoId: c.p.id, descricao: String(b.descricao).trim(), ...dp.data, ...pg.data, avisoDias: Math.max(0, Number(b.avisoDias ?? 5) || 0), responsavelId: b.responsavelId || c.p.responsavelId, criadoPor: c.auth.session.nome },
  });
  return NextResponse.json({ data: pr }, { status: 201 });
}

// PATCH { prazoId, acao: "cumprir" | "dispensar" | "reabrir" | "editar" | "vincular-titulo", motivo?, descricao?, vence?, avisoDias?,
//         valorPagar?, descontoAte?, valorComDesconto?, descontoPercentual?, contaPagarId? (editar/vincular-titulo; null desliga) }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const c = await ctx(params.id);
  if (!c.ok) return c.res;
  const b = await req.json().catch(() => ({}));
  const where = { id: String(b.prazoId ?? ""), processoId: c.p.id };
  if (b.acao === "cumprir") await prismaSemEscopo.processoPrazo.updateMany({ where, data: { status: "CUMPRIDO", cumpridoEm: new Date(), motivo: b.motivo?.trim() || null } });
  else if (b.acao === "dispensar") {
    if (!String(b.motivo ?? "").trim()) return NextResponse.json({ error: "Informe o motivo da dispensa." }, { status: 400 });
    await prismaSemEscopo.processoPrazo.updateMany({ where, data: { status: "DISPENSADO", cumpridoEm: new Date(), motivo: String(b.motivo).trim() } });
  } else if (b.acao === "reabrir") await prismaSemEscopo.processoPrazo.updateMany({ where, data: { status: "PENDENTE", cumpridoEm: null, motivo: null, cumpridoPorPagamento: false } });
  else if (b.acao === "editar" || b.acao === "vincular-titulo") {
    const pg = dadosPagamentoPrazo(b);
    if (!pg.ok) return NextResponse.json({ error: pg.erro }, { status: 400 });
    // Título ligado (§8.3): exige o módulo Financeiro; título a pagar da MESMA empresa do processo.
    let contaPagarId: string | null | undefined;
    if ("contaPagarId" in b) {
      contaPagarId = b.contaPagarId ? String(b.contaPagarId) : null;
      if (!(await temFinanceiro(c.auth.session))) return NextResponse.json({ error: "Ligar título exige acesso ao módulo Financeiro." }, { status: 403 });
      if (contaPagarId) {
        const cp = await prismaSemEscopo.contaPagar.findFirst({ where: { id: contaPagarId, empresaId: c.p.empresaId, status: { not: "CANCELADA" } }, select: { id: true, processoId: true } });
        if (!cp) return NextResponse.json({ error: "Título a pagar não encontrado nesta empresa." }, { status: 404 });
        if (cp.processoId && cp.processoId !== c.p.id) return NextResponse.json({ error: "Este título está ligado a outro processo." }, { status: 422 });
      }
    }
    const n = await prismaSemEscopo.$transaction(async (tx) => {
      const u = await tx.processoPrazo.updateMany({
        where,
        data: {
          ...(b.descricao?.trim() ? { descricao: b.descricao.trim() } : {}),
          ...(b.vence ? { vence: new Date(b.vence) } : {}),
          ...(b.avisoDias != null && b.avisoDias !== "" ? { avisoDias: Math.max(0, Number(b.avisoDias) || 0) } : {}),
          ...pg.data,
          ...(contaPagarId !== undefined ? { contaPagarId } : {}),
        },
      });
      if (u.count && contaPagarId) {
        // Liga também o título ao processo (aba Financeiro) e, se já está quitado, cumpre o prazo.
        await tx.contaPagar.updateMany({ where: { id: contaPagarId, processoId: null }, data: { processoId: c.p.id } });
        await sincronizarPrazosDoTitulo(tx, contaPagarId);
      }
      return u.count;
    });
    if (!n) return NextResponse.json({ error: "Prazo não encontrado." }, { status: 404 });
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
