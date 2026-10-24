export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { saldoProprioPorItem } from "@/lib/manutencao/sobressalentes";

// Sobressalentes do ativo (ManutAtivoPeca): produto do estoque do ERP, quantidade
// usada no equipamento e estoque mínimo que o almoxarifado deve manter. O saldo
// vem do EstoqueItem da empresa ativa (só estoque próprio). ManutAtivoPeca não tem
// empresaId — o escopo é pelo ativo (escopado) e as escritas usam prismaSemEscopo.

async function ativoDaRota(raw: string) {
  const codApl = Number(raw);
  if (!Number.isInteger(codApl) || codApl <= 0) return null;
  return prisma.manutAtivo.findUnique({ where: { codApl }, select: { id: true } });
}

function lerDecimal(v: unknown, { obrigatorio }: { obrigatorio: boolean }): number | null | "invalido" {
  if (v === null || v === undefined || v === "") return obrigatorio ? "invalido" : null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : "invalido";
}

// GET — peças do ativo com o saldo atual do estoque e o alerta de mínimo.
export async function GET(_req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const ativo = await ativoDaRota(params.codApl);
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  const pecas = await prismaSemEscopo.manutAtivoPeca.findMany({
    where: { ativoId: ativo.id },
    include: { item: { select: { id: true, codigo: true, descricao: true, unidade: { select: { sigla: true } }, unidadeMedida: true } } },
    orderBy: { item: { descricao: "asc" } },
  });
  const saldos = await saldoProprioPorItem(pecas.map((p) => p.itemId));
  const data = pecas.map((p) => {
    const saldo = saldos.get(p.itemId) ?? 0;
    const minimo = p.estoqueMinimo == null ? null : Number(p.estoqueMinimo);
    return {
      id: p.id, itemId: p.itemId, quantidade: Number(p.quantidade), estoqueMinimo: minimo, observacao: p.observacao,
      item: { id: p.item.id, codigo: p.item.codigo, descricao: p.item.descricao, unidade: p.item.unidade?.sigla ?? p.item.unidadeMedida },
      saldo, abaixoMinimo: minimo != null && saldo < minimo,
    };
  });
  return NextResponse.json({ data });
}

// POST { itemId, quantidade?, estoqueMinimo?, observacao? }
export async function POST(req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const ativo = await ativoDaRota(params.codApl);
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const itemId = String(b.itemId ?? "");
  const item = itemId ? await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } }) : null;
  if (!item) return NextResponse.json({ error: "Escolha o produto." }, { status: 400 });
  const quantidade = lerDecimal(b.quantidade ?? 1, { obrigatorio: true });
  const estoqueMinimo = lerDecimal(b.estoqueMinimo, { obrigatorio: false });
  if (quantidade === "invalido" || quantidade === null || quantidade === 0) return NextResponse.json({ error: "Quantidade inválida." }, { status: 400 });
  if (estoqueMinimo === "invalido") return NextResponse.json({ error: "Estoque mínimo inválido." }, { status: 400 });
  const existe = await prismaSemEscopo.manutAtivoPeca.findUnique({ where: { ativoId_itemId: { ativoId: ativo.id, itemId } }, select: { id: true } });
  if (existe) return NextResponse.json({ error: "Este produto já está na lista do ativo — edite a linha." }, { status: 409 });
  const p = await prismaSemEscopo.manutAtivoPeca.create({
    data: { ativoId: ativo.id, itemId, quantidade, estoqueMinimo, observacao: typeof b.observacao === "string" && b.observacao.trim() ? b.observacao.trim() : null },
  });
  return NextResponse.json({ data: p }, { status: 201 });
}

// PATCH { id, quantidade?, estoqueMinimo?, observacao? }
export async function PATCH(req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const ativo = await ativoDaRota(params.codApl);
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const peca = await prismaSemEscopo.manutAtivoPeca.findUnique({ where: { id: String(b.id ?? "") }, select: { id: true, ativoId: true } });
  if (!peca || peca.ativoId !== ativo.id) return NextResponse.json({ error: "Peça não encontrada" }, { status: 404 });
  const data: { quantidade?: number; estoqueMinimo?: number | null; observacao?: string | null } = {};
  if (b.quantidade !== undefined) {
    const q = lerDecimal(b.quantidade, { obrigatorio: true });
    if (q === "invalido" || q === null || q === 0) return NextResponse.json({ error: "Quantidade inválida." }, { status: 400 });
    data.quantidade = q;
  }
  if (b.estoqueMinimo !== undefined) {
    const m = lerDecimal(b.estoqueMinimo, { obrigatorio: false });
    if (m === "invalido") return NextResponse.json({ error: "Estoque mínimo inválido." }, { status: 400 });
    data.estoqueMinimo = m;
  }
  if (b.observacao !== undefined) data.observacao = typeof b.observacao === "string" && b.observacao.trim() ? b.observacao.trim() : null;
  const p = await prismaSemEscopo.manutAtivoPeca.update({ where: { id: peca.id }, data });
  return NextResponse.json({ data: p });
}

// DELETE ?id=
export async function DELETE(req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const ativo = await ativoDaRota(params.codApl);
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const peca = await prismaSemEscopo.manutAtivoPeca.findUnique({ where: { id }, select: { id: true, ativoId: true } });
  if (!peca || peca.ativoId !== ativo.id) return NextResponse.json({ error: "Peça não encontrada" }, { status: 404 });
  await prismaSemEscopo.manutAtivoPeca.delete({ where: { id: peca.id } });
  return NextResponse.json({ ok: true });
}
