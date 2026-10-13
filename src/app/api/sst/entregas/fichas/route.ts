export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { FICHA_INCLUDE, TIPOS_ENTREGA, entregaDentroDoPrazo, proximoNumeroFicha, registrarEntregaEpi, type TipoEntrega } from "@/lib/sst-epi";

// GET /api/sst/entregas/fichas?colaboradorId=&pendentes=1 — fichas (mais recentes primeiro)
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const colaboradorId = sp.get("colaboradorId");
  const pendentes = sp.get("pendentes") === "1";
  const data = await prisma.sstEpiFicha.findMany({
    where: { ...(colaboradorId ? { colaboradorId } : {}), ...(pendentes ? { documentoId: null } : {}) },
    orderBy: { numero: "desc" },
    take: 300,
    include: FICHA_INCLUDE,
  });
  return NextResponse.json({ data });
}

// POST /api/sst/entregas/fichas — entrega de vários EPIs p/ UM colaborador.
// { colaboradorId, data, observacoes?, itens: [{ epiId, quantidade, tipo, motivo?, localEstoqueId? }] }
// Item retirado antes do fim da vida útil sem motivo → 422 { precisaMotivo: [{ epiId, ate }] }.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (!b.colaboradorId) return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
  const itensIn: { epiId: string; quantidade?: number; tipo?: string; motivo?: string; localEstoqueId?: string | null }[] = Array.isArray(b.itens) ? b.itens : [];
  if (itensIn.length === 0) return NextResponse.json({ error: "Selecione ao menos um EPI." }, { status: 400 });
  const data = b.data ? new Date(b.data) : new Date();
  const epis = await prisma.sstEpi.findMany({ where: { id: { in: itensIn.map((i) => i.epiId) } }, select: { id: true, nome: true, vidaUtilDias: true, itemId: true, item: { select: { descricao: true } } } });
  const porId = new Map(epis.map((e) => [e.id, e]));
  if (epis.length !== new Set(itensIn.map((i) => i.epiId)).size) return NextResponse.json({ error: "EPI não encontrado." }, { status: 404 });

  try {
    const ficha = await prismaSemEscopo.$transaction(async (tx) => {
      const precisaMotivo: { epiId: string; ate: Date }[] = [];
      for (const i of itensIn) {
        const tipo = (TIPOS_ENTREGA as readonly string[]).includes(i.tipo ?? "") ? (i.tipo as TipoEntrega) : "ENTREGA";
        if (tipo === "DEVOLUCAO" || i.motivo?.trim()) continue;
        const seg = await entregaDentroDoPrazo(tx, b.colaboradorId, i.epiId, data);
        if (seg) precisaMotivo.push({ epiId: i.epiId, ate: seg.vencimentoUso! });
      }
      if (precisaMotivo.length > 0) throw Object.assign(new Error("PRAZO"), { precisaMotivo });

      const numero = await proximoNumeroFicha(tx, empresaId);
      const f = await tx.sstEpiFicha.create({
        data: { empresaId, numero, colaboradorId: b.colaboradorId, data, observacoes: b.observacoes?.trim() || null, criadoPor: auth.session.nome },
        select: { id: true },
      });
      for (const i of itensIn) {
        const tipo = (TIPOS_ENTREGA as readonly string[]).includes(i.tipo ?? "") ? (i.tipo as TipoEntrega) : "ENTREGA";
        await registrarEntregaEpi(tx, {
          empresaId, colaboradorId: b.colaboradorId, epi: porId.get(i.epiId)!, tipo, quantidade: Number(i.quantidade) || 1, data,
          motivo: i.motivo?.trim() || null, localEstoqueId: i.localEstoqueId || null, documentoId: null, fichaId: f.id, criadoPor: auth.session.nome,
        });
      }
      return tx.sstEpiFicha.findUnique({ where: { id: f.id }, include: FICHA_INCLUDE });
    });
    return NextResponse.json({ data: ficha }, { status: 201 });
  } catch (e) {
    const pm = (e as { precisaMotivo?: unknown }).precisaMotivo;
    if (pm) return NextResponse.json({ error: "Há EPI retirado antes do fim da vida útil: informe o motivo.", precisaMotivo: pm }, { status: 422 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao registrar a ficha" }, { status: 400 });
  }
}
