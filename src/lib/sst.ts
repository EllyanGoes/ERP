// SST — motor de conformidade (docs/sst-prd.md §5).
// Cruza os REQUISITOS da função SST vigente do colaborador (EPIs, exames) com
// os REGISTROS existentes (entregas, ASOs) e devolve pendências tipadas, com
// severidade e link para resolver. Painel, ficha, cron e relatórios consomem
// daqui — não há regra de conformidade na UI.
import { prismaSemEscopo } from "@/lib/prisma";

export type SeveridadeSst = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
export type TipoPendenciaSst =
  | "SEM_FUNCAO"
  | "EPI_NAO_ENTREGUE" | "EPI_VENCIDO" | "EPI_VENCE_EM_BREVE" | "EPI_CA_VENCIDO"
  | "ASO_INEXISTENTE" | "ASO_VENCIDO" | "ASO_VENCE_EM_BREVE" | "ASO_INAPTO" | "ASO_DEMISSIONAL_PENDENTE"
  | "EXAME_PENDENTE"
  | "OBRIGACAO_INEXISTENTE" | "OBRIGACAO_VENCIDA" | "OBRIGACAO_VENCE_EM_BREVE";

export type PendenciaSst = {
  tipo: TipoPendenciaSst;
  severidade: SeveridadeSst;
  titulo: string;
  detalhe?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
  referenciaId?: string;   // epiId / exameTipoId / obrigacaoId
  vence?: Date | null;
  link: string;
};

const DIA_MS = 86_400_000;
const JANELA_AVISO_DIAS = 30;
export const diasAte = (d: Date, hoje: Date) => Math.ceil((d.getTime() - hoje.getTime()) / DIA_MS);
export function somaMeses(d: Date, meses: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + meses);
  return x;
}
export function somaDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * DIA_MS);
}

// ── Dados carregados de um colaborador ──────────────────────────────────────
export type ColaboradorSst = {
  id: string;
  nome: string;
  ativo: boolean;
  dataDemissao: Date | null;
  setor: { nome: string } | null;
  sstFuncoes: {
    inicio: Date; fim: Date | null;
    funcao: {
      id: string; nome: string;
      requisitosEpi: { obrigatorio: boolean; quantidade: number; epi: { id: string; nome: string; vidaUtilDias: number | null; caValidade: Date | null; ca: string | null } }[];
      requisitosExame: { periodicidadeMeses: number; exameTipo: { id: string; nome: string } }[];
    };
  }[];
  sstEpiEntregas: { epiId: string; tipo: "ENTREGA" | "TROCA" | "DEVOLUCAO"; data: Date; vencimentoUso: Date | null; quantidade: number }[];
  sstAsos: { id: string; tipo: string; data: Date; validade: Date | null; resultado: string; exames: { exameTipoId: string; data: Date }[] }[];
};

export const COLABORADOR_SST_SELECT = {
  id: true, nome: true, ativo: true, dataDemissao: true,
  setor: { select: { nome: true } },
  sstFuncoes: {
    where: { fim: null },
    orderBy: { inicio: "desc" as const },
    take: 1,
    select: {
      inicio: true, fim: true,
      funcao: {
        select: {
          id: true, nome: true,
          requisitosEpi: { select: { obrigatorio: true, quantidade: true, epi: { select: { id: true, nome: true, vidaUtilDias: true, caValidade: true, ca: true } } } },
          requisitosExame: { select: { periodicidadeMeses: true, exameTipo: { select: { id: true, nome: true } } } },
        },
      },
    },
  },
  sstEpiEntregas: { orderBy: { data: "desc" as const }, select: { epiId: true, tipo: true, data: true, vencimentoUso: true, quantidade: true } },
  sstAsos: { orderBy: { data: "desc" as const }, select: { id: true, tipo: true, data: true, validade: true, resultado: true, exames: { select: { exameTipoId: true, data: true } } } },
} as const;

/** EPI vigente do colaborador: última ENTREGA/TROCA sem DEVOLUCAO posterior. */
export function epiVigente(entregas: ColaboradorSst["sstEpiEntregas"], epiId: string) {
  const doEpi = entregas.filter((e) => e.epiId === epiId).sort((a, b) => b.data.getTime() - a.data.getTime());
  const ultima = doEpi[0];
  if (!ultima || ultima.tipo === "DEVOLUCAO") return null;
  return ultima;
}

/** ASO vigente: o mais recente não-demissional com validade futura (ou sem validade). */
export function asoVigente(asos: ColaboradorSst["sstAsos"], hoje: Date) {
  const naoDemissional = asos.filter((a) => a.tipo !== "DEMISSIONAL").sort((a, b) => b.data.getTime() - a.data.getTime());
  const ultimo = naoDemissional[0] ?? null;
  if (!ultimo) return { ultimo: null, vigente: false };
  const vigente = !ultimo.validade || ultimo.validade.getTime() >= hoje.getTime();
  return { ultimo, vigente };
}

/** Pendências de um colaborador (função pura). */
export function pendenciasColaborador(c: ColaboradorSst, hoje = new Date()): PendenciaSst[] {
  const out: PendenciaSst[] = [];
  const link = `/sst/colaboradores/${c.id}`;
  const base = { colaboradorId: c.id, colaboradorNome: c.nome, link };
  const demitido = !c.ativo || (c.dataDemissao && c.dataDemissao.getTime() <= hoje.getTime());

  // Demitido: só cobra o ASO demissional.
  if (demitido) {
    const temDemissional = c.sstAsos.some((a) => a.tipo === "DEMISSIONAL");
    if (!temDemissional && c.sstAsos.length > 0) {
      out.push({ ...base, tipo: "ASO_DEMISSIONAL_PENDENTE", severidade: "ALTA", titulo: "ASO demissional não registrado" });
    }
    return out;
  }

  const vinculo = c.sstFuncoes[0];
  if (!vinculo) {
    out.push({ ...base, tipo: "SEM_FUNCAO", severidade: "MEDIA", titulo: "Sem função SST atribuída", detalhe: "Sem função não há requisitos de EPI/exames para cobrar." });
    return out;
  }
  const f = vinculo.funcao;

  // EPIs obrigatórios
  for (const r of f.requisitosEpi) {
    if (!r.obrigatorio) continue;
    const v = epiVigente(c.sstEpiEntregas, r.epi.id);
    if (!v) {
      out.push({ ...base, tipo: "EPI_NAO_ENTREGUE", severidade: "ALTA", titulo: `EPI não entregue: ${r.epi.nome}`, referenciaId: r.epi.id });
      continue;
    }
    if (v.vencimentoUso) {
      const d = diasAte(v.vencimentoUso, hoje);
      if (d < 0) out.push({ ...base, tipo: "EPI_VENCIDO", severidade: "ALTA", titulo: `EPI vencido: ${r.epi.nome}`, detalhe: `Troca prevista há ${-d} dia(s)`, referenciaId: r.epi.id, vence: v.vencimentoUso });
      else if (d <= JANELA_AVISO_DIAS) out.push({ ...base, tipo: "EPI_VENCE_EM_BREVE", severidade: "MEDIA", titulo: `EPI a trocar em ${d} dia(s): ${r.epi.nome}`, referenciaId: r.epi.id, vence: v.vencimentoUso });
    }
    if (r.epi.caValidade && r.epi.caValidade.getTime() < hoje.getTime()) {
      out.push({ ...base, tipo: "EPI_CA_VENCIDO", severidade: "ALTA", titulo: `CA vencido: ${r.epi.nome}${r.epi.ca ? ` (CA ${r.epi.ca})` : ""}`, referenciaId: r.epi.id, vence: r.epi.caValidade, link: `/sst/epis` });
    }
  }

  // ASO
  const { ultimo, vigente } = asoVigente(c.sstAsos, hoje);
  if (!ultimo) {
    out.push({ ...base, tipo: "ASO_INEXISTENTE", severidade: "CRITICA", titulo: "Sem ASO registrado" });
  } else {
    if (ultimo.resultado === "INAPTO") out.push({ ...base, tipo: "ASO_INAPTO", severidade: "CRITICA", titulo: "Último ASO: INAPTO", vence: ultimo.validade });
    if (!vigente && ultimo.validade) {
      out.push({ ...base, tipo: "ASO_VENCIDO", severidade: "CRITICA", titulo: "ASO vencido", detalhe: `Venceu em ${ultimo.validade.toLocaleDateString("pt-BR")}`, vence: ultimo.validade });
    } else if (ultimo.validade) {
      const d = diasAte(ultimo.validade, hoje);
      if (d <= JANELA_AVISO_DIAS) out.push({ ...base, tipo: "ASO_VENCE_EM_BREVE", severidade: "MEDIA", titulo: `ASO vence em ${d} dia(s)`, vence: ultimo.validade });
    }
    // Mudança de função sem exame de mudança de risco depois do início do vínculo
    const temExameAposVinculo = c.sstAsos.some((a) => a.data.getTime() >= vinculo.inicio.getTime());
    const vinculoRecente = diasAte(vinculo.inicio, hoje) > -30; // 30 dias de carência
    if (!temExameAposVinculo && !vinculoRecente && c.sstFuncoes.length > 0 && ultimo.tipo !== "ADMISSIONAL") {
      // só sinaliza quando houve troca de função (há vínculos encerrados)
    }
  }

  // Exames complementares por periodicidade
  for (const r of f.requisitosExame) {
    const feitos = c.sstAsos.flatMap((a) => a.exames).filter((e) => e.exameTipoId === r.exameTipo.id).sort((a, b) => b.data.getTime() - a.data.getTime());
    const ultimoExame = feitos[0] ?? null;
    const limite = ultimoExame ? somaMeses(ultimoExame.data, r.periodicidadeMeses) : null;
    if (!ultimoExame || (limite && limite.getTime() < hoje.getTime())) {
      out.push({ ...base, tipo: "EXAME_PENDENTE", severidade: "ALTA", titulo: `Exame pendente: ${r.exameTipo.nome}`, detalhe: ultimoExame ? `Último em ${ultimoExame.data.toLocaleDateString("pt-BR")} (a cada ${r.periodicidadeMeses} meses)` : "Nunca realizado", referenciaId: r.exameTipo.id, vence: limite });
    }
  }
  return out;
}

/** Semáforo resumido para listas. */
export function semaforo(pend: PendenciaSst[]): "OK" | "ATENCAO" | "CRITICO" {
  if (pend.some((p) => p.severidade === "CRITICA" || p.severidade === "ALTA")) return "CRITICO";
  if (pend.length > 0) return "ATENCAO";
  return "OK";
}

// ── Obrigações documentais (GED) ────────────────────────────────────────────
export async function pendenciasObrigacoes(empresaId: string, hoje = new Date()): Promise<{ pendencias: PendenciaSst[]; obrigacoes: ObrigacaoResolvida[] }> {
  const obrigacoes = await prismaSemEscopo.sstObrigacao.findMany({
    where: { empresaId },
    orderBy: { nome: "asc" },
    include: { categoriaGed: { select: { id: true, nome: true, slug: true } }, responsavel: { select: { id: true, nome: true } } },
  });
  const out: PendenciaSst[] = [];
  const resolvidas: ObrigacaoResolvida[] = [];
  for (const o of obrigacoes) {
    // Documento vigente = o de validade mais distante (ou o mais recente sem validade) da categoria, na empresa.
    const doc = await prismaSemEscopo.documento.findFirst({
      where: { empresaId, categoriaId: o.categoriaGedId, status: { not: "ARQUIVADO" } },
      orderBy: [{ validade: { sort: "desc", nulls: "last" } }, { emissao: "desc" }],
      select: { id: true, titulo: true, validade: true, emissao: true, status: true },
    });
    const link = `/sst/obrigacoes`;
    let situacao: ObrigacaoResolvida["situacao"] = "VIGENTE";
    if (!doc) {
      situacao = "INEXISTENTE";
      out.push({ tipo: "OBRIGACAO_INEXISTENTE", severidade: "CRITICA", titulo: `${o.nome}: sem documento`, detalhe: o.norma ?? undefined, referenciaId: o.id, link });
    } else if (doc.validade) {
      const d = diasAte(doc.validade, hoje);
      if (d < 0) { situacao = "VENCIDA"; out.push({ tipo: "OBRIGACAO_VENCIDA", severidade: "CRITICA", titulo: `${o.nome}: vencido há ${-d} dia(s)`, referenciaId: o.id, vence: doc.validade, link }); }
      else if (d <= 60) { situacao = "VENCE_EM_BREVE"; out.push({ tipo: "OBRIGACAO_VENCE_EM_BREVE", severidade: "MEDIA", titulo: `${o.nome}: vence em ${d} dia(s)`, referenciaId: o.id, vence: doc.validade, link }); }
    }
    resolvidas.push({ ...o, documento: doc, situacao });
  }
  return { pendencias: out, obrigacoes: resolvidas };
}
export type ObrigacaoResolvida = {
  id: string; nome: string; norma: string | null; periodicidadeMeses: number | null; observacoes: string | null;
  categoriaGed: { id: string; nome: string; slug: string };
  responsavel: { id: string; nome: string } | null;
  documento: { id: string; titulo: string; validade: Date | null; emissao: Date | null; status: string } | null;
  situacao: "VIGENTE" | "VENCE_EM_BREVE" | "VENCIDA" | "INEXISTENTE";
};

// ── Conformidade da empresa (painel / cron) ─────────────────────────────────
export async function colaboradoresDaEmpresa(empresaId: string) {
  return prismaSemEscopo.colaborador.findMany({
    where: { empresas: { some: { id: empresaId } }, tipoColaborador: "FUNCIONARIO" },
    orderBy: { nome: "asc" },
    select: COLABORADOR_SST_SELECT,
  });
}

export async function conformidadeEmpresa(empresaId: string, hoje = new Date()) {
  const colabs = await colaboradoresDaEmpresa(empresaId);
  const porColaborador = colabs.map((c) => {
    const pend = pendenciasColaborador(c as unknown as ColaboradorSst, hoje);
    return { id: c.id, nome: c.nome, ativo: c.ativo, setor: c.setor?.nome ?? null, funcao: c.sstFuncoes[0]?.funcao.nome ?? null, pendencias: pend, semaforo: semaforo(pend) };
  });
  const { pendencias: pendObrig, obrigacoes } = await pendenciasObrigacoes(empresaId, hoje);
  const todas = [...porColaborador.flatMap((c) => c.pendencias), ...pendObrig];
  const porSeveridade = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 } as Record<SeveridadeSst, number>;
  const porTipo: Record<string, number> = {};
  for (const p of todas) { porSeveridade[p.severidade]++; porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1; }
  const ativos = porColaborador.filter((c) => c.ativo);
  return {
    empresaId,
    geradoEm: hoje,
    totais: {
      colaboradores: ativos.length,
      ok: ativos.filter((c) => c.semaforo === "OK").length,
      atencao: ativos.filter((c) => c.semaforo === "ATENCAO").length,
      critico: ativos.filter((c) => c.semaforo === "CRITICO").length,
      semFuncao: ativos.filter((c) => !c.funcao).length,
    },
    porSeveridade,
    porTipo,
    colaboradores: porColaborador,
    obrigacoes,
    pendencias: todas,
  };
}
