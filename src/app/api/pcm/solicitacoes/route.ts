export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { getUserModulos, hasModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { proximoNumeroSS, PRIORIDADES } from "@/lib/manutencao/ordem";
import { notificarUsuario } from "@/lib/notificacoes";

// Solicitação de Serviço: QUALQUER usuário logado abre e acompanha as próprias;
// quem tem o módulo PCM vê todas e faz a triagem.

// GET ?status=ABERTA|CONVERTIDA|ANEXADA|RECUSADA|todas&minhas=1
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const pcm = hasModulo(await getUserModulos(auth.session.sub), "pcm");
  const sp = req.nextUrl.searchParams;
  const where: Prisma.ManutSolicitacaoWhereInput = {};
  const status = sp.get("status") ?? "ABERTA";
  if (status !== "todas") where.status = status;
  if (!pcm || sp.get("minhas") === "1") where.solicitanteId = auth.session.sub;
  const data = await prisma.manutSolicitacao.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      ativo: { select: { id: true, tag: true, nome: true } },
      ordem: { select: { id: true, numero: true, status: true } },
    },
  });
  return NextResponse.json({ data, podeTriar: pcm });
}

// POST { ativoId?, localTexto?, descricao, ativoParado?, paradoDesde?, prioridade? }
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva o problema." }, { status: 400 });
  if (!b.ativoId && !String(b.localTexto ?? "").trim()) return NextResponse.json({ error: "Escolha o equipamento ou diga onde fica." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (b.ativoId) {
    const a = await prisma.manutAtivo.findUnique({ where: { id: b.ativoId }, select: { id: true } });
    if (!a) return NextResponse.json({ error: "Equipamento não encontrado." }, { status: 404 });
  }
  const ss = await prisma.manutSolicitacao.create({
    data: {
      empresaId, numero: await proximoNumeroSS(empresaId), ativoId: b.ativoId || null, localTexto: b.localTexto?.trim() || null,
      descricao, ativoParado: !!b.ativoParado, paradoDesde: b.ativoParado ? (b.paradoDesde ? new Date(b.paradoDesde) : new Date()) : null,
      prioridade: PRIORIDADES.includes(b.prioridade) ? b.prioridade : null,
      solicitanteId: auth.session.sub, solicitanteNome: auth.session.nome,
    },
    include: { ativo: { select: { tag: true, nome: true } } },
  });
  // Avisa o PCM (módulo pcm); emergência/máquina parada vai com destaque no título.
  const pcm = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true, id: { not: auth.session.sub }, permissoes: { some: { modulo: { startsWith: "pcm" } } }, empresas: { some: { empresaId } } },
    select: { id: true },
  });
  const urgente = ss.ativoParado || ss.prioridade === "EMERGENCIA";
  for (const u of pcm) {
    await notificarUsuario({
      usuarioId: u.id, tipo: "MANUT_SS_NOVA",
      titulo: `${urgente ? "⚠ Máquina parada — " : ""}${ss.numero} de ${auth.session.nome}`,
      mensagem: `${ss.ativo ? `${ss.ativo.tag} ${ss.ativo.nome}: ` : ss.localTexto ? `${ss.localTexto}: ` : ""}${descricao.slice(0, 160)}`,
      link: "/pcm/solicitacoes",
    });
  }
  return NextResponse.json({ data: ss }, { status: 201 });
}
