export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { contextoFinanceiroProcesso as contexto, depositosDoProcesso, ehDeposito } from "@/lib/processos-pagamento";

type Ctx = { params: { id: string } };

// Financeiro do processo (fase 2): títulos a pagar (custas, honorários, multas, depósitos) e a
// receber (restituição, indenização, levantamento de depósito) ligados por processoId.
// O vínculo é gerencial — a contabilização segue a natureza do título; o depósito judicial
// (natureza travada "deposito-judicial") é ATIVO e tem saldo/destinos (§8.3).
// Ver exige o módulo Processos (com visibilidade do processo) E o Financeiro; ligar/desligar, + editar processos.

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const SELECT_CP = {
  id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true, status: true, dataVencimento: true, dataPagamento: true, empresaId: true,
  fornecedor: { select: { razaoSocial: true } }, naturezaFinanceira: { select: { codigo: true, nome: true, sistemaChave: true } },
} as const;
const SELECT_CR = {
  id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true, status: true, dataVencimento: true, dataPagamento: true, empresaId: true,
  cliente: { select: { razaoSocial: true } }, naturezaFinanceira: { select: { codigo: true, nome: true, sistemaChave: true } },
} as const;

// GET — títulos ligados + totais. ?buscar=texto&tipo=pagar|receber → candidatos para ligar
// (mesma empresa do processo, ainda sem processo, não cancelados).
export async function GET(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  if (!c.fin) return NextResponse.json({ podeVer: false, podeEditar: false, pagar: [], receber: [], totais: null });
  const sp = req.nextUrl.searchParams;
  if (sp.has("buscar")) {
    const q = String(sp.get("buscar") ?? "").trim();
    const ci = { contains: q, mode: "insensitive" as const };
    if (sp.get("tipo") === "receber") {
      const rows = await prismaSemEscopo.contaReceber.findMany({
        where: { empresaId: c.p.empresaId, processoId: null, status: { not: "CANCELADA" }, ...(q ? { OR: [{ numero: ci }, { descricao: ci }, { cliente: { razaoSocial: ci } }] } : {}) },
        orderBy: [{ createdAt: "desc" }], take: 40, select: SELECT_CR,
      });
      return NextResponse.json({ data: rows.map((r) => ({ ...r, beneficiario: r.cliente?.razaoSocial ?? null })) });
    }
    const rows = await prismaSemEscopo.contaPagar.findMany({
      where: { empresaId: c.p.empresaId, processoId: null, status: { not: "CANCELADA" }, ...(q ? { OR: [{ numero: ci }, { descricao: ci }, { fornecedor: { razaoSocial: ci } }] } : {}) },
      orderBy: [{ createdAt: "desc" }], take: 40, select: SELECT_CP,
    });
    return NextResponse.json({ data: rows.map((r) => ({ ...r, beneficiario: r.fornecedor?.razaoSocial ?? null })) });
  }
  const [pagar, receber, depositos] = await Promise.all([
    prismaSemEscopo.contaPagar.findMany({ where: { processoId: c.p.id, status: { not: "CANCELADA" } }, orderBy: { dataVencimento: "asc" }, select: SELECT_CP }),
    prismaSemEscopo.contaReceber.findMany({ where: { processoId: c.p.id, status: { not: "CANCELADA" } }, orderBy: { dataVencimento: "asc" }, select: SELECT_CR }),
    depositosDoProcesso(c.p.id),
  ]);
  const aberto = (t: { status: string; valorOriginal: unknown; valorPago: unknown }) => (t.status === "ABERTA" || t.status === "PARCIAL" ? n(t.valorOriginal) - n(t.valorPago) : 0);
  const naoDeposito = pagar.filter((t) => !ehDeposito(t));
  const totais = {
    // "Pago" exclui depósitos (são ativo, não gasto) — aparecem em "Depositado em juízo".
    pagarPago: r2(naoDeposito.reduce((s, t) => s + n(t.valorPago), 0)),
    depositadoSaldo: r2(depositos.reduce((s, d) => s + d.saldo, 0)),
    pagarAberto: r2(pagar.reduce((s, t) => s + aberto(t), 0)),
    receberRecebido: r2(receber.reduce((s, t) => s + n(t.valorPago), 0)),
    receberAberto: r2(receber.reduce((s, t) => s + aberto(t), 0)),
  };
  return NextResponse.json({
    podeVer: true, podeEditar: c.editar, empresaId: c.p.empresaId, codigo: c.p.codigo,
    pagar: pagar.map((r) => ({ ...r, beneficiario: r.fornecedor?.razaoSocial ?? null, deposito: ehDeposito(r) })),
    depositos: depositos.map((d) => ({ id: d.id, numero: d.numero, descricao: d.descricao, status: d.status, dataPagamento: d.dataPagamento, depositado: d.depositado, destinado: d.destinado, saldo: d.saldo, destinos: d.depositoDestinos })),
    receber: receber.map((r) => ({ ...r, beneficiario: r.cliente?.razaoSocial ?? null })),
    totais,
  });
}

// POST { tipo: "pagar"|"receber", tituloId } — liga um título existente (mesma empresa) ao processo.
export async function POST(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const where = { id: String(b.tituloId ?? ""), empresaId: c.p.empresaId, status: { not: "CANCELADA" as const } };
  const r = b.tipo === "receber"
    ? await prismaSemEscopo.contaReceber.updateMany({ where, data: { processoId: c.p.id } })
    : await prismaSemEscopo.contaPagar.updateMany({ where, data: { processoId: c.p.id } });
  if (!r.count) return NextResponse.json({ error: "Título não encontrado nesta empresa." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE ?tipo=pagar|receber&tituloId= — desfaz o vínculo (o título continua no financeiro).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const where = { id: sp.get("tituloId") ?? "", processoId: c.p.id };
  // Depósito com destino / título de levantamento: o vínculo sustenta o saldo do depósito (§8.3).
  const temDestino = sp.get("tipo") === "receber"
    ? await prismaSemEscopo.processoDepositoDestino.count({ where: { contaReceberId: where.id } })
    : await prismaSemEscopo.processoDepositoDestino.count({ where: { contaPagarId: where.id } });
  if (temDestino) return NextResponse.json({ error: "Título de depósito judicial com destino registrado — desfaça o destino antes de desligar." }, { status: 409 });
  if (sp.get("tipo") === "receber") await prismaSemEscopo.contaReceber.updateMany({ where, data: { processoId: null } });
  else await prismaSemEscopo.contaPagar.updateMany({ where, data: { processoId: null } });
  return NextResponse.json({ ok: true });
}
