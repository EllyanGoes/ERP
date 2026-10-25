export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { gerarPreventivas, vencimentoInicial } from "@/lib/manutencao/preventivas";
import {
  diasSemanaValidos, normalizarGatilho, normalizarHorario, normalizarRepeticao, normalizarUnidade, parseDia, usaCalendario, usaMedidor,
} from "@/lib/manutencao/gatilho";

type Ctx = { params: Promise<{ id: string }> };

const num = (v: unknown): number | null => (v === "" || v == null ? null : Number(v));
const inteiro = (v: unknown, min: number): number | null | "erro" => {
  const x = num(v);
  if (x == null) return null;
  return Number.isInteger(x) && x >= min ? x : "erro";
};

/**
 * Monta/valida os campos de gatilho da aplicação do plano ao ativo.
 *  • gatilho: CALENDARIO | MEDIDOR | AMBOS (o que vencer primeiro)
 *  • calendário (modelo Tractian): repeticao DIARIA | SEMANAL (diasSemana 0..6) | MENSAL (diaMes) |
 *    ANUAL | PERSONALIZADA (intervaloDias + unidadeIntervalo DIAS|SEMANAS|MESES + diasSemana opcionais);
 *    inicio (iniciar plano), horario "HH:MM", fimTipo NUNCA|DATA(fimData)|OCORRENCIAS(fimOcorrencias),
 *    agendarProxima SEMPRE|APOS_CONCLUSAO. proximoVencimento opcional ("próxima em"); sem ele,
 *    1ª ocorrência da regra a partir do início (ou hoje). Sem repeticao = legado por intervaloDias.
 *  • medidor: medidorId (do ativo), intervaloMedida, ultimaMedida?, proximaMedida?
 *    (sem ela: ultimaMedida + intervalo; sem ultimaMedida, parte da leitura atual),
 *    margemMedida? (quanto antes do marco a OS nasce; null = 10%).
 *  • comuns: vencimentoDias? (prazo da OS = programada + N), lembreteDias? (avisa N dias antes),
 *    responsavelIds (Usuario ids).
 */
async function gatilho(b: Record<string, unknown>, ativoId: string): Promise<Prisma.ManutPlanoAtivoUncheckedUpdateInput | string> {
  const g = normalizarGatilho(b.gatilho);
  const data: Prisma.ManutPlanoAtivoUncheckedUpdateInput = {
    gatilho: g,
    intervaloDias: null, unidadeIntervalo: "DIAS", proximoVencimento: null,
    repeticao: null, diasSemana: [], diaMes: null, horario: null, inicio: null,
    fimTipo: "NUNCA", fimData: null, fimOcorrencias: null, agendarProxima: "SEMPRE",
    medidorId: null, intervaloMedida: null, ultimaMedida: null, proximaMedida: null, margemMedida: null,
    vencimentoDias: null, lembreteDias: null, responsavelIds: [],
  };
  if ("ultimaExecucao" in b) data.ultimaExecucao = parseDia(typeof b.ultimaExecucao === "string" ? b.ultimaExecucao : null);

  if (usaCalendario(g)) {
    const rep = normalizarRepeticao(b.repeticao);
    const inicio = parseDia(typeof b.inicio === "string" ? b.inicio : null);
    const dias = diasSemanaValidos(b.diasSemana);
    const unidade = normalizarUnidade(b.unidadeIntervalo);
    const qtd = num(b.intervaloDias);
    if (rep === "SEMANAL" && !dias.length) return "Marque ao menos um dia da semana.";
    if (rep === "MENSAL") {
      const d = inteiro(b.diaMes, 1);
      if (d == null || d === "erro" || d > 31) return "Informe o dia do mês (1 a 31).";
      data.diaMes = d;
    }
    if (rep === "ANUAL" && !inicio) return "Informe quando o plano inicia — a repetição anual usa esse dia e mês.";
    if (rep === "PERSONALIZADA" || !rep) {
      if (qtd == null || !Number.isInteger(qtd) || qtd < 1) return "Informe o intervalo (ex.: a cada 2 semanas).";
      data.intervaloDias = qtd; data.unidadeIntervalo = unidade;
      if (unidade === "SEMANAS") data.diasSemana = dias;
    }
    if (rep === "SEMANAL") data.diasSemana = dias;
    if (b.horario != null && b.horario !== "" && !normalizarHorario(b.horario)) return "Horário inválido (use HH:MM).";
    data.repeticao = rep; data.inicio = inicio; data.horario = normalizarHorario(b.horario);

    const fimTipo = b.fimTipo === "DATA" || b.fimTipo === "OCORRENCIAS" ? b.fimTipo : "NUNCA";
    data.fimTipo = fimTipo;
    if (fimTipo === "DATA") {
      const fd = parseDia(typeof b.fimData === "string" ? b.fimData : null);
      if (!fd) return "Informe a data em que o plano encerra.";
      if (inicio && fd < inicio) return "A data de encerramento é anterior ao início do plano.";
      data.fimData = fd;
    }
    if (fimTipo === "OCORRENCIAS") {
      const fo = inteiro(b.fimOcorrencias, 1);
      if (fo == null || fo === "erro") return "Informe após quantas execuções o plano encerra.";
      data.fimOcorrencias = fo;
    }
    data.agendarProxima = b.agendarProxima === "APOS_CONCLUSAO" ? "APOS_CONCLUSAO" : "SEMPRE";

    const proximo = parseDia(typeof b.proximoVencimento === "string" ? b.proximoVencimento : null);
    const rec = { repeticao: rep, intervaloDias: data.intervaloDias as number | null, unidadeIntervalo: unidade, diasSemana: data.diasSemana as number[], diaMes: data.diaMes as number | null, inicio };
    data.proximoVencimento = proximo ?? vencimentoInicial(rec, (data.ultimaExecucao as Date | null) ?? null);
  }

  if (usaMedidor(g)) {
    const intervalo = num(b.intervaloMedida);
    if (!b.medidorId) return "Escolha o medidor (cadastre um horímetro no ativo).";
    const med = await prismaSemEscopo.manutMedidor.findFirst({ where: { id: String(b.medidorId), ativoId }, select: { id: true, acumulado: true, unidade: true } });
    if (!med) return "O medidor escolhido não é deste ativo.";
    if (intervalo == null || !Number.isFinite(intervalo) || intervalo <= 0) return `Informe o intervalo do medidor (ex.: a cada 250 ${med.unidade}).`;
    const ultimaMedida = num(b.ultimaMedida);
    if (ultimaMedida != null && (!Number.isFinite(ultimaMedida) || ultimaMedida < 0)) return "Leitura da última execução inválida.";
    const margem = num(b.margemMedida);
    if (margem != null && (!Number.isFinite(margem) || margem < 0)) return "A margem do medidor não pode ser negativa.";
    if (margem != null && margem >= intervalo) return "A margem precisa ser menor que o intervalo do medidor.";
    const proximaInformada = num(b.proximaMedida);
    if (proximaInformada != null && !Number.isFinite(proximaInformada)) return "Próximo marco do medidor inválido.";
    data.medidorId = med.id; data.intervaloMedida = intervalo; data.ultimaMedida = ultimaMedida; data.margemMedida = margem;
    data.proximaMedida = proximaInformada ?? (ultimaMedida ?? Number(med.acumulado)) + intervalo;
  }

  for (const k of ["vencimentoDias", "lembreteDias"] as const) {
    const v = inteiro(b[k], 0);
    if (v === "erro") return k === "vencimentoDias" ? "Prazo da OS inválido (dias após a data programada)." : "Lembrete inválido (dias antes).";
    data[k] = v;
  }
  const ids = Array.isArray(b.responsavelIds) ? Array.from(new Set(b.responsavelIds.filter((x: unknown) => typeof x === "string" && x))) as string[] : [];
  if (ids.length) {
    const existem = await prismaSemEscopo.usuario.count({ where: { id: { in: ids } } });
    if (existem !== ids.length) return "Há responsável que não existe mais.";
  }
  data.responsavelIds = ids;
  return data;
}

/** "Gerar agora" desta aplicação: reaproveita o gerador (só gera se já está na janela e sem OS aberta). */
async function gerarAgora(paId: string, usuario: string) {
  const prev = await gerarPreventivas({ previa: true, somente: [paId] });
  const item = prev.previa?.[0];
  if (!item) return { gerada: null, aviso: "A aplicação ainda não entrou na janela de geração (antecedência/margem) ou está encerrada." };
  if (item.bloqueio) return { gerada: null, aviso: `OS não gerada: ${item.bloqueio}${item.osAberta ? ` (${item.osAberta.numero})` : ""}.`, osAberta: item.osAberta };
  const r = await gerarPreventivas({ somente: [paId], usuario });
  return { gerada: r.geradas[0] ?? null, aviso: r.geradas[0] ? null : "OS não gerada." };
}

// POST { ativoId, gatilho, repeticao?, intervaloDias?, unidadeIntervalo?, diasSemana?, diaMes?, inicio?, horario?,
//        fimTipo?, fimData?, fimOcorrencias?, agendarProxima?, proximoVencimento?, ultimaExecucao?,
//        medidorId?, intervaloMedida?, ultimaMedida?, proximaMedida?, margemMedida?,
//        vencimentoDias?, lembreteDias?, responsavelIds?, gerarAgora? }
// → { data: { ...aplicação, geracao?: { gerada: { numero } | null, aviso: string | null } } }
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plano = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!plano) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const ativo = b.ativoId ? await prisma.manutAtivo.findUnique({ where: { id: b.ativoId }, select: { id: true } }) : null;
  if (!ativo) return NextResponse.json({ error: "Escolha o ativo." }, { status: 400 });
  const g = await gatilho(b, ativo.id);
  if (typeof g === "string") return NextResponse.json({ error: g }, { status: 400 });
  const pa = await prismaSemEscopo.manutPlanoAtivo.create({ data: { ...(g as Prisma.ManutPlanoAtivoUncheckedCreateInput), planoId: id, ativoId: ativo.id } });
  const geracao = b.gerarAgora ? await gerarAgora(pa.id, auth.session.nome) : undefined;
  return NextResponse.json({ data: { ...pa, geracao } }, { status: 201 });
}

// PATCH { paId, ...gatilho (quando vem "gatilho"), ativo?, zerarOcorrencias?, gerarAgora? }
// Só { paId, gerarAgora: true } = botão "gerar agora" da tabela, sem mexer no gatilho.
// → { ok: true, data: { geracao? } }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plano = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!plano) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const pa = await prismaSemEscopo.manutPlanoAtivo.findFirst({ where: { id: b.paId, planoId: id } });
  if (!pa) return NextResponse.json({ error: "Aplicação não encontrada." }, { status: 404 });
  let data: Prisma.ManutPlanoAtivoUncheckedUpdateInput = {};
  if ("gatilho" in b) {
    const g = await gatilho(b, pa.ativoId);
    if (typeof g === "string") return NextResponse.json({ error: g }, { status: 400 });
    data = g;
  }
  if ("ativo" in b) data.ativo = !!b.ativo;
  if (b.zerarOcorrencias) data.ocorrencias = 0;
  if (Object.keys(data).length) await prismaSemEscopo.manutPlanoAtivo.update({ where: { id: pa.id }, data });
  const geracao = b.gerarAgora ? await gerarAgora(pa.id, auth.session.nome) : undefined;
  return NextResponse.json({ ok: true, data: { geracao } });
}

// DELETE ?paId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plano = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!plano) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  await prismaSemEscopo.manutPlanoAtivo.deleteMany({ where: { id: req.nextUrl.searchParams.get("paId") ?? "", planoId: id } });
  return NextResponse.json({ ok: true });
}
