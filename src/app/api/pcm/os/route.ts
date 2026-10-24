export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { criarOrdem, ErroOS, STATUS_OS_ABERTOS } from "@/lib/manutencao/ordem";

const parseData = (v: unknown) => (typeof v === "string" && v ? new Date(v) : null);

// GET /api/pcm/os?situacao=abertas|encerradas|concluidas|canceladas|todas&ativoId=&equipeId=&tipoId=&q=&de=&ate=
// Lista operacional das OS (a aba "Relatório de O.S." continua em /api/pcm/ordens).
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
  if (sp.get("ativoId")) where.ativoId = sp.get("ativoId")!;
  if (sp.get("equipeId")) where.equipeId = sp.get("equipeId")!;
  if (sp.get("tipoId")) where.tipoId = sp.get("tipoId")!;
  const de = parseData(sp.get("de")), ate = parseData(sp.get("ate"));
  if (de || ate) where.createdAt = { ...(de ? { gte: de } : {}), ...(ate ? { lte: new Date(ate!.getTime() + 86_399_999) } : {}) };
  const q = sp.get("q")?.trim();
  if (q) {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { descricao: { contains: q, mode: "insensitive" } },
      { ativo: { nome: { contains: q, mode: "insensitive" } } },
      { ativo: { tag: { contains: q, mode: "insensitive" } } },
    ];
  }
  const data = await prisma.manutOrdem.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: situacao === "abertas" || situacao === "encerradas" ? 1000 : 500,
    select: {
      id: true, numero: true, status: true, prioridade: true, descricao: true, createdAt: true, programadaPara: true, prazo: true,
      paradaInicio: true, paradaFim: true, concluidaEm: true, encerradaEm: true, localTexto: true, planoId: true,
      custoMaoObra: true, custoMaterial: true, custoTerceiros: true,
      ativo: { select: { id: true, tag: true, nome: true } },
      tipo: { select: { id: true, sigla: true, nome: true, natureza: true } },
      equipe: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true } },
      apontamentos: { where: { fim: null }, select: { nome: true } },
    },
  });
  return NextResponse.json({ data });
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
