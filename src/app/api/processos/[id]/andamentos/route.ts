export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { TIPOS_ANDAMENTO, podeEditar, situacaoPorAndamento, carregarProcesso } from "@/lib/processos";

type Ctx = { params: { id: string } };

// POST { data, tipo, descricao, documentoId?, mudarSituacao?: string|null, prazo?: { descricao, vence, avisoDias? }, cumprePrazoId? }
// Lança o andamento; a situação segue o tipo (exigência → aguardando a empresa; protocolo/
// manifestação → aguardando o órgão) salvo mudarSituacao explícito; pode criar o prazo que a
// exigência abre ou dar por cumprido o prazo que este andamento atende.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva o andamento." }, { status: 400 });
  const tipo = TIPOS_ANDAMENTO[String(b.tipo)] ? String(b.tipo) : "MOVIMENTACAO";
  const data = b.data ? new Date(b.data) : new Date();
  const novaSituacao = "mudarSituacao" in b ? (b.mudarSituacao || null) : situacaoPorAndamento(tipo);
  const r = await prismaSemEscopo.$transaction(async (tx) => {
    const a = await tx.processoAndamento.create({ data: { processoId: p.id, data, tipo, descricao, documentoId: b.documentoId || null, usuario: auth.session.nome } });
    if (b.prazo?.descricao?.trim() && b.prazo?.vence) {
      await tx.processoPrazo.create({ data: { processoId: p.id, descricao: String(b.prazo.descricao).trim(), vence: new Date(b.prazo.vence), avisoDias: Math.max(0, Number(b.prazo.avisoDias ?? 5) || 5), responsavelId: p.responsavelId, andamentoId: a.id, criadoPor: auth.session.nome } });
    }
    if (b.cumprePrazoId) {
      await tx.processoPrazo.updateMany({ where: { id: String(b.cumprePrazoId), processoId: p.id, status: "PENDENTE" }, data: { status: "CUMPRIDO", cumpridoEm: data, andamentoId: a.id } });
    }
    if (b.documentoId) await tx.documento.updateMany({ where: { id: String(b.documentoId), processoId: null }, data: { processoId: p.id } });
    if (novaSituacao && novaSituacao !== p.situacao) await tx.processo.update({ where: { id: p.id }, data: { situacao: novaSituacao, atualizadoPor: auth.session.nome } });
    return a;
  });
  return NextResponse.json({ data: r }, { status: 201 });
}

// DELETE ?andamentoId= — remove o andamento (prazos ligados a ele perdem o vínculo).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const andamentoId = req.nextUrl.searchParams.get("andamentoId") ?? "";
  await prismaSemEscopo.$transaction([
    prismaSemEscopo.processoPrazo.updateMany({ where: { processoId: p.id, andamentoId }, data: { andamentoId: null } }),
    prismaSemEscopo.processoAndamento.deleteMany({ where: { id: andamentoId, processoId: p.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
