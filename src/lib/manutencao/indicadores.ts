import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";
import { getAgregadoMensal, diasNoMes } from "@/lib/pcm-mtbf";

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores do painel e dos relatórios de Manutenção (docs/manutencao-prd.md
// §5.6). Tudo pelo client ESCOPADO (empresa ativa). Custo do mês = OS
// CONCLUÍDAS no mês (MO + material + terceiros).
// ─────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;
/** Jornada semanal usada como capacidade de cada membro de equipe interna (h). */
export const HORAS_SEMANA_MEMBRO = 44;

const custo = (o: { custoMaoObra: unknown; custoMaterial: unknown; custoTerceiros: unknown }) =>
  Number(o.custoMaoObra) + Number(o.custoMaterial) + Number(o.custoTerceiros);

export async function painelManutencao(agora = new Date()) {
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicio12 = new Date(agora.getFullYear(), agora.getMonth() - 11, 1);
  const inicio30 = new Date(agora.getTime() - 30 * DIA);

  const [parados, abertas, ssAbertas, concluidas12, criadas30, equipes, planoMes, criticos] = await Promise.all([
    prisma.manutAtivo.findMany({
      where: { status: "PARADO" },
      select: {
        id: true, codApl: true, tag: true, nome: true,
        ordens: { where: { paradaInicio: { not: null }, paradaFim: null, status: { not: "CANCELADA" } }, select: { id: true, numero: true, paradaInicio: true }, orderBy: { paradaInicio: "asc" }, take: 1 },
      },
    }),
    prisma.manutOrdem.findMany({
      where: { status: { in: STATUS_ABERTOS } },
      select: {
        id: true, numero: true, status: true, prioridade: true, descricao: true, prazo: true, programadaPara: true, horasEstimadas: true, equipeId: true, createdAt: true,
        ativo: { select: { tag: true, nome: true } }, tipo: { select: { natureza: true } },
      },
    }),
    prisma.manutSolicitacao.findMany({ where: { status: "ABERTA" }, select: { ativoParado: true, prioridade: true } }),
    prisma.manutOrdem.findMany({
      where: { status: "CONCLUIDA", concluidaEm: { gte: inicio12 } },
      select: { concluidaEm: true, custoMaoObra: true, custoMaterial: true, custoTerceiros: true },
    }),
    prisma.manutOrdem.findMany({ where: { createdAt: { gte: inicio30 }, status: { not: "CANCELADA" } }, select: { tipo: { select: { natureza: true } } } }),
    prisma.manutEquipe.findMany({ where: { ativo: true, externa: false }, select: { id: true, nome: true, _count: { select: { membros: true } } } }),
    // Preventivas/inspeções de plano com vencimento no mês até hoje — base da aderência.
    prisma.manutOrdem.findMany({
      where: { planoId: { not: null }, status: { not: "CANCELADA" }, programadaPara: { gte: inicioMes, lt: new Date(hoje.getTime() + DIA) } },
      select: { programadaPara: true, concluidaEm: true, status: true, planoAtivoId: true, plano: { select: { toleranciaPct: true } } },
    }),
    prisma.ativoCriticidade.findMany({ where: { criticidade: "A" }, select: { codApl: true } }),
  ]);

  // Aderência: concluída até o vencimento + tolerância (% do intervalo, mín. 1 dia).
  const intervalos = new Map(
    (await prisma.manutPlano.findMany({ select: { ativos: { select: { id: true, intervaloDias: true } } } }))
      .flatMap((p) => p.ativos.map((a) => [a.id, a.intervaloDias ?? 30] as const)),
  );
  let noPrazo = 0;
  for (const o of planoMes) {
    if (o.status !== "CONCLUIDA" || !o.concluidaEm || !o.programadaPara) continue;
    const tolDias = Math.max(1, ((intervalos.get(o.planoAtivoId ?? "") ?? 30) * (o.plano?.toleranciaPct ?? 10)) / 100);
    if (o.concluidaEm.getTime() <= o.programadaPara.getTime() + tolDias * DIA) noPrazo++;
  }

  // Backlog em semanas por equipe interna (OS sem estimativa contam 2 h).
  const SEM_ESTIMATIVA_H = 2;
  const horasPorEquipe = new Map<string, number>();
  let semEstimativa = 0;
  for (const o of abertas) {
    if (o.status === "ENCERRADA") continue;
    const h = o.horasEstimadas != null ? Number(o.horasEstimadas) : (semEstimativa++, SEM_ESTIMATIVA_H);
    horasPorEquipe.set(o.equipeId ?? "", (horasPorEquipe.get(o.equipeId ?? "") ?? 0) + h);
  }
  const backlogEquipes = equipes
    .map((e) => {
      const horas = horasPorEquipe.get(e.id) ?? 0;
      const capacidade = e._count.membros * HORAS_SEMANA_MEMBRO;
      return { id: e.id, nome: e.nome, horas, membros: e._count.membros, semanas: capacidade > 0 ? horas / capacidade : null };
    })
    .filter((e) => e.horas > 0)
    .sort((a, b) => b.horas - a.horas);
  const horasBacklog = Array.from(horasPorEquipe.values()).reduce((s, h) => s + h, 0);
  const capacidadeTotal = equipes.reduce((s, e) => s + e._count.membros * HORAS_SEMANA_MEMBRO, 0);

  // Custo mensal (12 meses)
  const meses: { chave: string; label: string; maoObra: number; material: number; terceiros: number; total: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(inicio12.getFullYear(), inicio12.getMonth() + i, 1);
    meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/").replace(".", ""), maoObra: 0, material: 0, terceiros: 0, total: 0 });
  }
  const porChave = new Map(meses.map((m) => [m.chave, m]));
  for (const o of concluidas12) {
    const m = porChave.get(`${o.concluidaEm!.getFullYear()}-${o.concluidaEm!.getMonth()}`);
    if (!m) continue;
    m.maoObra += Number(o.custoMaoObra); m.material += Number(o.custoMaterial); m.terceiros += Number(o.custoTerceiros); m.total += custo(o);
  }
  const anteriores = meses.slice(5, 11).map((m) => m.total);
  const mediaSeisMeses = anteriores.reduce((s, v) => s + v, 0) / (anteriores.length || 1);

  // Disponibilidade dos críticos A no mês corrente (até hoje).
  let disponibilidade: { ativos: number; horasParada: number; falhas: number; percentual: number | null } = { ativos: 0, horasParada: 0, falhas: 0, percentual: null };
  const codA = criticos.map((c) => c.codApl);
  if (codA.length) {
    const ativosA = await prisma.manutAtivo.findMany({ where: { codApl: { in: codA }, ativo: true }, select: { codApl: true } });
    const regimes = new Map((await prisma.ativoRegime.findMany({ where: { codApl: { in: codA } } })).map((r) => [r.codApl, r.horasPorDia]));
    const ag = await getAgregadoMensal(agora.getFullYear(), agora.getMonth() + 1, ativosA.map((a) => a.codApl));
    const diasCorridos = Math.min(agora.getDate(), diasNoMes(agora.getFullYear(), agora.getMonth() + 1));
    const funcionamento = ativosA.reduce((s, a) => s + diasCorridos * (regimes.get(a.codApl) ?? 24), 0);
    const parada = ag.reduce((s, a) => s + a.horasParada, 0);
    disponibilidade = {
      ativos: ativosA.length, horasParada: parada, falhas: ag.reduce((s, a) => s + a.numeroFalhas, 0),
      percentual: funcionamento > 0 ? Math.max(0, (funcionamento - parada) / funcionamento) : null,
    };
  }

  const atrasadas = abertas.filter((o) => o.status !== "ENCERRADA" && (o.prazo ?? o.programadaPara) && (o.prazo ?? o.programadaPara)! < hoje);
  const corretivas30 = criadas30.filter((o) => o.tipo.natureza === "CORRETIVA").length;
  const ordemPrio: Record<string, number> = { EMERGENCIA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };

  return {
    parados: parados.map((a) => ({ id: a.id, codApl: a.codApl, tag: a.tag, nome: a.nome, os: a.ordens[0] ?? null })),
    ss: { aguardando: ssAbertas.length, urgentes: ssAbertas.filter((s) => s.ativoParado || s.prioridade === "EMERGENCIA").length },
    os: {
      abertas: abertas.filter((o) => o.status !== "ENCERRADA").length,
      aValidar: abertas.filter((o) => o.status === "ENCERRADA").length,
      atrasadas: atrasadas.length,
      emergencia: abertas.filter((o) => o.prioridade === "EMERGENCIA" && o.status !== "ENCERRADA").length,
      urgentes: abertas
        .filter((o) => o.status !== "ENCERRADA" && (["EMERGENCIA", "ALTA"].includes(o.prioridade) || atrasadas.includes(o)))
        .sort((a, b) => (ordemPrio[a.prioridade] ?? 9) - (ordemPrio[b.prioridade] ?? 9) || a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, 10)
        .map((o) => ({ id: o.id, numero: o.numero, status: o.status, prioridade: o.prioridade, descricao: o.descricao, prazo: o.prazo ?? o.programadaPara, atrasada: atrasadas.includes(o), ativo: o.ativo })),
    },
    backlog: { horas: horasBacklog, capacidadeSemanal: capacidadeTotal, semanas: capacidadeTotal > 0 ? horasBacklog / capacidadeTotal : null, semEstimativa, equipes: backlogEquipes },
    aderencia: { vencidas: planoMes.length, noPrazo, percentual: planoMes.length ? noPrazo / planoMes.length : null },
    mix30: { total: criadas30.length, corretivas: corretivas30, percentualCorretiva: criadas30.length ? corretivas30 / criadas30.length : null },
    custo: { meses, mesAtual: meses[11].total, mediaSeisMeses },
    disponibilidadeA: disponibilidade,
  };
}

/** Relatórios do período (OS concluídas): custo por ativo/centro/tipo/equipe, Pareto de falhas e horas por executante. */
export async function relatoriosManutencao(de: Date, ate: Date) {
  const ordens = await prisma.manutOrdem.findMany({
    where: { status: "CONCLUIDA", concluidaEm: { gte: de, lte: ate } },
    select: {
      id: true, custoMaoObra: true, custoMaterial: true, custoTerceiros: true,
      ativo: { select: { id: true, codApl: true, tag: true, nome: true } },
      centroCusto: { select: { codigo: true, nome: true } },
      tipo: { select: { sigla: true, nome: true, natureza: true, contaComoFalha: true } },
      equipe: { select: { nome: true } },
      servicos: { where: { sintomaId: { not: null } }, select: { sintoma: { select: { descricao: true } }, causa: { select: { descricao: true } } } },
    },
  });
  type Linha = { chave: string; rotulo: string; os: number; maoObra: number; material: number; terceiros: number; total: number; link?: string };
  const agrupar = (f: (o: (typeof ordens)[number]) => { chave: string; rotulo: string; link?: string }) => {
    const m = new Map<string, Linha>();
    for (const o of ordens) {
      const k = f(o);
      const l = m.get(k.chave) ?? { ...k, os: 0, maoObra: 0, material: 0, terceiros: 0, total: 0 };
      l.os++; l.maoObra += Number(o.custoMaoObra); l.material += Number(o.custoMaterial); l.terceiros += Number(o.custoTerceiros); l.total += custo(o);
      m.set(k.chave, l);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  };
  const porAtivo = agrupar((o) => (o.ativo ? { chave: o.ativo.id, rotulo: `${o.ativo.tag} — ${o.ativo.nome}`, link: `/pcm/ativos?ativo=${o.ativo.codApl}` } : { chave: "-", rotulo: "(sem ativo)" }));
  const porCentro = agrupar((o) => (o.centroCusto ? { chave: o.centroCusto.codigo, rotulo: `${o.centroCusto.codigo} ${o.centroCusto.nome}` } : { chave: "-", rotulo: "(sem centro de custo)" }));
  const porTipo = agrupar((o) => ({ chave: o.tipo.sigla, rotulo: `${o.tipo.sigla} — ${o.tipo.nome}` }));
  const porEquipe = agrupar((o) => ({ chave: o.equipe?.nome ?? "-", rotulo: o.equipe?.nome ?? "(sem equipe)" }));

  // Pareto de falhas (sintoma × causa) nas OS que contam como falha
  const pareto = new Map<string, { sintoma: string; causa: string; ocorrencias: number }>();
  for (const o of ordens) {
    if (!o.tipo.contaComoFalha) continue;
    for (const s of o.servicos) {
      const k = `${s.sintoma?.descricao ?? "—"}|${s.causa?.descricao ?? "—"}`;
      const p = pareto.get(k) ?? { sintoma: s.sintoma?.descricao ?? "—", causa: s.causa?.descricao ?? "—", ocorrencias: 0 };
      p.ocorrencias++; pareto.set(k, p);
    }
  }
  const paretoLista = Array.from(pareto.values()).sort((a, b) => b.ocorrencias - a.ocorrencias);
  const totalFalhas = paretoLista.reduce((s, p) => s + p.ocorrencias, 0);
  let acum = 0;
  const paretoComAcum = paretoLista.slice(0, 30).map((p) => { acum += p.ocorrencias; return { ...p, acumulado: totalFalhas ? acum / totalFalhas : 0 }; });

  // Horas apontadas por executante no período (todas as OS, não só concluídas)
  const aps = await prisma.manutApontamento.findMany({
    where: { inicio: { gte: de, lte: ate }, fim: { not: null }, ordem: { status: { not: "CANCELADA" } } },
    select: { nome: true, colaboradorId: true, inicio: true, fim: true, ordemId: true },
  });
  // garante que os apontamentos são de OS da empresa ativa
  const osEmpresa = new Set((await prisma.manutOrdem.findMany({ where: { id: { in: Array.from(new Set(aps.map((a) => a.ordemId))) } }, select: { id: true } })).map((o) => o.id));
  const prod = new Map<string, { nome: string; horas: number; os: Set<string> }>();
  for (const a of aps) {
    if (!osEmpresa.has(a.ordemId)) continue;
    const k = a.colaboradorId ?? a.nome;
    const p = prod.get(k) ?? { nome: a.nome, horas: 0, os: new Set<string>() };
    p.horas += (a.fim!.getTime() - a.inicio.getTime()) / 3_600_000; p.os.add(a.ordemId); prod.set(k, p);
  }
  const semanas = Math.max(1, (ate.getTime() - de.getTime()) / (7 * DIA));
  const produtividade = Array.from(prod.values())
    .map((p) => ({ nome: p.nome, horas: p.horas, os: p.os.size, ocupacao: p.horas / (semanas * HORAS_SEMANA_MEMBRO) }))
    .sort((a, b) => b.horas - a.horas);

  const total = ordens.reduce((s, o) => s + custo(o), 0);
  return { totalOs: ordens.length, total, porAtivo, porCentro, porTipo, porEquipe, pareto: paretoComAcum, totalFalhas, produtividade };
}
