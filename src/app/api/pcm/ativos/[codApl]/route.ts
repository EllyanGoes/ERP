export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Criticidade } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dadosDoAtivo, ErroAtivo } from "@/lib/manutencao/ativo";

function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function lerCodApl(raw: string): number | null {
  const codApl = Number(raw);
  return Number.isInteger(codApl) && codApl > 0 ? codApl : null;
}

// ── GET /api/pcm/ativos/[codApl] — ficha do ativo + OS, planos e medidores ───
export async function GET(_req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const codApl = lerCodApl(params.codApl);
  if (!codApl) return NextResponse.json({ error: "codApl inválido" }, { status: 400 });

  const ativo = await prisma.manutAtivo.findUnique({
    where: { codApl },
    include: {
      pai: { select: { id: true, codApl: true, tag: true, nome: true } },
      familia: { select: { id: true, nome: true } },
      setor: { select: { id: true, nome: true } },
      centroCusto: { select: { id: true, codigo: true, nome: true } },
      imobilizado: { select: { id: true, descricao: true } },
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      _count: { select: { filhos: true, ordens: true, solicitacoes: true } },
    },
  });
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });

  const [ordens, planos, medidores, crit, regime, maquinasSst, centrosTrabalho] = await Promise.all([
    prisma.manutOrdem.findMany({
      where: { ativoId: ativo.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true, numero: true, status: true, prioridade: true, descricao: true,
        createdAt: true, concluidaEm: true, paradaInicio: true, paradaFim: true,
        tipo: { select: { sigla: true, nome: true } },
      },
    }),
    prisma.manutPlanoAtivo.findMany({
      where: { ativoId: ativo.id },
      orderBy: [{ ativo: "desc" }, { proximoVencimento: "asc" }],
      select: {
        id: true, gatilho: true, intervaloDias: true, intervaloMedida: true, ativo: true,
        ultimaExecucao: true, proximoVencimento: true, proximaMedida: true,
        plano: { select: { id: true, codigo: true, nome: true, ativo: true } },
        medidor: { select: { nome: true, unidade: true } },
      },
    }),
    prisma.manutMedidor.findMany({
      where: { ativoId: ativo.id },
      orderBy: { nome: "asc" },
      select: {
        id: true, nome: true, unidade: true, acumulado: true, ativo: true,
        leituras: { orderBy: { data: "desc" }, take: 1, select: { data: true, valor: true } },
      },
    }),
    prisma.ativoCriticidade.findUnique({ where: { codApl }, select: { criticidade: true } }),
    prisma.ativoRegime.findUnique({ where: { codApl }, select: { horasPorDia: true } }),
    prisma.sstMaquina.findMany({ where: { codApl }, select: { id: true, nome: true } }),
    prisma.centroTrabalho.findMany({ where: { codApl }, select: { id: true, codigo: true, nome: true } }),
  ]);

  return NextResponse.json({
    data: {
      ...ativo,
      criticidade: crit?.criticidade ?? null,
      regimeHorasDia: regime?.horasPorDia ?? null,
      ordens,
      planos,
      medidores: medidores.map((m) => ({ ...m, ultimaLeitura: m.leituras[0] ?? null, leituras: undefined })),
      maquinasSst,
      centrosTrabalho,
    },
  });
}

// Altera o ativo (mapeado por codApl). Aceita qualquer combinação de:
//   { criticidade: "A"|"B"|"C"|null, classificadoPor? }      (config local)
//   { regimeHorasDia: number|null }   (horas de operação por dia; null = padrão 24h)
//   campos da ficha: { tag, nome, tipo, paiId, familiaId, localizacao, setorId,
//     centroCustoId, imobilizadoId, fornecedorId, fabricante, modelo, numeroSerie,
//     numeroPatrimonio, placa, anoFabricacao, dataAquisicao, garantiaAte,
//     observacoes, ativo }
// null/"" em criticidade/regime remove o respectivo registro.
const CAMPOS_FICHA = [
  "tag", "nome", "tipo", "paiId", "familiaId", "localizacao", "setorId", "centroCustoId",
  "imobilizadoId", "fornecedorId", "fabricante", "modelo", "numeroSerie", "numeroPatrimonio",
  "placa", "anoFabricacao", "dataAquisicao", "garantiaAte", "observacoes", "ativo",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { codApl: string } },
) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const codApl = lerCodApl(params.codApl);
  if (!codApl) return NextResponse.json({ error: "codApl inválido" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const temFicha = !!body && CAMPOS_FICHA.some((k) => k in body);
  if (!body || (!("criticidade" in body) && !("regimeHorasDia" in body) && !temFicha)) {
    return NextResponse.json({ error: "Nada para alterar" }, { status: 400 });
  }

  const ativo = await prisma.manutAtivo.findUnique({ where: { codApl }, select: { id: true, tag: true, nome: true } });
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });

  // ── Ficha do ativo ────────────────────────────────────────────────────────
  if (temFicha) {
    try {
      const dados = await dadosDoAtivo(body, ativo.id);
      await prisma.manutAtivo.update({ where: { id: ativo.id }, data: dados });
    } catch (e) {
      if (e instanceof ErroAtivo) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }

  // ── Criticidade ───────────────────────────────────────────────────────────
  if ("criticidade" in body) {
    const crit = body.criticidade;
    if (crit === null || crit === "") {
      await prisma.ativoCriticidade.deleteMany({ where: { codApl } });
    } else if (crit === "A" || crit === "B" || crit === "C") {
      const valor = crit as Criticidade;
      const atual = await prisma.manutAtivo.findUnique({ where: { id: ativo.id }, select: { tag: true, nome: true } });
      const tag = atual?.tag ?? null;
      const descricao = atual?.nome ?? null;
      const classificadoPor = trimOrNull(body.classificadoPor) ?? auth.session.nome ?? null;
      await prisma.ativoCriticidade.upsert({
        where: { codApl },
        create: { codApl, criticidade: valor, tag, descricao, classificadoPor },
        update: { criticidade: valor, tag, descricao, classificadoPor },
      });
    } else {
      return NextResponse.json(
        { error: "Criticidade inválida (use A, B, C ou null)" },
        { status: 400 },
      );
    }
  }

  // ── Regime de operação (horas/dia) ──────────────────────────────────────────
  if ("regimeHorasDia" in body) {
    const h = body.regimeHorasDia;
    if (h === null || h === "") {
      await prisma.ativoRegime.deleteMany({ where: { codApl } });
    } else {
      const horas = Number(h);
      if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
        return NextResponse.json(
          { error: "regimeHorasDia deve ser um número entre 0 e 24" },
          { status: 400 },
        );
      }
      await prisma.ativoRegime.upsert({
        where: { codApl },
        create: { codApl, horasPorDia: horas },
        update: { horasPorDia: horas },
      });
    }
  }

  // Estado atual após as alterações.
  const [crit, reg] = await Promise.all([
    prisma.ativoCriticidade.findUnique({ where: { codApl }, select: { criticidade: true } }),
    prisma.ativoRegime.findUnique({ where: { codApl }, select: { horasPorDia: true } }),
  ]);

  return NextResponse.json({
    data: {
      codApl,
      criticidade: crit?.criticidade ?? null,
      regimeHorasDia: reg?.horasPorDia ?? null,
    },
  });
}

// ── DELETE /api/pcm/ativos/[codApl] ─────────────────────────────────────────
// Ativo com histórico ou vínculo (OS, SS, planos, medidores, filhos, máquina
// do SST, centro de trabalho do PCP) é INATIVADO — nunca apagado. Só um
// cadastro sem nada pendurado sai de fato.
export async function DELETE(_req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const codApl = lerCodApl(params.codApl);
  if (!codApl) return NextResponse.json({ error: "codApl inválido" }, { status: 400 });

  const ativo = await prisma.manutAtivo.findUnique({
    where: { codApl },
    select: {
      id: true,
      _count: { select: { ordens: true, solicitacoes: true, planos: true, medidores: true, filhos: true, planoTarefas: true, pecas: true } },
    },
  });
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });

  const [maquinas, centros, fechamentos] = await Promise.all([
    prisma.sstMaquina.count({ where: { codApl } }),
    prisma.centroTrabalho.count({ where: { codApl } }),
    prisma.fechamentoMtbf.count({ where: { codApl } }),
  ]);
  const c = ativo._count;
  const motivos = [
    c.ordens && `${c.ordens} OS`,
    c.solicitacoes && `${c.solicitacoes} solicitação(ões)`,
    c.planos + c.planoTarefas && "planos de manutenção",
    c.medidores && "medidores",
    c.filhos && `${c.filhos} ativo(s) abaixo na árvore`,
    c.pecas && "sobressalentes",
    maquinas && "máquina do SST",
    centros && "centro de trabalho do PCP",
    fechamentos && "fechamentos de MTBF",
  ].filter(Boolean) as string[];

  if (motivos.length > 0) {
    await prisma.manutAtivo.update({ where: { id: ativo.id }, data: { ativo: false } });
    return NextResponse.json({ data: { inativado: true, motivos } });
  }

  await prisma.$transaction([
    prisma.ativoCriticidade.deleteMany({ where: { codApl } }),
    prisma.ativoRegime.deleteMany({ where: { codApl } }),
    prisma.manutAtivo.delete({ where: { id: ativo.id } }),
  ]);
  return NextResponse.json({ data: { excluido: true } });
}
