export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { EstadoWIP } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { getOrCreateWipItem, getOrCreateLocalEstado } from "@/lib/pcp/wip-estoque";
import { aplicarCmpmEmpresa } from "@/lib/custo-empresa";
import { contabilizarSaldoInicialEstoque } from "@/lib/contabilidade";

// POST /api/pcp/ordens/area/saldo-inicial-wip
// Define o SALDO INICIAL (abertura) de um produto em estado de WIP (úmido/seco/queimado),
// para começar a produção a partir de uma etapa intermediária. Cria o item/local de WIP
// (mesmos helpers da produção), lança uma ENTRADA "SALDO-INICIAL" valorada e contabiliza
// (D Estoque WIP / C 2.3.3 Saldos de Abertura), reusando contabilizarSaldoInicialEstoque.
const ESTADOS_WIP: EstadoWIP[] = ["UMIDO", "SECO", "QUEIMADO"]; // ACABADO usa o estoque normal

export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const estado = typeof body?.estado === "string" ? (body.estado as EstadoWIP) : null;
  const quantidade = Number(body?.quantidade);
  // Custo unit. não é informado na tela (o custeio vem do CPV/absorção) → default 0.
  const custoUnitario = Number(body?.custoUnitario ?? 0);
  // Data do saldo (opcional). "YYYY-MM-DD" → meio-dia local p/ não deslocar o dia.
  const dataStr = typeof body?.data === "string" && body.data ? body.data : null;
  const dataMov = dataStr ? new Date(`${dataStr}T12:00:00`) : null;
  if (!itemId) return NextResponse.json({ error: "Produto é obrigatório" }, { status: 400 });
  if (!estado || !ESTADOS_WIP.includes(estado)) return NextResponse.json({ error: "Estado de WIP inválido (úmido/seco/queimado)" }, { status: 400 });
  if (!Number.isFinite(quantidade) || quantidade <= 0) return NextResponse.json({ error: "Informe uma quantidade > 0" }, { status: 400 });
  if (!Number.isFinite(custoUnitario) || custoUnitario < 0) return NextResponse.json({ error: "Custo unitário inválido" }, { status: 400 });

  const produto = await prisma.item.findUnique({ where: { id: itemId }, select: { codigo: true, descricao: true } });
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  const criadoPor = auth.session.nome ?? null;

  let empresaId = EMPRESA_PADRAO_ID;
  try {
    await prisma.$transaction(async (tx) => {
      const wipItemId = await getOrCreateWipItem(tx, { codigo: produto.codigo, descricao: produto.descricao }, estado);
      const localId = await getOrCreateLocalEstado(tx, estado);

      // Trava: saldo inicial é definido UMA vez por (item WIP, local). Correções → inventário.
      const jaTem = await tx.movimentacaoEstoque.findFirst({
        where: { itemId: wipItemId, localEstoqueId: localId, documento: "SALDO-INICIAL" }, select: { id: true },
      });
      if (jaTem) throw new Error("DUP");

      let estoque = await tx.estoqueItem.findFirst({ where: { itemId: wipItemId, localEstoqueId: localId, clienteDonoId: null } });
      if (!estoque) estoque = await tx.estoqueItem.create({ data: { itemId: wipItemId, localEstoqueId: localId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null } });
      // Empresa DERIVADA da linha de estoque do WIP (carimbada pelo escopo da
      // sessão) — a padrão fica só como fallback final.
      empresaId = estoque.empresaId || EMPRESA_PADRAO_ID;
      const saldoAntes = Number(estoque.quantidadeAtual);
      const saldoDepois = saldoAntes + quantidade;
      await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldoDepois } });
      await tx.movimentacaoEstoque.create({
        data: {
          itemId: wipItemId, localEstoqueId: localId, tipo: "ENTRADA", quantidade, saldoAntes, saldoDepois,
          valorUnitario: custoUnitario, documento: "SALDO-INICIAL",
          data: dataMov && !isNaN(dataMov.getTime()) ? dataMov : null,
          observacoes: `Saldo inicial WIP ${estado} — ${produto.descricao}`, criadoPor,
        },
      });
      // Valoriza o item WIP (CMPM) p/ o saldo de abertura e o consumo seguinte custearem certo.
      if (custoUnitario > 0) await aplicarCmpmEmpresa(tx, empresaId, wipItemId, quantidade, custoUnitario, { incluirAcabado: false });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "DUP") {
      return NextResponse.json({ error: "Saldo inicial já definido para este produto/estado. Para corrigir, use o inventário." }, { status: 400 });
    }
    return NextResponse.json({ error: "Não foi possível lançar o saldo inicial." }, { status: 400 });
  }

  // D Estoque WIP (conta do local) / C 2.3.3 Saldos de Abertura — re-sincroniza o lançamento de abertura.
  await contabilizarSaldoInicialEstoque(empresaId).catch(() => {});

  return NextResponse.json({ ok: true });
}
