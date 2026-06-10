export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { z } from "zod";

const schema = z.object({
  itemId:           z.string().min(1),
  localEstoqueId:   z.string().min(1),
  deClienteDonoId:  z.string().nullable(),   // null = estoque próprio
  paraClienteDonoId: z.string().nullable(),  // null = estoque próprio
  quantidade:       z.coerce.number().min(0.001),
  documento:        z.string().optional(),
  observacoes:      z.string().optional(),
});

// ── POST — reclassificar propriedade do estoque ──────────────────────────────
// Move quantidade entre "donos" do mesmo (item, local) SEM alterar o total
// físico: um único lote AJUSTE com duas movimentações espelhadas (perna − no
// dono de origem, perna + no destino). É como se registra, por exemplo, que
// 3.000 sacos do estoque próprio na verdade pertencem a um cliente (ou o
// inverso, quando a empresa compra a mercadoria que guardava).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const { itemId, localEstoqueId, quantidade, documento, observacoes } = parsed.data;
  const de = parsed.data.deClienteDonoId || null;
  const para = parsed.data.paraClienteDonoId || null;

  if (de === para) {
    return NextResponse.json({ error: "Origem e destino são o mesmo proprietário" }, { status: 400 });
  }
  for (const clienteId of [de, para]) {
    if (clienteId) {
      const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
      if (!cliente) return NextResponse.json({ error: "Cliente proprietário não encontrado" }, { status: 400 });
    }
  }

  try {
    const lote = await prisma.$transaction(async (tx) => {
      const origem = await tx.estoqueItem.findFirst({
        where: { itemId, localEstoqueId, clienteDonoId: de },
      });
      const saldoOrigem = origem ? parseFloat(String(origem.quantidadeAtual)) : 0;
      if (!origem || saldoOrigem < quantidade) {
        throw new Error(
          `Saldo insuficiente na origem (${de ? "terceiro" : "estoque próprio"}): disponível ${saldoOrigem}, solicitado ${quantidade}`
        );
      }

      const nomeDono = async (id: string | null) => {
        if (!id) return "estoque próprio";
        const c = await tx.cliente.findUnique({ where: { id }, select: { razaoSocial: true } });
        return c?.razaoSocial ?? id;
      };
      const obs = observacoes?.trim()
        || `Reclassificação de propriedade: ${await nomeDono(de)} → ${await nomeDono(para)}`;

      // lote AJUSTE com numeração MOV (sequência da empresa ativa, via extensão)
      const year = new Date().getFullYear();
      const seq = await tx.sequencia.upsert({
        where:  { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "MOV" } },
        create: { prefixo: "MOV", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const loteCriado = await tx.loteMovimentacao.create({
        data: {
          numero: `MOV-${year}-${String(seq.ultimo).padStart(4, "0")}`,
          tipo: "AJUSTE",
          documento: documento?.trim() || null,
          observacoes: obs,
        },
      });

      // perna − (origem)
      const origemAtualizada = await tx.estoqueItem.update({
        where: { id: origem.id },
        data:  { quantidadeAtual: { decrement: quantidade } },
      });
      const saldoDepoisOrigem = parseFloat(String(origemAtualizada.quantidadeAtual));
      await tx.movimentacaoEstoque.create({
        data: {
          itemId, localEstoqueId, clienteDonoId: de,
          tipo: "AJUSTE",
          quantidade,
          saldoAntes: saldoDepoisOrigem + quantidade,
          saldoDepois: saldoDepoisOrigem,
          loteId: loteCriado.id,
          documento: documento?.trim() || null,
          observacoes: obs,
        },
      });

      // perna + (destino) — cria a linha do dono se não existir
      let destino = await tx.estoqueItem.findFirst({
        where: { itemId, localEstoqueId, clienteDonoId: para },
      });
      if (!destino) {
        destino = await tx.estoqueItem.create({
          data: { itemId, localEstoqueId, clienteDonoId: para, quantidadeAtual: 0, quantidadeMin: 0 },
        });
      }
      const destinoAtualizado = await tx.estoqueItem.update({
        where: { id: destino.id },
        data:  { quantidadeAtual: { increment: quantidade } },
      });
      const saldoDepoisDestino = parseFloat(String(destinoAtualizado.quantidadeAtual));
      await tx.movimentacaoEstoque.create({
        data: {
          itemId, localEstoqueId, clienteDonoId: para,
          tipo: "AJUSTE",
          quantidade,
          saldoAntes: saldoDepoisDestino - quantidade,
          saldoDepois: saldoDepoisDestino,
          loteId: loteCriado.id,
          documento: documento?.trim() || null,
          observacoes: obs,
        },
      });

      return loteCriado;
    });

    return NextResponse.json({ data: { loteId: lote.id, numero: lote.numero } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao reclassificar";
    const status = msg.startsWith("Saldo insuficiente") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
