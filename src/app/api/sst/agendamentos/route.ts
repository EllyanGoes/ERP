export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { AGENDAMENTO_INCLUDE, PERIODOS, STATUS_ABERTOS, TIPOS_ASO_AGENDAVEIS, precosParaClinica } from "@/lib/sst-agendamento";

// GET /api/sst/agendamentos?de=YYYY-MM-DD&ate=&status=A,B&loteId=&abertos=1
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status")?.split(",").filter(Boolean);
  const where: Record<string, unknown> = {};
  if (sp.get("loteId")) where.loteId = sp.get("loteId");
  if (sp.get("abertos") === "1") where.status = { in: STATUS_ABERTOS };
  else if (status?.length) where.status = { in: status };
  const de = sp.get("de"), ate = sp.get("ate");
  if (de || ate) where.data = { ...(de ? { gte: new Date(`${de}T00:00:00Z`) } : {}), ...(ate ? { lte: new Date(`${ate}T00:00:00Z`) } : {}) };
  const data = await prisma.sstAgendamento.findMany({ where, include: AGENDAMENTO_INCLUDE, orderBy: [{ data: "asc" }, { periodo: "asc" }, { colaborador: { nome: "asc" } }], take: 1000 });
  return NextResponse.json({ data });
}

type Item = { colaboradorId?: string; data?: string; periodo?: string; tipoAso?: string; exames?: string[]; observacoes?: string };

// POST /api/sst/agendamentos { clinicaId, observacoes?, itens: [{ colaboradorId, data, periodo, tipoAso, exames: [exameTipoId], observacoes? }] }
// Cria um LOTE (a lista/guia enviada à clínica) com um agendamento por colaborador.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const itens: Item[] = Array.isArray(b.itens) ? b.itens : [];
  if (!b.clinicaId) return NextResponse.json({ error: "Escolha a clínica." }, { status: 400 });
  if (itens.length === 0) return NextResponse.json({ error: "Selecione ao menos um colaborador." }, { status: 400 });
  for (const it of itens) {
    if (!it.colaboradorId || !it.data || !/^\d{4}-\d{2}-\d{2}$/.test(it.data)) return NextResponse.json({ error: "Cada colaborador precisa de uma data." }, { status: 400 });
    if (!PERIODOS.includes(it.periodo as never)) return NextResponse.json({ error: "Período inválido (manhã ou tarde)." }, { status: 400 });
    if (!TIPOS_ASO_AGENDAVEIS.includes(it.tipoAso as never)) return NextResponse.json({ error: "Tipo de ASO inválido." }, { status: 400 });
    if (!Array.isArray(it.exames) || it.exames.length === 0) return NextResponse.json({ error: "Cada colaborador precisa de ao menos um exame." }, { status: 400 });
  }
  const ids = itens.map((i) => i.colaboradorId!);
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "Colaborador repetido no lote." }, { status: 400 });

  // Já tem ida à clínica em aberto → não agenda de novo (remarque o existente).
  const abertos = await prisma.sstAgendamento.findMany({ where: { colaboradorId: { in: ids }, status: { in: STATUS_ABERTOS } }, select: { data: true, colaborador: { select: { nome: true } } } });
  if (abertos.length) {
    return NextResponse.json({ error: `Já agendado(s): ${abertos.map((a) => `${a.colaborador.nome} (${a.data.toISOString().slice(0, 10).split("-").reverse().join("/")})`).join(", ")}. Remarque o agendamento existente.` }, { status: 409 });
  }

  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const lote = await prisma.$transaction(async (tx) => {
    const ult = await tx.sstAgendamentoLote.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
    const novo = await tx.sstAgendamentoLote.create({ data: { empresaId, numero: (ult?.numero ?? 0) + 1, clinicaId: b.clinicaId, observacoes: String(b.observacoes ?? "").trim() || null } });
    const precos = await precosParaClinica(tx, b.clinicaId, Array.from(new Set(itens.flatMap((i) => i.exames!))));
    for (const it of itens) {
      await tx.sstAgendamento.create({
        data: {
          empresaId, loteId: novo.id, clinicaId: b.clinicaId, colaboradorId: it.colaboradorId!,
          data: new Date(`${it.data}T00:00:00Z`), periodo: it.periodo!, tipoAso: it.tipoAso!,
          observacoes: String(it.observacoes ?? "").trim() || null,
          exames: { create: Array.from(new Set(it.exames!)).map((exameTipoId) => ({ exameTipoId, preco: precos.get(exameTipoId) ?? null })) },
        },
      });
    }
    return novo;
  });
  return NextResponse.json({ data: { loteId: lote.id, numero: lote.numero } }, { status: 201 });
}
