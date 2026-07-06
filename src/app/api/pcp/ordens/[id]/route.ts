export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { StatusOrdemProducao } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { sanitizarPlanoTransporte } from "@/lib/pcp/plano-transporte";
import { estornarApontamentoOrdem } from "@/lib/pcp/estorno";
import { respostaSaldoNegativo, SaldoNegativoError } from "@/lib/estoque-guard";

const STATUS: StatusOrdemProducao[] = ["RASCUNHO", "LIBERADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"];

// GET — ordem + etapas (em ordem) + consumos de biomassa
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      fluxoVersao: { select: { versao: true, fluxo: { select: { id: true, nome: true } } } },
      responsavelColaborador: { select: { nome: true } },
      produtoItens: {
        select: { itemId: true, quantidadePlanejada: true, quantidadeReal: true, unidadeId: true,
          item: { select: { codigo: true, descricao: true, unidade: { select: { sigla: true } } } }, unidade: { select: { sigla: true } } },
      },
      etapas: { orderBy: { sequencia: "asc" } },
      consumos: { orderBy: { data: "desc" } },
      movimentacoes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, tipo: true, quantidade: true, saldoDepois: true, observacoes: true, createdAt: true,
          item: { select: { codigo: true, descricao: true } },
        },
      },
    },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  return NextResponse.json({ data: ordem });
}

// PATCH — muda status, observação OU edita a OP (produtos, prazos, responsável).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, empresaId: true, etapas: { select: { status: true } } },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });

  const parseDt = (v: unknown) => { if (typeof v === "string" && v.trim()) { const d = new Date(v); return isNaN(d.getTime()) ? null : d; } return null; };
  const data: Record<string, unknown> = {};
  if ("status" in body) {
    if (typeof body.status !== "string" || !(STATUS as string[]).includes(body.status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    data.status = body.status as StatusOrdemProducao;
  }
  if ("observacao" in body) data.observacao = typeof body.observacao === "string" && body.observacao.trim() ? body.observacao.trim() : null;
  if ("dataPrevistaInicio" in body) data.dataPrevistaInicio = parseDt(body.dataPrevistaInicio);
  if ("dataPrevistaFim" in body) data.dataPrevistaFim = parseDt(body.dataPrevistaFim);
  if ("responsavelColaboradorId" in body) data.responsavelColaboradorId = typeof body.responsavelColaboradorId === "string" && body.responsavelColaboradorId ? body.responsavelColaboradorId : null;
  // Config do "Planejar por transporte" (vagões): persiste/limpa junto com a edição.
  if ("planoTransporte" in body) data.planoTransporte = sanitizarPlanoTransporte(body.planoTransporte) ?? Prisma.DbNull;

  // Edição dos produtos (substitui as linhas). OP já apontada/concluída também pode
  // ser corrigida: o apontamento anterior é ESTORNADO em cascata (movimentos de
  // estoque, custo-empresa, biomassa e contábil) dentro da mesma transação, e a OP
  // volta a pendente para reapontar com os valores corrigidos.
  const editaProdutos = Array.isArray(body.produtos);
  const apontada = ordem.status === "CONCLUIDA" || ordem.etapas.some((e) => e.status === "CONCLUIDA");
  let produtos: { itemId: string; quantidade: number; unidadeId: string | null }[] = [];
  if (editaProdutos) {
    if (ordem.status === "CANCELADA") {
      return NextResponse.json({ error: "OP cancelada — não dá para editar os produtos." }, { status: 400 });
    }
    produtos = (body.produtos as Record<string, unknown>[])
      .map((p) => ({ itemId: typeof p.itemId === "string" ? p.itemId : "", quantidade: Number(p.quantidade), unidadeId: typeof p.unidadeId === "string" && p.unidadeId ? p.unidadeId : null }))
      .filter((p) => p.itemId && Number.isFinite(p.quantidade) && p.quantidade > 0);
    if (!produtos.length) return NextResponse.json({ error: "Informe ao menos um produto com quantidade > 0." }, { status: 400 });
    const itensOk = await prisma.item.findMany({ where: { id: { in: produtos.map((p) => p.itemId) } }, select: { id: true } });
    if (itensOk.length !== new Set(produtos.map((p) => p.itemId)).size) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    data.itemId = produtos[0].itemId;             // compat: 1º produto
    data.quantidadePlanejada = produtos[0].quantidade;
  }

  try {
    let estornada = false;
    const updated = await prisma.$transaction(async (tx) => {
      if (editaProdutos && apontada) {
        // Correção de OP apontada: reverte primeiro tudo que o apontamento gerou.
        await estornarApontamentoOrdem(tx, { ordemId: params.id, empresaId: ordem.empresaId });
        estornada = true;
      }
      if (editaProdutos) {
        await tx.ordemProducaoProdutoItem.deleteMany({ where: { ordemProducaoId: params.id } });
        await tx.ordemProducaoProdutoItem.createMany({ data: produtos.map((p) => ({ ordemProducaoId: params.id, itemId: p.itemId, quantidadePlanejada: p.quantidade, unidadeId: p.unidadeId })) });
      }
      return tx.ordemProducao.update({ where: { id: params.id }, data });
    }, { timeout: 60000 });
    return NextResponse.json({ data: updated, estornada });
  } catch (e) {
    if (e instanceof SaldoNegativoError) return respostaSaldoNegativo(e);
    return NextResponse.json({ error: "Não foi possível atualizar." }, { status: 400 });
  }
}

// DELETE — remove a ordem (cascade nas etapas e consumos)
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  try {
    // OP já apontada tem movimentações de estoque; excluir deixaria o saldo
    // alterado sem a OP (movimentação vira órfã). Bloqueia — precisa estornar antes.
    const movs = await prisma.movimentacaoEstoque.count({ where: { ordemProducaoId: params.id } });
    if (movs > 0) {
      return NextResponse.json({ error: "OP já apontada (tem movimentação de estoque). Estorne o apontamento antes de excluir." }, { status: 409 });
    }
    // Etapas (ItemOrdemProducao) e consumos têm cascade; snapshot na LIXEIRA e
    // remove a OP (tx: snapshot faz rollback se o delete falhar).
    await prisma.$transaction(async (tx) => {
      const cheia = await tx.ordemProducao.findUnique({
        where: { id: params.id },
        include: { etapas: true, produtoItens: true, consumos: true, item: { select: { codigo: true, descricao: true } } },
      });
      if (cheia) {
        await salvarNaLixeira(tx, {
          empresaId: cheia.empresaId,
          tipo: "ORDEM_PRODUCAO",
          origemId: cheia.id,
          numero: cheia.numero,
          descricao: `${cheia.status} · ${cheia.item?.descricao ?? ""} · ${cheia.etapas.length} etapa(s)`,
          snapshot: cheia,
          apagadoPor: auth.session.nome,
        });
      }
      await tx.ordemProducao.delete({ where: { id: params.id } });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
