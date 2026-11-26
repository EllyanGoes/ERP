export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { podeEditar, textoOuNull, TIPOS_PROCESSO } from "@/lib/processos";

// Roteiros (tarefas padrão) por tipo de processo — compartilhados pelo grupo.
// GET ?tipo=&todos=1 — lista (só ativos, salvo todos=1) com as etapas.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const data = await prismaSemEscopo.processoRoteiro.findMany({
    where: { ...(sp.get("tipo") ? { tipo: sp.get("tipo")! } : {}), ...(sp.get("todos") === "1" ? {} : { ativo: true }) },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    include: { etapas: { orderBy: { ordem: "asc" }, include: { responsavel: { select: { id: true, nome: true } } } } },
  });
  return NextResponse.json({ data, podeEditar: await podeEditar(auth.session) });
}

type EtapaIn = { titulo?: string; responsavelId?: string | null; dias?: number | string; diasUteis?: boolean; base?: string; avisoDias?: number | string };
const etapasDe = (b: { etapas?: EtapaIn[] }) =>
  (Array.isArray(b.etapas) ? b.etapas : []).filter((e) => String(e?.titulo ?? "").trim()).slice(0, 40).map((e, i) => ({
    ordem: i + 1, titulo: String(e.titulo).trim(), responsavelId: textoOuNull(e.responsavelId),
    dias: Math.max(0, Math.min(3650, Math.round(Number(e.dias) || 0))), diasUteis: e.diasUteis !== false,
    base: e.base === "CIENCIA" ? "CIENCIA" : "ABERTURA", avisoDias: Math.max(0, Math.round(Number(e.avisoDias ?? 3) || 0)),
  }));

// POST { tipo, nome, descricao?, etapas: [...] } — novo roteiro.
// PUT  { id, tipo, nome, descricao?, ativo?, etapas } — substitui o roteiro e as etapas.
async function salvar(req: NextRequest, novo: boolean) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Dê um nome ao roteiro." }, { status: 400 });
  const tipo = TIPOS_PROCESSO[String(b.tipo)] ? String(b.tipo) : "OUTRO";
  const etapas = etapasDe(b);
  if (!etapas.length) return NextResponse.json({ error: "Inclua ao menos uma etapa." }, { status: 400 });
  const r = await prismaSemEscopo.$transaction(async (tx) => {
    if (novo) return tx.processoRoteiro.create({ data: { tipo, nome, descricao: textoOuNull(b.descricao), criadoPor: auth.session.nome, etapas: { create: etapas } }, select: { id: true } });
    const id = String(b.id ?? "");
    await tx.processoRoteiroEtapa.deleteMany({ where: { roteiroId: id } });
    return tx.processoRoteiro.update({ where: { id }, data: { tipo, nome, descricao: textoOuNull(b.descricao), ativo: b.ativo !== false, etapas: { create: etapas } }, select: { id: true } });
  });
  return NextResponse.json({ data: r }, { status: novo ? 201 : 200 });
}
export const POST = (req: NextRequest) => salvar(req, true);
export const PUT = (req: NextRequest) => salvar(req, false);

// DELETE ?id= — remove o roteiro (prazos já criados nos processos ficam).
export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  await prismaSemEscopo.processoRoteiro.deleteMany({ where: { id: req.nextUrl.searchParams.get("id") ?? "" } });
  return NextResponse.json({ ok: true });
}
