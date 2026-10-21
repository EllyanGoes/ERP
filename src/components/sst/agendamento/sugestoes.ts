// Quem precisa ir à clínica e quais exames pedir — a partir do que o SST já
// calcula por colaborador (/api/sst/colaboradores): pendências, exames que a
// função exige, exames feitos e último ASO. A consulta clínica (tipo "clinico")
// entra sempre; os exames exigidos entram se nunca feitos ou se vencem até a
// data-limite da janela.
export type ColabAgenda = {
  id: string; nome: string; ativo: boolean; setor: string | null; afastamento?: unknown | null;
  funcao: { id: string; nome: string } | null;
  pendencias: { tipo: string; titulo: string; vence?: string | null }[];
  exigidos: { exameTipoId: string; nome: string; periodicidadeMeses: number }[];
  exames: { exameTipoId: string; data: string }[];
  ultimoAso: { tipo: string; data: string; validade: string | null; resultado: string } | null;
};
export type TipoExame = { id: string; nome: string; preco: string | null; clinico: boolean; ativo: boolean };

export type Sugestao = {
  colab: ColabAgenda;
  tipoAso: string;
  motivo: string;
  /** 0 = mais urgente. */
  urgencia: number;
  vence: Date | null;
  exames: string[];
};

const DIA = 86_400_000;
const somaMeses = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export function sugerir(colabs: ColabAgenda[], tipos: TipoExame[], janelaDias: number, hoje = new Date()): Sugestao[] {
  const limite = new Date(hoje.getTime() + janelaDias * DIA);
  const clinico = tipos.find((t) => t.clinico && t.ativo);
  const out: Sugestao[] = [];
  for (const c of colabs) {
    if (!c.ativo || c.afastamento) continue;
    const retorno = c.pendencias.some((p) => p.tipo === "ASO_RETORNO_PENDENTE");
    const aso = c.ultimoAso;
    const asoVence = aso?.validade ? new Date(aso.validade) : null;
    const ultimo = new Map<string, Date>();
    for (const e of c.exames) { const d = new Date(e.data); if (!ultimo.has(e.exameTipoId) || ultimo.get(e.exameTipoId)! < d) ultimo.set(e.exameTipoId, d); }

    let tipoAso = "", motivo = "", urgencia = 9, vence: Date | null = null;
    if (retorno) { tipoAso = "RETORNO"; motivo = "Retorno de afastamento"; urgencia = 0; }
    else if (!aso) { tipoAso = c.exames.length ? "PERIODICO" : "ADMISSIONAL"; motivo = "Sem ASO registrado"; urgencia = 1; }
    else if (asoVence && asoVence <= limite) {
      tipoAso = "PERIODICO"; vence = asoVence;
      const vencido = asoVence < hoje;
      motivo = vencido ? `ASO vencido em ${fmt(asoVence)}` : `ASO vence em ${fmt(asoVence)}`;
      urgencia = vencido ? 2 : 3;
    }
    // Exames exigidos: todos no admissional; senão os nunca feitos ou que vencem até o limite.
    const devidos = c.exigidos.filter((r) => {
      if (tipoAso === "ADMISSIONAL") return true;
      const u = ultimo.get(r.exameTipoId);
      return !u || somaMeses(u, r.periodicidadeMeses) <= (vence && vence > limite ? vence : limite);
    });
    if (!tipoAso && devidos.length) { tipoAso = "PERIODICO"; motivo = `Exame pendente: ${devidos.map((d) => d.nome).join(", ")}`; urgencia = 4; }
    if (!tipoAso) continue;
    const exames = Array.from(new Set([...(clinico ? [clinico.id] : []), ...devidos.map((d) => d.exameTipoId)]));
    out.push({ colab: c, tipoAso, motivo, urgencia, vence, exames });
  }
  return out.sort((a, b) => a.urgencia - b.urgencia || (a.vence?.getTime() ?? 0) - (b.vence?.getTime() ?? 0) || a.colab.nome.localeCompare(b.colab.nome, "pt-BR"));
}

/** Distribui as pessoas em dias/períodos a partir de uma data (pula sábado e domingo). */
export function distribuir(n: number, inicioISO: string, porPeriodo: number, periodos: ("MANHA" | "TARDE")[]): { data: string; periodo: "MANHA" | "TARDE" }[] {
  const out: { data: string; periodo: "MANHA" | "TARDE" }[] = [];
  const d = new Date(`${inicioISO}T12:00:00Z`);
  const util = () => { while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); };
  util();
  let p = 0, noPeriodo = 0;
  for (let i = 0; i < n; i++) {
    if (noPeriodo >= Math.max(1, porPeriodo)) {
      noPeriodo = 0; p++;
      if (p >= periodos.length) { p = 0; d.setUTCDate(d.getUTCDate() + 1); util(); }
    }
    out.push({ data: d.toISOString().slice(0, 10), periodo: periodos[p] });
    noPeriodo++;
  }
  return out;
}
