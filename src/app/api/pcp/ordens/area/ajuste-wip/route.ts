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
// Ajuste de saldo do WIP (contagem física) direto do board de Fluxo de Produção.
// Cria um InventarioMaterial PARCIAL já CONCLUÍDO no local PEP com os itens WIP
// contados e aplica o ajuste pela mesma maquinaria do inventário de materiais
// (movimento AJUSTE + recálculo de saldos + contabilização sobra/perda). O
// inventário fica visível em /suprimentos/inventarios-materiais e a exclusão
// lá reverte o ajuste.
// Sobra/perda contábil sai valorada pelo CMPM do item WIP (frequentemente 0 →
// lançamento zerado/omitido) — o custeio do WIP é por absorção.
const ESTADOS_WIP: EstadoWIP[] = ["UMIDO", "SECO", "QUEIMADO"]; // ACABADO usa o estoque normal

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

  if (!estado || !ESTADOS_WIP.includes(estado)) {
    return NextResponse.json({ error: "Estado de WIP inválido (úmido/seco/queimado)" }, { status: 400 });
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

  const inv = await prisma.$transaction(async (tx) => {
    const localId = await getOrCreateLocalEstado(tx, estado);

    // Resolve o item WIP de cada produto e o saldo do sistema no local PEP.
    const linhas: { wipItemId: string; saldoSistema: number; saldoFisico: number }[] = [];
    for (const it of itens) {
      const p = porId.get(it.produtoItemId)!;
      const wipItemId = await getOrCreateWipItem(tx, { codigo: p.codigo, descricao: p.descricao }, estado);
      const estoque = await tx.estoqueItem.findFirst({
        where: { itemId: wipItemId, localEstoqueId: localId, clienteDonoId: null },
        select: { quantidadeAtual: true },
      });
      linhas.push({
        wipItemId,
        saldoSistema: estoque ? r3(Number(estoque.quantidadeAtual)) : 0,
        saldoFisico: r3(Number(it.saldoFisico)),
      });
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
        observacoes: `Ajuste de saldo WIP ${estado} — board Fluxo de Produção${obs ? ` · ${obs}` : ""}`,
        itens: {
          create: linhas.map((l) => ({
            itemId: l.wipItemId,
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
      linhas.map((l) => ({ itemId: l.wipItemId, saldoFisico: l.saldoFisico })),
    );

    return { ...criado, ajustados: ajustados.length };
  });

  // Contabiliza o ajuste (sobra/perda) — best-effort, idempotente (ESTOQUE_AJUSTE).
  await contabilizarInventario(inv.id).catch(() => {});

  return NextResponse.json({ ok: true, inventarioId: inv.id, numero: inv.numero, ajustados: inv.ajustados });
}
