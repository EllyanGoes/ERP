export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// Materiais PREVISTOS da OS (o que vai ser necessário). A baixa real continua
// pela requisição vinculada à OS — o botão "Requisitar itens" leva os previstos
// como linhas da requisição. Linhas LEGADO (Engeman) não se editam.
// O item pode pertencer a uma ATIVIDADE da OS (servicoId → ManutOrdemServico):
// adicionar item na atividade já o considera material da OS.
// POST { itemId, quantidade, servicoId? } · PATCH { materialId, quantidade?, servicoId? }
// · DELETE ?materialId=

async function ordemEditavel(id: string) {
  const o = await prisma.manutOrdem.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!o) return { erro: NextResponse.json({ error: "OS não encontrada." }, { status: 404 }) };
  if (["CONCLUIDA", "CANCELADA"].includes(o.status)) return { erro: NextResponse.json({ error: "OS concluída/cancelada — reabra para alterar os materiais." }, { status: 422 }) };
  return { o };
}

/** servicoId informado precisa ser uma atividade desta OS ("" / null = OS geral). */
async function resolverAtividade(ordemId: string, servicoId: unknown): Promise<{ id: string | null } | { erro: NextResponse }> {
  if (servicoId == null || servicoId === "") return { id: null };
  const s = await prismaSemEscopo.manutOrdemServico.findFirst({ where: { id: String(servicoId), ordemId }, select: { id: true } });
  if (!s) return { erro: NextResponse.json({ error: "Atividade não encontrada nesta OS." }, { status: 404 }) };
  return { id: s.id };
}

const parseQtd = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await ordemEditavel(id);
  if (r.erro) return r.erro;
  const b = await req.json().catch(() => ({}));
  if (!b.itemId) return NextResponse.json({ error: "Escolha o produto." }, { status: 400 });
  const quantidade = parseQtd(b.quantidade);
  if (!quantidade) return NextResponse.json({ error: "Informe a quantidade." }, { status: 400 });
  const item = await prismaSemEscopo.item.findUnique({ where: { id: b.itemId }, select: { id: true, codigo: true, descricao: true, unidade: { select: { sigla: true } } } });
  if (!item) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });

  const atv = await resolverAtividade(id, b.servicoId);
  if ("erro" in atv) return atv.erro;

  // Mesmo produto já previsto NA MESMA atividade (ou na OS geral): soma na linha
  // existente em vez de duplicar.
  const existente = await prismaSemEscopo.manutOrdemMaterial.findFirst({ where: { ordemId: id, itemId: item.id, origem: "PREVISTO", servicoId: atv.id } });
  const material = existente
    ? await prismaSemEscopo.manutOrdemMaterial.update({ where: { id: existente.id }, data: { quantidade: Number(existente.quantidade) + quantidade } })
    : await prismaSemEscopo.manutOrdemMaterial.create({
        data: { ordemId: id, itemId: item.id, servicoId: atv.id, descricao: item.descricao, quantidade, unidade: item.unidade?.sigla ?? null, origem: "PREVISTO" },
      });
  return NextResponse.json({ data: material, somado: !!existente }, { status: existente ? 200 : 201 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await ordemEditavel(id);
  if (r.erro) return r.erro;
  const b = await req.json().catch(() => ({}));
  if (!b.materialId) return NextResponse.json({ error: "materialId obrigatório." }, { status: 400 });
  const data: { quantidade?: number; servicoId?: string | null } = {};
  if ("quantidade" in b) {
    const quantidade = parseQtd(b.quantidade);
    if (!quantidade) return NextResponse.json({ error: "Informe a quantidade." }, { status: 400 });
    data.quantidade = quantidade;
  }
  // mover o item entre atividades (ou para a OS geral)
  if ("servicoId" in b) {
    const atv = await resolverAtividade(id, b.servicoId);
    if ("erro" in atv) return atv.erro;
    data.servicoId = atv.id;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });
  const m = await prismaSemEscopo.manutOrdemMaterial.findFirst({ where: { id: b.materialId, ordemId: id } });
  if (!m) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  if (m.origem !== "PREVISTO") return NextResponse.json({ error: "Só o material previsto pode ser alterado." }, { status: 422 });
  const material = await prismaSemEscopo.manutOrdemMaterial.update({ where: { id: m.id }, data });
  return NextResponse.json({ data: material });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await ordemEditavel(id);
  if (r.erro) return r.erro;
  const materialId = req.nextUrl.searchParams.get("materialId");
  if (!materialId) return NextResponse.json({ error: "materialId obrigatório." }, { status: 400 });
  const m = await prismaSemEscopo.manutOrdemMaterial.findFirst({ where: { id: materialId, ordemId: id }, select: { id: true, origem: true } });
  if (!m) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  if (m.origem !== "PREVISTO") return NextResponse.json({ error: "Só o material previsto pode ser removido." }, { status: 422 });
  await prismaSemEscopo.manutOrdemMaterial.delete({ where: { id: m.id } });
  return NextResponse.json({ ok: true });
}
