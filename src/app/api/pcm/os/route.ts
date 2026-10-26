export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo, temPermissao } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { criarOrdem, ErroOS, STATUS_OS_ABERTOS } from "@/lib/manutencao/ordem";

const parseData = (v: unknown) => (typeof v === "string" && v ? new Date(v) : null);

// GET /api/pcm/os?situacao=abertas|encerradas|concluidas|canceladas|todas|quadro&ativoId=&equipeId=&tipoId=&q=&de=&ate=&minhas=1&executanteId=
// Lista operacional das OS.
// situacao=quadro alimenta o kanban/calendário: todas as abertas + encerradas (a
// validar) + concluídas nos últimos 30 dias. minhas=1 = OS em que o usuário logado
// é o responsável ou tem apontamento (via Colaborador.usuarioId).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const situacao = sp.get("situacao") ?? "abertas";
  const where: Prisma.ManutOrdemWhereInput = {};
  if (situacao === "abertas") where.status = { in: STATUS_OS_ABERTOS.filter((s) => s !== "ENCERRADA") };
  else if (situacao === "encerradas") where.status = "ENCERRADA";
  else if (situacao === "concluidas") where.status = "CONCLUIDA";
  else if (situacao === "canceladas") where.status = "CANCELADA";
  else if (situacao === "quadro") {
    where.OR = [
      { status: { in: STATUS_OS_ABERTOS } },
      { status: "CONCLUIDA", concluidaEm: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    ];
  }
  const and: Prisma.ManutOrdemWhereInput[] = [];
  if (sp.get("minhas") === "1") {
    and.push({ OR: [
      { responsavel: { usuarioId: auth.session.sub } },
      { apontamentos: { some: { colaborador: { usuarioId: auth.session.sub } } } },
    ] });
  }
  // executanteId = colaborador responsável ou com apontamento na OS (filtro "Executante").
  const executanteId = sp.get("executanteId");
  if (executanteId) {
    and.push({ OR: [{ responsavelId: executanteId }, { apontamentos: { some: { colaboradorId: executanteId } } }] });
  }
  if (sp.get("ativoId")) where.ativoId = sp.get("ativoId")!;
  if (sp.get("equipeId")) where.equipeId = sp.get("equipeId")!;
  if (sp.get("tipoId")) where.tipoId = sp.get("tipoId")!;
  const de = parseData(sp.get("de")), ate = parseData(sp.get("ate"));
  if (de || ate) where.createdAt = { ...(de ? { gte: de } : {}), ...(ate ? { lte: new Date(ate!.getTime() + 86_399_999) } : {}) };
  const q = sp.get("q")?.trim();
  if (q) {
    and.push({ OR: [
      { numero: { contains: q, mode: "insensitive" } },
      { descricao: { contains: q, mode: "insensitive" } },
      { ativo: { nome: { contains: q, mode: "insensitive" } } },
      { ativo: { tag: { contains: q, mode: "insensitive" } } },
    ] });
  }
  if (and.length) where.AND = and;
  const data = await prisma.manutOrdem.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: situacao === "abertas" || situacao === "encerradas" || situacao === "quadro" ? 1000 : 500,
    select: {
      id: true, numero: true, status: true, prioridade: true, descricao: true, createdAt: true, programadaPara: true, prazo: true,
      paradaInicio: true, paradaFim: true, concluidaEm: true, encerradaEm: true, localTexto: true, planoId: true, tarefaId: true,
      custoMaoObra: true, custoMaterial: true, custoTerceiros: true,
      ativo: { select: { id: true, tag: true, nome: true } },
      tipo: { select: { id: true, sigla: true, nome: true, natureza: true } },
      equipe: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true } },
      apontamentos: { where: { fim: null }, select: { nome: true } },
      // Motivo da última pausa/espera — selo no cartão do quadro.
      eventos: {
        where: { tipo: { in: ["PAUSAR", "AGUARDAR_MATERIAL", "AGUARDAR_TERCEIRO"] } },
        orderBy: { createdAt: "desc" }, take: 1, select: { detalhe: true },
      },
    },
  });
  // O quadro usa para avisar, antes de chamar a API, que a transição é do PCM.
  const podeValidar = await temPermissao(auth.session.sub, "pcm.validacao.editar");
  return NextResponse.json({ data, podeValidar });
}

// POST — nova OS (emergência pode nascer sem SS). Body: ativoId, tipoId, descricao,
// prioridade?, equipeId?, responsavelId?, programadaPara?, prazo?, horasEstimadas?,
// exigeParada?, ativoParado?, paradaInicio?
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.ativoId) return NextResponse.json({ error: "Escolha o ativo." }, { status: 400 });
  if (!b.tipoId) return NextResponse.json({ error: "Escolha o tipo de manutenção." }, { status: 400 });
  if (!String(b.descricao ?? "").trim()) return NextResponse.json({ error: "Descreva o serviço." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  try {
    const ordem = await criarOrdem({
      empresaId, ativoId: b.ativoId, tipoId: b.tipoId, descricao: b.descricao, prioridade: b.prioridade,
      equipeId: b.equipeId, responsavelId: b.responsavelId,
      programadaPara: parseData(b.programadaPara), prazo: parseData(b.prazo),
      horasEstimadas: b.horasEstimadas ? Number(b.horasEstimadas) : null, exigeParada: !!b.exigeParada,
      paradaInicio: b.ativoParado ? parseData(b.paradaInicio) ?? new Date() : null,
      usuario: auth.session.nome, origem: "OS direta",
    }, prismaSemEscopo);
    return NextResponse.json({ data: ordem }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroOS) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
