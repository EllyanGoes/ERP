export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { EPI_ENTREGA_SELECT, TIPOS_ENTREGA, entregaDentroDoPrazo, estornarEstoqueEntrega, registrarEntregaEpi, type TipoEntrega } from "@/lib/sst-epi";

const INCLUDE = {
  epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true, itemId: true } },
  colaborador: { select: { id: true, nome: true } },
};

// GET /api/sst/entregas?colaboradorId=&epiId=&dias=
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const colaboradorId = sp.get("colaboradorId");
  const epiId = sp.get("epiId");
  const dias = parseInt(sp.get("dias") ?? "0");
  const data = await prisma.sstEpiEntrega.findMany({
    where: {
      ...(colaboradorId ? { colaboradorId } : {}),
      ...(epiId ? { epiId } : {}),
      ...(dias > 0 ? { data: { gte: new Date(Date.now() - dias * 86_400_000) } } : {}),
    },
    orderBy: { data: "desc" },
    take: 500,
    include: INCLUDE,
  });
  return NextResponse.json({ data });
}

// POST /api/sst/entregas — uma entrega (ou várias: { colaboradorIds: [] })
// { colaboradorId | colaboradorIds, epiId, tipo, quantidade, data, motivo, documentoId?, localEstoqueId?, tamanho? | tamanhos?: {colaboradorId: tamanho} }
// Com localEstoqueId e EPI ligado a item do almoxarifado: dá SAÍDA de estoque
// (hard block sem saldo, como no resto do sistema). Retirada antes do fim da
// vida útil exige motivo (422 { precisaMotivo: [{ colaboradorId, ate }] }).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const ids: string[] = Array.isArray(b.colaboradorIds) ? b.colaboradorIds : b.colaboradorId ? [b.colaboradorId] : [];
  if (ids.length === 0) return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
  if (!b.epiId) return NextResponse.json({ error: "Informe o EPI." }, { status: 400 });
  const tipo: TipoEntrega = (TIPOS_ENTREGA as readonly string[]).includes(b.tipo) ? b.tipo : "ENTREGA";
  const quantidade = Math.max(1, Number(b.quantidade) || 1);
  const data = b.data ? new Date(b.data) : new Date();
  const motivo: string | null = b.motivo?.trim() || null;
  const epi = await prisma.sstEpi.findUnique({ where: { id: b.epiId }, select: EPI_ENTREGA_SELECT });
  if (!epi) return NextResponse.json({ error: "EPI não encontrado" }, { status: 404 });

  try {
    const criadas = await prismaSemEscopo.$transaction(async (tx) => {
      // Antecipadas sem motivo: devolve a lista p/ a tela pedir o motivo.
      if (tipo !== "DEVOLUCAO" && !motivo) {
        const precisaMotivo: { colaboradorId: string; ate: Date }[] = [];
        for (const colaboradorId of ids) {
          const seg = await entregaDentroDoPrazo(tx, colaboradorId, epi.id, data);
          if (seg) precisaMotivo.push({ colaboradorId, ate: seg.vencimentoUso! });
        }
        if (precisaMotivo.length > 0) throw Object.assign(new Error("PRAZO"), { precisaMotivo });
      }
      const out = [];
      for (const colaboradorId of ids) {
        out.push(await registrarEntregaEpi(tx, {
          empresaId, colaboradorId, epi, tipo, quantidade, data, motivo,
          localEstoqueId: b.localEstoqueId || null, documentoId: b.documentoId || null, fichaId: null, criadoPor: auth.session.nome,
          // Lote: tamanho por pessoa (tamanhos[colaboradorId]) ou um só p/ todos.
          tamanho: (b.tamanhos && typeof b.tamanhos === "object" ? b.tamanhos[colaboradorId] : null) ?? b.tamanho ?? null,
        }));
      }
      return out;
    });
    return NextResponse.json({ data: criadas }, { status: 201 });
  } catch (e) {
    const pm = (e as { precisaMotivo?: unknown }).precisaMotivo;
    if (pm) return NextResponse.json({ error: "Retirada antes do fim da vida útil: informe o motivo.", precisaMotivo: pm }, { status: 422 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao registrar entrega" }, { status: 400 });
  }
}

// DELETE /api/sst/entregas?id= — estorna a saída de estoque (se houve) e manda p/ lixeira.
export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const e = await prisma.sstEpiEntrega.findUnique({ where: { id }, include: INCLUDE });
  if (!e) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await estornarEstoqueEntrega(tx, e.movimentacaoEstoqueId);
    await salvarNaLixeira(tx, { empresaId: e.empresaId, tipo: "SST_REGISTRO", origemId: e.id, numero: null, descricao: `Entrega de EPI ${e.epi.nome} — ${e.colaborador.nome}`, snapshot: e, apagadoPor: auth.session.nome });
    await tx.sstEpiEntrega.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
