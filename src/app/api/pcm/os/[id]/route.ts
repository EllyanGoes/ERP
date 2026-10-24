export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo, temPermissao } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { acoesPermitidas, pendenciasEncerramento, recomputarStatusAtivo, PRIORIDADES } from "@/lib/manutencao/ordem";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/pcm/os/[id] — OS completa (serviços, materiais, apontamentos, terceiros,
// requisições vinculadas, linha do tempo) + ações possíveis para o usuário.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const o = await prisma.manutOrdem.findUnique({
    where: { id },
    include: {
      ativo: { select: { id: true, codApl: true, tag: true, nome: true, status: true, localizacao: true } },
      tipo: true,
      plano: { select: { id: true, codigo: true, nome: true } },
      equipe: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true } },
      centroCusto: { select: { id: true, codigo: true, nome: true } },
      servicos: {
        orderBy: { seq: "asc" },
        include: { servico: { select: { descricao: true } }, sintoma: { select: { descricao: true } }, causa: { select: { descricao: true } } },
      },
      materiais: { orderBy: { descricao: "asc" }, include: { item: { select: { codigo: true, descricao: true } } } },
      apontamentos: { orderBy: { inicio: "asc" } },
      terceiros: { include: { fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } } } },
      eventos: { orderBy: { createdAt: "asc" } },
      solicitacoes: { select: { id: true, numero: true, solicitanteNome: true, createdAt: true, descricao: true } },
      requisicoes: {
        select: { id: true, numero: true, tipo: true, status: true, data: true, itens: { select: { quantidade: true, item: { select: { codigo: true, descricao: true } } } } },
        orderBy: { data: "asc" },
      },
    },
  });
  if (!o) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  const podeValidar = await temPermissao(auth.session.sub, "pcm.validacao.editar");
  const pendencias = ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO", "ENCERRADA"].includes(o.status)
    ? await pendenciasEncerramento(o.id)
    : [];
  return NextResponse.json({ data: { ...o, acoes: acoesPermitidas(o.status), podeValidar, pendencias } });
}

const EDITAVEIS_DATA = ["programadaPara", "prazo", "paradaInicio", "paradaFim"] as const;

// PATCH — edição dos campos de planejamento/execução. OS concluída/cancelada não edita
// (reabra primeiro).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const atual = await prisma.manutOrdem.findUnique({ where: { id }, select: { id: true, status: true, ativoId: true, empresaId: true } });
  if (!atual) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (["CONCLUIDA", "CANCELADA"].includes(atual.status)) return NextResponse.json({ error: "OS concluída/cancelada — reabra para editar." }, { status: 422 });
  const b = await req.json().catch(() => ({}));
  const data: Prisma.ManutOrdemUncheckedUpdateInput = {};
  if (typeof b.descricao === "string" && b.descricao.trim()) data.descricao = b.descricao.trim();
  if (b.tipoId) data.tipoId = b.tipoId;
  if (b.prioridade && PRIORIDADES.includes(b.prioridade)) data.prioridade = b.prioridade;
  for (const k of ["equipeId", "responsavelId", "centroCustoId"] as const) if (k in b) data[k] = b[k] || null;
  for (const k of EDITAVEIS_DATA) if (k in b) data[k] = b[k] ? new Date(b[k]) : null;
  if ("horasEstimadas" in b) data.horasEstimadas = b.horasEstimadas === "" || b.horasEstimadas == null ? null : Number(b.horasEstimadas);
  if ("leituraMedidor" in b) data.leituraMedidor = b.leituraMedidor === "" || b.leituraMedidor == null ? null : Number(b.leituraMedidor);
  if ("exigeParada" in b) data.exigeParada = !!b.exigeParada;
  if ("observacaoTecnica" in b) data.observacaoTecnica = b.observacaoTecnica?.trim() || null;
  if (b.ativoId && b.ativoId !== atual.ativoId) {
    const a = await prisma.manutAtivo.findUnique({ where: { id: b.ativoId }, select: { id: true, centroCustoId: true } });
    if (!a) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });
    data.ativoId = a.id;
    if (!("centroCustoId" in b)) data.centroCustoId = a.centroCustoId;
  }
  const p0 = "paradaInicio" in b ? data.paradaInicio : undefined;
  const p1 = "paradaFim" in b ? data.paradaFim : undefined;
  if (p0 instanceof Date && p1 instanceof Date && p1 < p0) return NextResponse.json({ error: "O fim da parada é anterior ao início." }, { status: 400 });
  const o = await prisma.manutOrdem.update({ where: { id }, data });
  if ("paradaInicio" in b || "paradaFim" in b || data.ativoId) {
    await recomputarStatusAtivo(o.ativoId, prismaSemEscopo);
    if (atual.ativoId && atual.ativoId !== o.ativoId) await recomputarStatusAtivo(atual.ativoId, prismaSemEscopo);
  }
  return NextResponse.json({ data: o });
}
