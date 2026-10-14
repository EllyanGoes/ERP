export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { CONTRATO_SELECT, pendenciasContrato, projetarEventos, semaforo, sincronizarEventosProjetados, termosVigentes, valorMensal, fimVigente } from "@/lib/contratos";
import { camposContrato } from "@/lib/contratos-campos";

// GET /api/contratos/[id] — contrato completo: termos vigentes, aditivos, eventos, documentos, pendências.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const c = await prisma.contrato.findUnique({ where: { id: params.id }, select: CONTRATO_SELECT });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const [eventos, documentos] = await Promise.all([
    prismaSemEscopo.contratoEvento.findMany({ where: { contratoId: c.id }, orderBy: { data: "desc" } }),
    prismaSemEscopo.documento.findMany({ where: { contratoId: c.id }, orderBy: { createdAt: "desc" }, select: { id: true, titulo: true, validade: true, status: true, emissao: true, createdAt: true, categoria: { select: { nome: true, slug: true } }, versaoVigente: { select: { nome: true, tamanho: true } } } }),
  ]);
  const hoje = new Date();
  const pend = pendenciasContrato(c, hoje);
  return NextResponse.json({ data: { ...c, termos: termosVigentes(c, hoje), fimVigente: fimVigente(c), valorMensal: valorMensal(c, hoje), eventosProjetados: projetarEventos(c, hoje), eventos, documentos, pendencias: pend, semaforo: semaforo(pend) } });
}

// PATCH /api/contratos/[id] — minuta: tudo editável; vigente: só campos administrativos
// (responsável, centro, natureza, objeto, observações, tags, garantia/multa, assinadoEm, reajusteProximo).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.contrato.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!atual) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const campos = camposContrato(b);
  const adm = {
    responsavelId: b.responsavelId ? String(b.responsavelId) : undefined,
    centroCustoId: campos.centroCustoId, naturezaFinanceiraId: campos.naturezaFinanceiraId, objeto: campos.objeto, observacoes: campos.observacoes, tags: campos.tags,
    multaRescisoria: campos.multaRescisoria, garantia: campos.garantia,
    assinadoEm: "assinadoEm" in b ? (b.assinadoEm ? new Date(String(b.assinadoEm)) : null) : undefined,
    reajusteProximo: "reajusteProximo" in b ? campos.reajusteProximo : undefined,
    diaVencimento: campos.diaVencimento,
  };
  const data = atual.status === "MINUTA" ? { ...campos, ...adm } : adm;
  if (atual.status === "MINUTA" && !campos.titulo) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  const c = await prismaSemEscopo.$transaction(async (tx) => {
    await tx.contrato.update({ where: { id: params.id }, data: { ...data, atualizadoPor: auth.session.nome } });
    const c = await tx.contrato.findUnique({ where: { id: params.id }, select: CONTRATO_SELECT });
    if (c) await sincronizarEventosProjetados(tx, c);
    return c;
  });
  return NextResponse.json({ data: c });
}

// DELETE — só minuta/encerrado; snapshot na lixeira.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const c = await prisma.contrato.findUnique({ where: { id: params.id }, select: CONTRATO_SELECT });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  if (["VIGENTE", "EM_RENOVACAO", "SUSPENSO"].includes(c.status)) return NextResponse.json({ error: "Contrato vigente não pode ser excluído — rescinda ou encerre." }, { status: 400 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: c.empresaId, tipo: "CONTRATO", origemId: c.id, numero: c.numero, descricao: `${c.numero} — ${c.titulo}`, snapshot: c, apagadoPor: auth.session.nome });
    await tx.documento.updateMany({ where: { contratoId: c.id }, data: { contratoId: null } });
    await tx.contrato.delete({ where: { id: c.id } });
  });
  return NextResponse.json({ ok: true });
}
