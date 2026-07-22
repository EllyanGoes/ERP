export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { EstadoWIP } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { getOrCreateWipItem, getOrCreateLocalEstado } from "@/lib/pcp/wip-estoque";
import { aplicarAjustesInventario } from "@/lib/inventario-ajuste";
import { contabilizarInventario } from "@/lib/contabilidade";
import { generateSimpleDocNumber } from "@/lib/utils";

// POST /api/pcp/ordens/area/ajuste-wip
// Ajuste de saldo da produção (contagem física) direto do board de Fluxo de
// Produção: WIP por estado OU produto ACABADO (item-alvo é o próprio produto,
// no local de PA). Cria um InventarioMaterial PARCIAL já CONCLUÍDO no local do
// estado com os itens contados e aplica o ajuste pela mesma maquinaria do
// inventário de materiais (movimento AJUSTE + recálculo de saldos +
// contabilização sobra/perda). O inventário fica visível em
// /suprimentos/inventarios-materiais e a exclusão lá reverte o ajuste.
// Sobra/perda contábil sai valorada pelo CMPM do item (no WIP frequentemente 0
// → lançamento zerado/omitido — o custeio do WIP é por absorção).
const ESTADOS: EstadoWIP[] = ["UMIDO", "SECO", "QUEIMADO", "ACABADO"];

type ItemPayload = { produtoItemId: string; saldoFisico: number };

export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const estado = typeof body?.estado === "string" ? (body.estado as EstadoWIP) : null;
  const obs = typeof body?.observacoes === "string" ? body.observacoes.trim() : "";
  // Data da contagem (opcional). "YYYY-MM-DD" → meio-dia local p/ não deslocar o dia.
  const dataStr = typeof body?.data === "string" && body.data ? body.data : null;
  const dataMov = dataStr ? new Date(`${dataStr}T12:00:00`) : null;
  const itens = Array.isArray(body?.itens) ? (body!.itens as ItemPayload[]) : [];

  if (!estado || !ESTADOS.includes(estado)) {
    return NextResponse.json({ error: "Estado inválido (úmido/seco/queimado/acabado)" }, { status: 400 });
  }
  if (!itens.length) {
    return NextResponse.json({ error: "Informe a contagem de pelo menos um produto" }, { status: 400 });
  }
  for (const it of itens) {
    if (typeof it?.produtoItemId !== "string" || !it.produtoItemId) {
      return NextResponse.json({ error: "Produto inválido na contagem" }, { status: 400 });
    }
    if (!Number.isFinite(Number(it?.saldoFisico)) || Number(it.saldoFisico) < 0) {
      return NextResponse.json({ error: "Saldo físico deve ser um número ≥ 0" }, { status: 400 });
    }
  }

  const produtos = await prisma.item.findMany({
    where: { id: { in: itens.map((i) => i.produtoItemId) } },
    select: { id: true, codigo: true, descricao: true },
  });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  if (itens.some((i) => !porId.has(i.produtoItemId))) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  const r3 = (x: number) => Math.round(x * 1000) / 1000; // saldos Decimal(15,3)

  let inv;
  try {
    inv = await prisma.$transaction(async (tx) => {
      const localId = await getOrCreateLocalEstado(tx, estado);

      // Item-alvo de cada produto (o item WIP do estado, ou o próprio produto no
      // ACABADO). O saldo do sistema é o TOTAL do item em todos os locais (o que o
      // board mostra); a diferença da contagem é aplicada no local do estado, então
      // o alvo recebe alvoFisico = saldoNoAlvo + (físico − total) p/ o TOTAL fechar
      // com a contagem. Contagem menor que o saldo fora do local do estado deixaria
      // o local negativo → erro (esse saldo não está no pátio p/ ser contado).
      const linhas: { alvoItemId: string; saldoSistema: number; saldoFisico: number; alvoFisico: number }[] = [];
      for (const it of itens) {
        const p = porId.get(it.produtoItemId)!;
        const alvoItemId = estado === "ACABADO"
          ? p.id
          : await getOrCreateWipItem(tx, { codigo: p.codigo, descricao: p.descricao }, estado);
        const rows = await tx.estoqueItem.findMany({
          where: { itemId: alvoItemId, clienteDonoId: null },
          select: { quantidadeAtual: true, localEstoqueId: true },
        });
        const total = r3(rows.reduce((s, r) => s + Number(r.quantidadeAtual), 0));
        const noAlvo = r3(rows.filter((r) => r.localEstoqueId === localId).reduce((s, r) => s + Number(r.quantidadeAtual), 0));
        const fisico = r3(Number(it.saldoFisico));
        const alvoFisico = r3(noAlvo + (fisico - total));
        if (alvoFisico < 0) {
          throw new Error(`SALDO_OUTROS:${p.descricao}: contagem de ${fisico.toLocaleString("pt-BR")} pç é menor que o saldo em outros locais (${r3(total - noAlvo).toLocaleString("pt-BR")} pç fora do local do estado) — o ajuste deixaria o local negativo.`);
        }
        linhas.push({ alvoItemId, saldoSistema: total, saldoFisico: fisico, alvoFisico });
      }

      // Mesma sequência "INV" da tela de inventários de materiais.
      const seq = await tx.sequencia.upsert({
        where:  { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "INV" } },
        create: { prefixo: "INV", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber("INV", seq.ultimo);

      const criado = await tx.inventarioMaterial.create({
        data: {
          numero,
          localEstoqueId: localId,
          data: dataMov && !isNaN(dataMov.getTime()) ? dataMov : new Date(),
          tipo: "PARCIAL",
          status: "CONCLUIDO",
          observacoes: `Ajuste de saldo ${estado === "ACABADO" ? "produto acabado" : `WIP ${estado}`} — board Fluxo de Produção${obs ? ` · ${obs}` : ""}`,
          itens: {
            create: linhas.map((l) => ({
              itemId: l.alvoItemId,
              saldoSistema: l.saldoSistema,
              saldoFisico: l.saldoFisico,
              diferenca: r3(l.saldoFisico - l.saldoSistema),
            })),
          },
        },
        select: { id: true, numero: true, empresaId: true, localEstoqueId: true },
      });

      const ajustados = await aplicarAjustesInventario(
        tx,
        criado,
        linhas.map((l) => ({ itemId: l.alvoItemId, saldoFisico: l.alvoFisico })),
      );

      return { ...criado, ajustados: ajustados.length };
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("SALDO_OUTROS:")) {
      return NextResponse.json({ error: e.message.slice("SALDO_OUTROS:".length) }, { status: 400 });
    }
    throw e;
  }

  // Contabiliza o ajuste (sobra/perda) — best-effort, idempotente (ESTOQUE_AJUSTE).
  await contabilizarInventario(inv.id).catch(() => {});

  return NextResponse.json({ ok: true, inventarioId: inv.id, numero: inv.numero, ajustados: inv.ajustados });
}
