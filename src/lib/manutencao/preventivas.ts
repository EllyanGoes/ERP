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
  for (const pa of aplicacoes) {
    const prev = preverAplicacao(pa, { antecedenciaDias: pa.plano.antecedenciaDias, leituras: pa.medidor?.leituras ?? [], agora });

    // Fim do plano atingido: encerra a aplicação (só na rodada que grava) e não gera.
    if (prev.encerrada) {
      if (!opts.previa) { await db.manutPlanoAtivo.update({ where: { id: pa.id }, data: { ativo: false } }); res.encerradas++; }
      continue;
    }
    // Lembrete aos responsáveis N dias antes do vencimento (rodada geral do cron).
    if (!opts.previa && !opts.somente) res.lembretes += await lembrar(pa, prev, agora);

    if (!prev.vencida || !prev.disparo) continue;
    // Referência idempotente do ciclo: a data do vencimento (calendário) ou o marco do medidor.
    const ref = prev.disparo === "CALENDARIO" ? isoDia(parseDia(prev.calendario!.vencimento)) : `M:${prev.medidor!.alvo}`;
    // Calendário: programa para o vencimento (com o horário do plano); medidor: para já (o uso chegou).
    const dia = prev.disparo === "CALENDARIO" ? parseDia(prev.calendario!.vencimento)! : inicioDoDia(agora);
    const programadaPara = comHorario(dia, pa.horario);
    const prazo = pa.vencimentoDias != null ? new Date(programadaPara.getTime() + pa.vencimentoDias * DIA_MS) : programadaPara;

    const aberta = await db.manutOrdem.findFirst({ where: { planoAtivoId: pa.id, status: { notIn: ["CONCLUIDA", "CANCELADA"] } }, select: { id: true, numero: true } });
    const jaExiste = await db.manutOrdem.findFirst({ where: { planoAtivoId: pa.id, planoRef: ref }, select: { id: true, numero: true } });
    if (opts.previa) {
      res.previa!.push({
        planoAtivoId: pa.id, plano: pa.plano.nome, planoCodigo: pa.plano.codigo, ativo: `${pa.ativoRef.tag} ${pa.ativoRef.nome}`, gatilho: pa.gatilho,
        vencimento: prev.calendario?.vencimento ?? null,
        medida: prev.medidor ? { alvo: prev.medidor.alvo, atual: prev.medidor.atual, unidade: prev.medidor.unidade } : null,
        atrasada: prev.atrasada, motivo: prev.motivo, disparo: prev.disparo,
        checklist: pa.plano.tarefas.length, kit: pa.plano.materiais.length,
        bloqueio: aberta ? "já tem OS aberta deste plano no ativo" : jaExiste ? "OS deste vencimento já gerada" : null,
        osAberta: aberta ?? jaExiste ?? null,
      });
      continue;
    }
    if (aberta || jaExiste) { res.puladas++; continue; }

    // Responsável da OS: o 1º responsável da aplicação que tem colaborador vinculado.
    const responsavel = pa.responsavelIds.length
      ? await db.colaborador.findFirst({ where: { usuarioId: { in: pa.responsavelIds }, ativo: true }, select: { id: true } })
      : null;
    const ordem = await criarOrdem({
      empresaId: pa.ativoRef.empresaId, ativoId: pa.ativoId, tipoId: pa.plano.tipoId,
      descricao: pa.plano.nome, equipeId: pa.plano.equipeId, responsavelId: responsavel?.id ?? null,
      horasEstimadas: pa.plano.horasEstimadas != null ? Number(pa.plano.horasEstimadas) : null,
      exigeParada: pa.plano.exigeParada, programadaPara, prazo,
      planoId: pa.planoId, planoAtivoId: pa.id, planoRef: ref, status: "PLANEJADA",
      usuario: opts.usuario ?? "Gerador de preventivas", origem: `Plano ${pa.plano.codigo} · ${prev.motivo}`,
    });
    // Checklist → linhas de serviço (uma a uma, p/ ligar os materiais da atividade).
    const servicoDaTarefa = new Map<string, string>();
    const tarefas = pa.plano.tarefas.filter((t) => !t.ativoId || t.ativoId === pa.ativoId || t.tipoResposta !== "NENHUMA");
    for (let i = 0; i < tarefas.length; i++) {
      const t = tarefas[i];
      const s = await db.manutOrdemServico.create({
        data: { ordemId: ordem.id, seq: i + 1, descricao: t.descricao, servicoId: t.servicoId, tipoResposta: t.tipoResposta, faixaMin: t.faixaMin, faixaMax: t.faixaMax },
        select: { id: true },
      });
      servicoDaTarefa.set(t.id, s.id);
    }
    if (pa.plano.materiais.length) {
      await db.manutOrdemMaterial.createMany({
        data: pa.plano.materiais.map((m) => ({
          ordemId: ordem.id, itemId: m.itemId, descricao: m.item.descricao, quantidade: m.quantidade, origem: "PREVISTO",
          servicoId: m.tarefaId ? servicoDaTarefa.get(m.tarefaId) ?? null : null,
        })),
      });
    }
    await db.manutPlanoAtivo.update({ where: { id: pa.id }, data: { ocorrencias: { increment: 1 } } });
    res.geradas.push({ numero: ordem.numero, plano: pa.plano.nome, ativo: `${pa.ativoRef.tag} ${pa.ativoRef.nome}` });
  }
  return res;
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
