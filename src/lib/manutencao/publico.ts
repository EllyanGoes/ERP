// ─────────────────────────────────────────────────────────────────────────────
// Página PÚBLICA do ativo (etiqueta QR colada na máquina → /ativo/<qrToken>).
// Qualquer pessoa com o celular vê o histórico, as OS abertas, a saúde e os
// planos do equipamento, e abre uma Solicitação de Serviço sem login.
//
// Sem sessão não há escopo de empresa: TUDO aqui usa `prismaSemEscopo` e filtra
// SEMPRE pelo ativo do token (e pela empresa dele). O que sai daqui é só o
// necessário para a página — nada de custos, nomes de pessoas ou ids internos.
// Regras de saúde = as da tela Indicadores (lib/manutencao/confiabilidade.ts):
// falha = WHERE_FALHA_MTBF, parada = janela paradaInicio→paradaFim,
// funcionamento = dias × horasPorDia (herdado do pai; padrão 24).
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from "crypto";
import { prismaSemEscopo } from "@/lib/prisma";
import { STATUS_ABERTOS, dataReferenciaOS, horasParada, wherePeriodoOS } from "@/lib/manutencao/consultas";
import { WHERE_FALHA_MTBF, calcMtbf, calcMttr } from "@/lib/pcm-mtbf";
import { descreverGatilho, fmtDia, inicioDoDia, usaCalendario, usaMedidor } from "@/lib/manutencao/gatilho";

const DIA = 86_400_000;
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export const TIPO_ATIVO_LABEL: Record<string, string> = {
  EQUIPAMENTO: "Equipamento", COMPONENTE: "Componente", VEICULO: "Veículo", LOCAL: "Local / área",
};

/** Status da OS em linguagem de chão de fábrica (sem jargão de PCM). */
export const STATUS_OS_PUBLICO: Record<string, string> = {
  ABERTA: "Aguardando programação",
  PLANEJADA: "Programada",
  EM_EXECUCAO: "Em execução",
  PAUSADA: "Pausada",
  AGUARDANDO_MATERIAL: "Aguardando material",
  AGUARDANDO_TERCEIRO: "Aguardando terceiro",
  ENCERRADA: "Executada — em validação",
};

export type SaudePeriodo = {
  dias: number;
  falhas: number;
  horasParada: number;
  horasFuncionamento: number;
  mtbf: number | null; // h
  mttr: number | null; // h
  disponibilidade: number | null; // 0–1
  confiabilidade30d: number | null; // 0–1 — e^(−720/MTBF)
};

export type StatusAgora = {
  codigo: "PARADO" | "MANUTENCAO" | "ATENCAO" | "OPERANDO";
  titulo: string;
  detalhe: string | null;
  desde: string | null; // ISO
};

export type DadosAtivoPublico = {
  empresa: string;
  ativo: {
    tag: string; nome: string; tipo: string; caminho: string[];
    localizacao: string | null; fabricante: string | null; modelo: string | null; numeroSerie: string | null;
    anoFabricacao: number | null; criticidade: string | null; horasPorDia: number;
  };
  status: StatusAgora;
  saude: { d90: SaudePeriodo; m12: SaudePeriodo; meses: { label: string; falhas: number; horasParada: number }[] };
  ordensAbertas: {
    numero: string; tipoSigla: string; tipoNome: string; status: string; statusLabel: string; prioridade: string;
    abertaEm: string; programadaPara: string | null; prazo: string | null; atrasada: boolean; paradaDesde: string | null; descricao: string;
  }[];
  ultimas: {
    numero: string; data: string; tipoSigla: string; tipoNome: string; descricao: string;
    servicos: string[]; falhas: { sintoma: string | null; causa: string | null }[]; horasParada: number;
  }[];
  planos: {
    nome: string; tipoSigla: string; tipoNome: string; gatilho: string;
    ultimaExecucao: string | null; proxima: string; vencido: boolean;
  }[];
  solicitacoesAbertas: { numero: string; descricao: string; ativoParado: boolean; createdAt: string }[];
};

/** Ativo do token (ativo = true). null = etiqueta inválida ou desativada. */
export async function ativoPorToken(token: string) {
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;
  const a = await prismaSemEscopo.manutAtivo.findUnique({
    where: { qrToken: token.toLowerCase() },
    select: { id: true, empresaId: true, ativo: true, tag: true, nome: true },
  });
  return a && a.ativo ? a : null;
}

function saude(ordens: { programadaPara: Date | null; createdAt: Date; paradaInicio: Date | null; paradaFim: Date | null }[], de: Date, ate: Date, hpd: number): SaudePeriodo {
  const dias = Math.round((ate.getTime() - de.getTime()) / DIA);
  let falhas = 0, parada = 0;
  for (const o of ordens) {
    const ref = dataReferenciaOS(o);
    if (ref < de || ref > ate) continue;
    falhas += 1;
    parada += horasParada(o);
  }
  const func = dias * hpd;
  const mtbf = calcMtbf(func, parada, falhas);
  return {
    dias, falhas,
    horasParada: round1(parada)!,
    horasFuncionamento: func,
    mtbf: round1(mtbf),
    mttr: round1(calcMttr(parada, falhas)),
    disponibilidade: func > 0 ? Math.max(0, (func - parada) / func) : null,
    confiabilidade30d: mtbf != null && mtbf > 0 ? Math.exp(-720 / mtbf) : null,
  };
}

/** Tudo o que a página pública mostra. null = token inválido / ativo inativo. */
export async function dadosAtivoPublico(token: string): Promise<DadosAtivoPublico | null> {
  const base = await ativoPorToken(token);
  if (!base) return null;
  const db = prismaSemEscopo;
  const ativoId = base.id;
  const empresaId = base.empresaId;
  const agora = new Date();
  const de12 = new Date(agora.getTime() - 365 * DIA);
  const de90 = new Date(agora.getTime() - 90 * DIA);

  const [ativo, empresa, abertas, falhas, concluidas, planos, ss] = await Promise.all([
    db.manutAtivo.findFirst({
      where: { id: ativoId, empresaId },
      select: {
        tag: true, nome: true, tipo: true, status: true, paiId: true, horasPorDia: true, criticidade: true,
        localizacao: true, fabricante: true, modelo: true, numeroSerie: true, anoFabricacao: true,
      },
    }),
    db.empresa.findUnique({ where: { id: empresaId }, select: { nomeFantasia: true, razaoSocial: true } }),
    db.manutOrdem.findMany({
      where: { ativoId, empresaId, status: { in: STATUS_ABERTOS } },
      orderBy: [{ programadaPara: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 30,
      select: {
        numero: true, status: true, prioridade: true, descricao: true, createdAt: true, programadaPara: true, prazo: true,
        paradaInicio: true, paradaFim: true, tipo: { select: { sigla: true, nome: true } },
      },
    }),
    db.manutOrdem.findMany({
      where: { AND: [WHERE_FALHA_MTBF, wherePeriodoOS(de12, agora), { ativoId, empresaId }] },
      select: { programadaPara: true, createdAt: true, paradaInicio: true, paradaFim: true },
    }),
    db.manutOrdem.findMany({
      where: { ativoId, empresaId, status: "CONCLUIDA" },
      orderBy: [{ concluidaEm: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 10,
      select: {
        numero: true, descricao: true, concluidaEm: true, encerradaEm: true, programadaPara: true, createdAt: true,
        paradaInicio: true, paradaFim: true, tipo: { select: { sigla: true, nome: true } },
        servicos: {
          orderBy: { seq: "asc" },
          select: {
            descricao: true, tipoResposta: true,
            servico: { select: { descricao: true } }, sintoma: { select: { descricao: true } }, causa: { select: { descricao: true } },
          },
        },
      },
    }),
    db.manutPlanoAtivo.findMany({
      where: { ativoId, ativo: true, plano: { ativo: true, empresaId } },
      select: {
        gatilho: true, intervaloDias: true, unidadeIntervalo: true, intervaloMedida: true, margemMedida: true,
        ultimaExecucao: true, proximoVencimento: true, proximaMedida: true,
        medidor: { select: { nome: true, unidade: true, acumulado: true } },
        plano: { select: { nome: true, tipo: { select: { sigla: true, nome: true } } } },
      },
    }),
    // SS ainda sem triagem — a página mostra antes do formulário p/ evitar duplicata.
    db.manutSolicitacao.findMany({
      where: { ativoId, empresaId, status: "ABERTA" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { numero: true, descricao: true, ativoParado: true, paradoDesde: true, createdAt: true },
    }),
  ]);
  if (!ativo) return null;

  // Caminho na árvore (Planta › Área › …) e horas/dia herdadas do pai.
  const caminho: string[] = [];
  let hpd: number | null = ativo.horasPorDia != null && ativo.horasPorDia > 0 ? ativo.horasPorDia : null;
  let paiId = ativo.paiId;
  for (let i = 0; paiId && i < 15; i++) {
    const pai = await db.manutAtivo.findFirst({ where: { id: paiId, empresaId }, select: { nome: true, paiId: true, horasPorDia: true } });
    if (!pai) break;
    caminho.unshift(pai.nome);
    if (hpd == null && pai.horasPorDia != null && pai.horasPorDia > 0) hpd = pai.horasPorDia;
    paiId = pai.paiId;
  }
  const horasPorDia = hpd ?? 24;

  // ── Saúde ────────────────────────────────────────────────────────────────
  const d90 = saude(falhas, de90, agora, horasPorDia);
  const m12 = saude(falhas, de12, agora, horasPorDia);
  const meses: { label: string; falhas: number; horasParada: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    let f = 0, p = 0;
    for (const o of falhas) {
      const ref = dataReferenciaOS(o);
      if (ref >= ini && ref < fim) { f += 1; p += horasParada(o); }
    }
    meses.push({ label: `${MESES[ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`, falhas: f, horasParada: round1(p)! });
  }

  // ── OS abertas ───────────────────────────────────────────────────────────
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const ordensAbertas = abertas.map((o) => {
    // Atrasada: passou do prazo, ou (sem prazo) a data programada já passou. Executada (ENCERRADA) não atrasa.
    const atrasada = o.status !== "ENCERRADA" && (o.prazo ? o.prazo < agora : !!o.programadaPara && o.programadaPara < hoje);
    return {
      numero: o.numero, tipoSigla: o.tipo.sigla, tipoNome: o.tipo.nome, status: o.status,
      statusLabel: STATUS_OS_PUBLICO[o.status] ?? o.status, prioridade: o.prioridade,
      abertaEm: o.createdAt.toISOString(), programadaPara: o.programadaPara?.toISOString() ?? null, prazo: o.prazo?.toISOString() ?? null,
      atrasada, paradaDesde: o.paradaInicio && !o.paradaFim ? o.paradaInicio.toISOString() : null,
      descricao: o.descricao.length > 280 ? `${o.descricao.slice(0, 277)}…` : o.descricao,
    };
  });

  // ── Planos ───────────────────────────────────────────────────────────────
  const hojeUtc = inicioDoDia(agora);
  const planosOut = planos.map((pa) => {
    const venceCal = usaCalendario(pa.gatilho) && !!pa.proximoVencimento && pa.proximoVencimento < hojeUtc;
    const acumulado = pa.medidor ? Number(pa.medidor.acumulado) : null;
    const venceMed = usaMedidor(pa.gatilho) && pa.proximaMedida != null && acumulado != null && acumulado >= Number(pa.proximaMedida);
    const partes: string[] = [];
    if (usaCalendario(pa.gatilho) && pa.proximoVencimento) partes.push(fmtDia(pa.proximoVencimento));
    if (usaMedidor(pa.gatilho) && pa.proximaMedida != null) {
      const un = pa.medidor?.unidade ?? "";
      partes.push(`${Number(pa.proximaMedida).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${un}`.trim()
        + (acumulado != null ? ` (atual ${acumulado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${un})`.trimEnd() : ""));
    }
    return {
      nome: pa.plano.nome, tipoSigla: pa.plano.tipo.sigla, tipoNome: pa.plano.tipo.nome,
      gatilho: descreverGatilho({
        gatilho: pa.gatilho, intervaloDias: pa.intervaloDias, unidadeIntervalo: pa.unidadeIntervalo,
        intervaloMedida: pa.intervaloMedida, margemMedida: pa.margemMedida,
        proximoVencimento: pa.proximoVencimento, proximaMedida: pa.proximaMedida, medidor: pa.medidor,
      }),
      ultimaExecucao: pa.ultimaExecucao ? fmtDia(pa.ultimaExecucao) : null,
      proxima: partes.join(" ou ") || "—",
      vencido: venceCal || venceMed,
    };
  }).sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.nome.localeCompare(b.nome, "pt-BR"));

  // ── Últimas manutenções ──────────────────────────────────────────────────
  const ultimas = concluidas.map((o) => {
    const linhas = o.servicos.filter((s) => s.tipoResposta === "NENHUMA");
    const servicos = Array.from(new Set(linhas.map((s) => s.servico?.descricao || s.descricao).filter((t): t is string => !!t && t.trim() !== ""))).slice(0, 5);
    const falhasOs = linhas
      .filter((s) => s.sintoma || s.causa)
      .map((s) => ({ sintoma: s.sintoma?.descricao ?? null, causa: s.causa?.descricao ?? null }));
    const data = o.concluidaEm ?? o.encerradaEm ?? dataReferenciaOS(o);
    return {
      numero: o.numero, data: data.toISOString(), tipoSigla: o.tipo.sigla, tipoNome: o.tipo.nome,
      descricao: o.descricao.length > 280 ? `${o.descricao.slice(0, 277)}…` : o.descricao,
      servicos, falhas: falhasOs.slice(0, 3), horasParada: round1(horasParada(o))!,
    };
  });

  // ── Status agora ─────────────────────────────────────────────────────────
  const paradas = abertas.filter((o) => o.paradaInicio && !o.paradaFim).map((o) => o.paradaInicio!.getTime());
  // SS vem da mais nova p/ a mais antiga — a parada conta da primeira que avisou.
  const ssParada = [...ss].reverse().find((s) => s.ativoParado);
  let status: StatusAgora;
  if (ativo.status === "PARADO" || paradas.length > 0) {
    const desde = paradas.length > 0 ? new Date(Math.min(...paradas)) : null;
    status = { codigo: "PARADO", titulo: "Parado", detalhe: "A Manutenção está cuidando desta parada.", desde: desde?.toISOString() ?? null };
  } else if (ssParada) {
    status = {
      codigo: "PARADO", titulo: "Parado",
      detalhe: `Parada informada na ${ssParada.numero} — aguardando a Manutenção.`,
      desde: (ssParada.paradoDesde ?? ssParada.createdAt).toISOString(),
    };
  } else if (abertas.some((o) => o.status === "EM_EXECUCAO")) {
    const n = abertas.filter((o) => o.status === "EM_EXECUCAO").length;
    status = { codigo: "MANUTENCAO", titulo: "Em manutenção", detalhe: `${n} ordem${n > 1 ? "s" : ""} de serviço em execução agora.`, desde: null };
  } else if (ordensAbertas.some((o) => o.atrasada) || planosOut.some((p) => p.vencido)) {
    const nOs = ordensAbertas.filter((o) => o.atrasada).length;
    const nPl = planosOut.filter((p) => p.vencido).length;
    const partes = [
      nOs > 0 ? `${nOs} OS atrasada${nOs > 1 ? "s" : ""}` : null,
      nPl > 0 ? `${nPl} preventiva${nPl > 1 ? "s" : ""} vencida${nPl > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    status = { codigo: "ATENCAO", titulo: "Atenção", detalhe: `Operando, mas com ${partes.join(" e ")}.`, desde: null };
  } else {
    status = { codigo: "OPERANDO", titulo: "Operando", detalhe: "Sem paradas nem pendências vencidas.", desde: null };
  }

  return {
    empresa: empresa?.nomeFantasia || empresa?.razaoSocial || "",
    ativo: {
      tag: ativo.tag, nome: ativo.nome, tipo: TIPO_ATIVO_LABEL[ativo.tipo] ?? ativo.tipo, caminho,
      localizacao: ativo.localizacao, fabricante: ativo.fabricante, modelo: ativo.modelo, numeroSerie: ativo.numeroSerie,
      anoFabricacao: ativo.anoFabricacao, criticidade: ativo.criticidade, horasPorDia,
    },
    status,
    saude: { d90, m12, meses },
    ordensAbertas,
    ultimas,
    planos: planosOut,
    solicitacoesAbertas: ss.map((s) => ({
      numero: s.numero, ativoParado: s.ativoParado, createdAt: s.createdAt.toISOString(),
      descricao: s.descricao.length > 200 ? `${s.descricao.slice(0, 197)}…` : s.descricao,
    })),
  };
}

/** Código novo da etiqueta: 32 hex aleatórios (trocar invalida a etiqueta antiga). */
export function novoQrToken(): string {
  return randomBytes(16).toString("hex");
}
