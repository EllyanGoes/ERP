import type { Prisma } from "@prisma/client";
import { prismaSemEscopo as db } from "@/lib/prisma";
import { criarOrdem } from "@/lib/manutencao/ordem";
import { notificarUsuario } from "@/lib/notificacoes";
import { DIA_MS, comHorario, diasAte, fmtDia, inicioDoDia, isoDia, parseDia, preverAplicacao, proximaOcorrencia, somarIntervalo, type Previsao } from "@/lib/manutencao/gatilho";

// ─────────────────────────────────────────────────────────────────────────────
// Gerador de OS preventivas (docs/manutencao-prd.md §5.4). Para cada aplicação
// ativa de plano: CALENDÁRIO gera quando faltam ≤ antecedência dias para o
// vencimento; MEDIDOR gera quando o acumulado chega a (marco − margem), margem
// = margemMedida ou 10% do intervalo; AMBOS gera no primeiro dos dois que
// chegar. Idempotente por (planoAtivoId, planoRef) e nunca empilha: se a OS
// anterior do mesmo plano×ativo ainda está aberta, não gera outra (ela aparece
// atrasada). Fim do plano (data / nº de execuções) encerra a aplicação
// (ativo=false). A OS nasce com horário, prazo (+vencimentoDias), responsável
// (1º responsável com colaborador) e os materiais do kit ligados à linha de
// serviço da atividade. Lembrete: avisa os responsáveis N dias antes (cron).
// As regras puras (recorrência, previsão, motivo) ficam em gatilho.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemPrevia = {
  planoAtivoId: string; plano: string; planoCodigo: string; ativo: string; gatilho: string;
  vencimento: string | null; medida: { alvo: number; atual: number; unidade: string } | null;
  atrasada: boolean; checklist: number; kit: number;
  /** Rota do plano (as aplicações da mesma rota saem numa OS só). */
  rota: string | null;
  /** Motivo legível de estar vencendo: "vence em 12/11", "faltam 18 h para 750 h", "atrasada 23 dias". */
  motivo: string;
  /** Qual lado disparou (CALENDARIO | MEDIDOR). */
  disparo: Previsao["disparo"];
  // null = vai gerar; senão o motivo de não gerar
  bloqueio: string | null; osAberta: { id: string; numero: string } | null;
};
export type ResultadoGeracao = {
  geradas: { numero: string; plano: string; ativo: string }[]; puladas: number;
  /** Aplicações encerradas nesta rodada (fim por data / execuções). */
  encerradas: number;
  /** Lembretes enviados aos responsáveis (só na rodada geral, sem `somente`). */
  lembretes: number;
  previa?: ItemPrevia[];
};

/**
 * `previa: true` não grava nada: devolve o que seria gerado (e o que fica de fora,
 * com o motivo). `somente`: gera só essas aplicações (planoAtivoId) da prévia.
 */
export async function gerarPreventivas(opts: { empresaId?: string; usuario?: string; ate?: Date; previa?: boolean; somente?: string[] } = {}): Promise<ResultadoGeracao> {
  const agora = opts.ate ?? new Date();
  const aplicacoes = await db.manutPlanoAtivo.findMany({
    where: {
      ativo: true, plano: { ativo: true, ...(opts.empresaId ? { empresaId: opts.empresaId } : {}) }, ativoRef: { ativo: true },
      ...(opts.somente ? { id: { in: opts.somente } } : {}),
    },
    include: {
      plano: { include: { tarefas: { orderBy: { seq: "asc" } }, materiais: { include: { item: { select: { descricao: true } } } } } },
      ativoRef: { select: { id: true, tag: true, nome: true, empresaId: true } },
      medidor: { select: { acumulado: true, unidade: true, leituras: { orderBy: { data: "desc" }, take: 12, select: { data: true, valor: true } } } },
    },
  });
  const res: ResultadoGeracao = { geradas: [], puladas: 0, encerradas: 0, lembretes: 0, ...(opts.previa ? { previa: [] } : {}) };
  type Aplicacao = (typeof aplicacoes)[number];
  const fila: Membro<Aplicacao>[] = [];
  // Aplicações de rota que ainda não venceram (candidatas a "puxar" para a OS da rota).
  const daRota: { pa: Aplicacao; prev: Previsao }[] = [];
  const osAberta = (paId: string) => db.manutOrdem.findFirst({
    where: { OR: [{ planoAtivoId: paId }, { planoAtivosRota: { has: paId } }], status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
    select: { id: true, numero: true },
  });
  for (const pa of aplicacoes) {
    const prev = preverAplicacao(pa, { antecedenciaDias: pa.plano.antecedenciaDias, leituras: pa.medidor?.leituras ?? [], agora });

    // Fim do plano atingido: encerra a aplicação (só na rodada que grava) e não gera.
    if (prev.encerrada) {
      if (!opts.previa) { await db.manutPlanoAtivo.update({ where: { id: pa.id }, data: { ativo: false } }); res.encerradas++; }
      continue;
    }
    // Lembrete aos responsáveis N dias antes do vencimento (rodada geral do cron).
    if (!opts.previa && !opts.somente) res.lembretes += await lembrar(pa, prev, agora);

    if (!prev.vencida || !prev.disparo) {
      if (pa.plano.rota && prev.calendario) daRota.push({ pa, prev });
      continue;
    }
    const m = membro(pa, prev, agora);
    const aberta = await osAberta(pa.id);
    const jaExiste = await db.manutOrdem.findFirst({ where: { OR: [{ planoAtivoId: pa.id, planoRef: m.ref }, { planoAtivosRota: { has: pa.id }, planoRef: m.ref }] }, select: { id: true, numero: true } });
    if (opts.previa) {
      res.previa!.push({
        planoAtivoId: pa.id, plano: pa.plano.nome, planoCodigo: pa.plano.codigo, ativo: `${pa.ativoRef.tag} ${pa.ativoRef.nome}`, gatilho: pa.gatilho,
        vencimento: prev.calendario?.vencimento ?? null,
        medida: prev.medidor ? { alvo: prev.medidor.alvo, atual: prev.medidor.atual, unidade: prev.medidor.unidade } : null,
        atrasada: prev.atrasada, motivo: m.revisao ? `${prev.motivo} · revisão ${m.revisao}` : prev.motivo, disparo: prev.disparo,
        checklist: m.tarefas.length, kit: m.materiais.length, rota: pa.plano.rota ?? null,
        bloqueio: aberta ? "já tem OS aberta deste plano no ativo" : jaExiste ? "OS deste vencimento já gerada" : null,
        osAberta: aberta ?? jaExiste ?? null,
      });
      continue;
    }
    if (aberta || jaExiste) { res.puladas++; continue; }
    fila.push(m);
  }
  if (opts.previa) return res;

  // Agrupa por rota (mesma empresa): uma OS para todos os pontos vencidos da rota.
  // Pontos da rota que vencem dentro de um ciclo (intervalo do próprio plano) são
  // puxados para a mesma OS — assim a rota se alinha e passa a vencer junta.
  const grupos = new Map<string, Membro<Aplicacao>[]>();
  for (const m of fila) {
    const k = m.pa.plano.rota ? `${m.pa.ativoRef.empresaId}|${m.pa.plano.rota.trim().toLowerCase()}` : m.pa.id;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  for (const [k, membros] of Array.from(grupos.entries())) {
    if (membros[0].pa.plano.rota && !opts.somente) {
      for (const c of daRota) {
        if (membros.some((x) => x.pa.id === c.pa.id) || `${c.pa.ativoRef.empresaId}|${c.pa.plano.rota!.trim().toLowerCase()}` !== k) continue;
        const venc = parseDia(c.prev.calendario!.vencimento);
        const ciclo = c.pa.intervaloDias ?? 7;
        if (!venc || diasAte(venc, agora) >= ciclo) continue;
        if (await osAberta(c.pa.id)) continue;
        membros.push(membro(c.pa, c.prev, agora));
      }
    }
    const ordem = await criarOsDosMembros(membros, opts.usuario);
    res.geradas.push({ numero: ordem.numero, plano: membros.length > 1 ? `Rota ${membros[0].pa.plano.rota}` : membros[0].pa.plano.nome, ativo: membros.map((x) => x.pa.ativoRef.tag).join(", ") });
  }
  return res;
}

type AplicacaoBase = {
  id: string; planoId: string; ativoId: string; gatilho: string; ocorrencias: number; intervaloDias: number | null; intervaloMedida: Prisma.Decimal | null;
  horario: string | null; vencimentoDias: number | null; responsavelIds: string[];
  plano: {
    codigo: string; nome: string; tipoId: string; equipeId: string | null; horasEstimadas: Prisma.Decimal | null; exigeParada: boolean; rota: string | null;
    tarefas: { id: string; descricao: string; servicoId: string | null; tipoResposta: string; faixaMin: Prisma.Decimal | null; faixaMax: Prisma.Decimal | null; ativoId: string | null; multiplo: number }[];
    materiais: { itemId: string; quantidade: Prisma.Decimal; tarefaId: string | null; multiplo: number; item: { descricao: string } }[];
  };
  ativoRef: { tag: string; nome: string; empresaId: string };
  medidor: { unidade: string } | null;
};
/** Uma aplicação vencida pronta para virar OS (sozinha ou dentro da OS da rota). */
type Membro<A extends AplicacaoBase = AplicacaoBase> = {
  pa: A; prev: Previsao; ref: string; programadaPara: Date; prazo: Date;
  /** Revisão escalonada ("1000 h") quando o plano tem atividades a cada N execuções. */
  revisao: string | null;
  tarefas: A["plano"]["tarefas"]; materiais: A["plano"]["materiais"];
};

/**
 * Execução nº desta geração. No medidor vem do marco (1000 h ÷ 250 h = 4ª) — fica
 * certo mesmo depois de rebasear o horímetro; no calendário, o contador de execuções.
 */
function execucaoN(pa: AplicacaoBase, prev: Previsao): number {
  const intervalo = pa.intervaloMedida != null ? Number(pa.intervaloMedida) : 0;
  if (prev.disparo === "MEDIDOR" && prev.medidor && intervalo > 0) return Math.max(1, Math.round(prev.medidor.alvo / intervalo));
  return pa.ocorrencias + 1;
}
const entraNa = (multiplo: number, n: number) => multiplo <= 1 || n % multiplo === 0;

function membro<A extends AplicacaoBase>(pa: A, prev: Previsao, agora: Date): Membro<A> {
  // Referência idempotente do ciclo: a data do vencimento (calendário) ou o marco do medidor.
  const ref = prev.disparo === "MEDIDOR" ? `M:${prev.medidor!.alvo}` : isoDia(parseDia(prev.calendario!.vencimento));
  // Calendário: programa para o vencimento (com o horário do plano); medidor: para já (o uso chegou).
  const dia = prev.disparo === "MEDIDOR" ? inicioDoDia(agora) : parseDia(prev.calendario!.vencimento)!;
  const programadaPara = comHorario(dia, pa.horario);
  const prazo = pa.vencimentoDias != null ? new Date(programadaPara.getTime() + pa.vencimentoDias * DIA_MS) : programadaPara;
  const n = execucaoN(pa, prev);
  // Atividades desta execução (escalonadas), sem repetir a mesma descrição.
  const vistas = new Set<string>();
  const tarefas = pa.plano.tarefas.filter((t) => {
    if (!(!t.ativoId || t.ativoId === pa.ativoId || t.tipoResposta !== "NENHUMA") || !entraNa(t.multiplo, n)) return false;
    const chave = t.descricao.trim().toLowerCase();
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  const idsTarefas = new Set(tarefas.map((t) => t.id));
  const materiais = pa.plano.materiais.filter((m) => (m.tarefaId ? idsTarefas.has(m.tarefaId) : entraNa(m.multiplo, n)));
  const escalonado = pa.plano.tarefas.some((t) => t.multiplo > 1) || pa.plano.materiais.some((m) => m.multiplo > 1);
  const revisao = !escalonado ? null
    : prev.disparo === "MEDIDOR" && prev.medidor ? `${fmtNumero(prev.medidor.alvo)} ${pa.medidor?.unidade ?? ""}`.trim()
    : `${n}ª execução`;
  return { pa, prev, ref, programadaPara, prazo, revisao, tarefas, materiais };
}
const fmtNumero = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Cria a OS de uma aplicação — ou a OS da rota, com um bloco de atividades por ponto. */
async function criarOsDosMembros(membros: Membro[], usuario?: string) {
  membros.sort((a, b) => a.programadaPara.getTime() - b.programadaPara.getTime());
  const [p1] = membros;
  const rota = membros.length > 1 ? p1.pa.plano.rota : null;
  // Responsável da OS: o 1º responsável da aplicação que tem colaborador vinculado.
  const respIds = Array.from(new Set(membros.flatMap((m) => m.pa.responsavelIds)));
  const responsavel = respIds.length
    ? await db.colaborador.findFirst({ where: { usuarioId: { in: respIds }, ativo: true }, select: { id: true } })
    : null;
  const horas = membros.reduce((t, m) => t + (m.pa.plano.horasEstimadas != null ? Number(m.pa.plano.horasEstimadas) : 0), 0);
  const ordem = await criarOrdem({
    empresaId: p1.pa.ativoRef.empresaId, ativoId: p1.pa.ativoId, tipoId: p1.pa.plano.tipoId,
    descricao: rota
      ? `Rota ${rota} — ${membros.map((m) => m.pa.ativoRef.tag).join(", ")}`
      : `${p1.pa.plano.nome}${p1.revisao ? ` · revisão ${p1.revisao}` : ""}`,
    equipeId: p1.pa.plano.equipeId, responsavelId: responsavel?.id ?? null,
    horasEstimadas: horas || null,
    exigeParada: membros.some((m) => m.pa.plano.exigeParada), programadaPara: p1.programadaPara,
    prazo: new Date(Math.max(...membros.map((m) => m.prazo.getTime()))),
    planoId: p1.pa.planoId, planoAtivoId: p1.pa.id, planoRef: p1.ref, planoAtivosRota: membros.slice(1).map((m) => m.pa.id),
    status: "PLANEJADA",
    usuario: usuario ?? "Gerador de preventivas",
    origem: rota
      ? `Rota ${rota} · ${membros.map((m) => `plano ${m.pa.plano.codigo} (${m.pa.ativoRef.tag})`).join(", ")}`
      : `Plano ${p1.pa.plano.codigo} · ${p1.prev.motivo}`,
  });
  // Checklist → linhas de serviço (uma a uma, p/ ligar os materiais da atividade).
  // Na rota, cada ponto abre com um título "TAG — plano".
  let seq = 0;
  for (const m of membros) {
    const servicoDaTarefa = new Map<string, string>();
    if (rota) {
      await db.manutOrdemServico.create({ data: { ordemId: ordem.id, seq: ++seq, descricao: `${m.pa.ativoRef.tag} — ${m.pa.plano.nome}`, tipoResposta: "NENHUMA" } });
    }
    for (const t of m.tarefas) {
      const s = await db.manutOrdemServico.create({
        data: { ordemId: ordem.id, seq: ++seq, descricao: t.descricao, servicoId: t.servicoId, tipoResposta: t.tipoResposta, faixaMin: t.faixaMin, faixaMax: t.faixaMax },
        select: { id: true },
      });
      servicoDaTarefa.set(t.id, s.id);
    }
    if (m.materiais.length) {
      await db.manutOrdemMaterial.createMany({
        data: m.materiais.map((x) => ({
          ordemId: ordem.id, itemId: x.itemId, descricao: x.item.descricao, quantidade: x.quantidade, origem: "PREVISTO",
          servicoId: x.tarefaId ? servicoDaTarefa.get(x.tarefaId) ?? null : null,
        })),
      });
    }
    await db.manutPlanoAtivo.update({ where: { id: m.pa.id }, data: { ocorrencias: { increment: 1 } } });
  }
  return ordem;
}

/** Avisa os responsáveis quando faltam exatamente `lembreteDias` para o vencimento (1× por dia). */
async function lembrar(
  pa: { id: string; planoId: string; lembreteDias: number | null; responsavelIds: string[]; plano: { codigo: string; nome: string }; ativoRef: { tag: string; nome: string } },
  prev: Previsao, agora: Date,
): Promise<number> {
  if (pa.lembreteDias == null || !pa.responsavelIds.length || !prev.calendario) return 0;
  const venc = parseDia(prev.calendario.vencimento)!;
  if (diasAte(venc, agora) !== pa.lembreteDias) return 0;
  const link = `/pcm/planos/cadastro/${pa.planoId}`;
  const tipo = "MANUT_LEMBRETE_PLANO";
  let enviados = 0;
  for (const usuarioId of pa.responsavelIds) {
    const jaHoje = await db.notificacao.findFirst({ where: { usuarioId, tipo, link, createdAt: { gte: inicioDoDia(agora) } }, select: { id: true } });
    if (jaHoje) continue;
    await notificarUsuario({
      usuarioId, tipo, link,
      titulo: `Preventiva ${pa.plano.codigo} em ${fmtDia(venc)}`,
      mensagem: `${pa.ativoRef.tag} ${pa.ativoRef.nome} — ${pa.plano.nome} vence em ${pa.lembreteDias} dia(s).`,
    });
    enviados++;
  }
  return enviados;
}

/**
 * Próximo vencimento ao (re)configurar uma aplicação de calendário.
 *  • Com recorrência (repeticao): 1ª ocorrência da regra a partir de `apos`
 *    (início do plano, ou hoje) — nunca antes do início.
 *  • Legado (sem repeticao): última execução + intervalo na unidade; sem última
 *    execução, vence hoje.
 */
export function vencimentoInicial(
  rec: { repeticao?: string | null; intervaloDias: number | null; unidadeIntervalo?: string | null; diasSemana?: number[] | null; diaMes?: number | null; inicio?: Date | string | null },
  ultimaExecucao: Date | null, agora = new Date(),
): Date {
  const porRegra = proximaOcorrencia(rec, parseDia(rec.inicio) ?? agora);
  if (porRegra) return porRegra;
  return ultimaExecucao && rec.intervaloDias ? somarIntervalo(ultimaExecucao, rec.intervaloDias, rec.unidadeIntervalo ?? "DIAS") : inicioDoDia(agora);
}
