export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { recalcularCustoOrdem } from "@/lib/manutencao/ordem";

type Ctx = { params: Promise<{ id: string }> };

const FECHADAS = ["CONCLUIDA", "CANCELADA"];

/** Custo-hora congelado no apontamento: o da equipe da OS (se houver). */
async function custoHoraDaOrdem(ordemId: string): Promise<number | null> {
  const o = await prismaSemEscopo.manutOrdem.findUnique({ where: { id: ordemId }, select: { equipe: { select: { custoHora: true } } } });
  return o?.equipe?.custoHora != null ? Number(o.equipe.custoHora) : null;
}

// POST { acao: "iniciar", colaboradorId }              → abre o cronômetro (agora)
//      { acao: "parar", apontamentoId }                → fecha o cronômetro (agora)
//      { acao: "manual", colaboradorId, inicio, fim, observacao? } → lança horas
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const os = await prisma.manutOrdem.findUnique({ where: { id }, select: { id: true, status: true, iniciadaEm: true } });
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (FECHADAS.includes(os.status)) return NextResponse.json({ error: "OS concluída/cancelada." }, { status: 422 });
  const b = await req.json().catch(() => ({}));

  if (b.acao === "parar") {
    const ap = await prismaSemEscopo.manutApontamento.findFirst({ where: { id: b.apontamentoId, ordemId: id, fim: null } });
    if (!ap) return NextResponse.json({ error: "Apontamento em andamento não encontrado." }, { status: 404 });
    await prismaSemEscopo.manutApontamento.update({ where: { id: ap.id }, data: { fim: new Date() } });
  } else {
    const colab = b.colaboradorId ? await prismaSemEscopo.colaborador.findUnique({ where: { id: b.colaboradorId }, select: { id: true, nome: true } }) : null;
    if (!colab) return NextResponse.json({ error: "Escolha quem executou." }, { status: 400 });
    const custoHora = await custoHoraDaOrdem(id);
    if (b.acao === "iniciar") {
      const aberto = await prismaSemEscopo.manutApontamento.findFirst({ where: { ordemId: id, colaboradorId: colab.id, fim: null } });
      if (aberto) return NextResponse.json({ error: `${colab.nome} já está com o cronômetro rodando nesta OS.` }, { status: 422 });
      await prismaSemEscopo.manutApontamento.create({ data: { ordemId: id, colaboradorId: colab.id, nome: colab.nome, inicio: new Date(), custoHora, criadoPor: auth.session.nome } });
      // primeiro apontamento coloca a OS em execução
      if (["ABERTA", "PLANEJADA", "PAUSADA"].includes(os.status)) {
        await prismaSemEscopo.manutOrdem.update({ where: { id }, data: { status: "EM_EXECUCAO", iniciadaEm: os.iniciadaEm ?? new Date() } });
        await prismaSemEscopo.manutOrdemEvento.create({ data: { ordemId: id, tipo: "INICIAR", detalhe: `cronômetro de ${colab.nome}`, usuario: auth.session.nome } });
      }
    } else if (b.acao === "manual") {
      const inicio = b.inicio ? new Date(b.inicio) : null;
      const fim = b.fim ? new Date(b.fim) : null;
      if (!inicio || !fim || fim <= inicio) return NextResponse.json({ error: "Informe início e fim (fim depois do início)." }, { status: 400 });
      if (fim.getTime() - inicio.getTime() > 24 * 3_600_000) return NextResponse.json({ error: "Apontamento maior que 24h — lance por dia." }, { status: 400 });
      await prismaSemEscopo.manutApontamento.create({ data: { ordemId: id, colaboradorId: colab.id, nome: colab.nome, inicio, fim, custoHora, observacao: b.observacao?.trim() || null, criadoPor: auth.session.nome } });
    } else {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
  }
  await recalcularCustoOrdem(id);
  return NextResponse.json({ ok: true });
}

// DELETE ?apontamentoId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const os = await prisma.manutOrdem.findUnique({ where: { id }, select: { status: true } });
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (FECHADAS.includes(os.status)) return NextResponse.json({ error: "OS concluída/cancelada." }, { status: 422 });
  await prismaSemEscopo.manutApontamento.deleteMany({ where: { id: req.nextUrl.searchParams.get("apontamentoId") ?? "", ordemId: id } });
  await recalcularCustoOrdem(id);
  return NextResponse.json({ ok: true });
}
