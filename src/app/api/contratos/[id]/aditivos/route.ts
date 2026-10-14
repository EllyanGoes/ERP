export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { CONTRATO_SELECT, registrarEvento, sincronizarEventosProjetados, fimVigente } from "@/lib/contratos";

// POST /api/contratos/[id]/aditivos — { tipo, efeitoEm, descricao, novoFim?, novoValor?, novaPeriodicidade?, novoReajusteTipo?, novoReajusteIndice?, novoReajustePercentual?, assinadoEm? }
// Aditivo de prazo também atualiza contrato.fim; de valor atualiza contrato.valor (termos vigentes continuam sendo resolvidos pelos aditivos).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const c = await prisma.contrato.findUnique({ where: { id: params.id }, select: CONTRATO_SELECT });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  if (["ENCERRADO", "RESCINDIDO"].includes(c.status)) return NextResponse.json({ error: "Contrato encerrado não recebe aditivo." }, { status: 400 });
  const tipo = ["PRAZO", "VALOR", "OBJETO", "REAJUSTE", "OUTRO"].includes(b.tipo) ? b.tipo : "OUTRO";
  const descricao = String(b.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva o aditivo." }, { status: 400 });
  const efeitoEm = b.efeitoEm ? new Date(String(b.efeitoEm)) : new Date();
  const novoFim = b.novoFim ? new Date(String(b.novoFim)) : null;
  const novoValor = b.novoValor === "" || b.novoValor == null ? null : Number(b.novoValor);
  try {
    const ad = await prismaSemEscopo.$transaction(async (tx) => {
      const n = c.aditivos.length + 1;
      const ad = await tx.contratoAditivo.create({ data: {
        contratoId: c.id, numero: n, tipo, efeitoEm, descricao, novoFim, novoValor,
        novaPeriodicidade: b.novaPeriodicidade || null, novoReajusteTipo: b.novoReajusteTipo || null, novoReajusteIndice: b.novoReajusteIndice || null,
        novoReajustePercentual: b.novoReajustePercentual === "" || b.novoReajustePercentual == null ? null : Number(b.novoReajustePercentual),
        assinadoEm: b.assinadoEm ? new Date(String(b.assinadoEm)) : null, aplicadoEm: new Date(), criadoPor: auth.session.nome,
      } });
      const data: Record<string, unknown> = {};
      if (novoFim) data.fim = novoFim;
      if (novoValor != null) data.valor = novoValor;
      if (b.novaPeriodicidade) data.periodicidade = b.novaPeriodicidade;
      if (b.novoReajusteTipo) data.reajusteTipo = b.novoReajusteTipo;
      if (b.novoReajusteIndice) data.reajusteIndice = b.novoReajusteIndice;
      if (b.novoReajustePercentual) data.reajustePercentual = Number(b.novoReajustePercentual);
      if (tipo === "REAJUSTE") { const prox = new Date(efeitoEm); prox.setFullYear(prox.getFullYear() + 1); data.reajusteProximo = prox; }
      if (c.status === "EM_RENOVACAO" && novoFim) data.status = "VIGENTE";
      if (Object.keys(data).length) await tx.contrato.update({ where: { id: c.id }, data: { ...data, atualizadoPor: auth.session.nome } });
      await registrarEvento(tx, c.id, tipo === "REAJUSTE" ? "REAJUSTE_APLICADO" : "ADITIVO", `${n}º aditivo (${tipo.toLowerCase()}): ${descricao}`, auth.session.sub);
      const atual = await tx.contrato.findUnique({ where: { id: c.id }, select: CONTRATO_SELECT });
      if (atual) await sincronizarEventosProjetados(tx, atual);
      return ad;
    });
    return NextResponse.json({ data: ad }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

// DELETE ?id= — só o último aditivo, e recompõe fim/valor pelos restantes.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const adId = new URL(req.url).searchParams.get("id") ?? "";
  const c = await prisma.contrato.findUnique({ where: { id: params.id }, select: CONTRATO_SELECT });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const ad = c.aditivos.find((a) => a.id === adId);
  if (!ad) return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 });
  if (ad.numero !== Math.max(...c.aditivos.map((a) => a.numero))) return NextResponse.json({ error: "Só o último aditivo pode ser removido." }, { status: 400 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.contratoAditivo.delete({ where: { id: ad.id } });
    const resto = { ...c, aditivos: c.aditivos.filter((a) => a.id !== ad.id) };
    const ultimoValor = [...resto.aditivos].reverse().find((a) => a.novoValor != null)?.novoValor ?? null;
    await tx.contrato.update({ where: { id: c.id }, data: { fim: fimVigente(resto), ...(ad.novoValor != null ? { valor: ultimoValor ?? c.valor } : {}), atualizadoPor: auth.session.nome } });
    await registrarEvento(tx, c.id, "OBSERVACAO", `${ad.numero}º aditivo removido por ${auth.session.nome}`, auth.session.sub);
    const atual = await tx.contrato.findUnique({ where: { id: c.id }, select: CONTRATO_SELECT });
    if (atual) await sincronizarEventosProjetados(tx, atual);
  });
  return NextResponse.json({ ok: true });
}
