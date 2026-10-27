"use client";

// Painel de conformidade SST (docs/sst-prd.md §7): responde "estamos
// regulares?" por empresa — colaboradores por semáforo, pendências por
// severidade/tipo e obrigações documentais.
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, ShieldCheck, Users, HardHat, Stethoscope, FileCheck2, RefreshCw, GraduationCap, Cog, Siren, ClipboardCheck, Users2 } from "lucide-react";
import { ListaPendencias, SEVERIDADE, fmtData, type Pendencia, type Severidade } from "@/components/sst/comum";

type Painel = {
  geradoEm: string;
  totais: { colaboradores: number; ok: number; atencao: number; critico: number; semFuncao: number };
  porSeveridade: Record<Severidade, number>;
  porTipo: Record<string, number>;
  colaboradores: { id: string; nome: string; ativo: boolean; setor: string | null; funcao: string | null; semaforo: "OK" | "ATENCAO" | "CRITICO"; pendencias: Pendencia[] }[];
  obrigacoes: { id: string; nome: string; norma: string | null; situacao: string; documento: { id: string; titulo: string; validade: string | null } | null }[];
  maquinas: { total: number; conformes: number; emAdequacao: number; naoConformes: number; naoAvaliadas: number; interditadas: number };
  incidentes: { ano: number; comAfastamento: number; diasPerdidos: number; abertos: number };
  pendencias: Pendencia[];
};

const GRUPOS: { key: string; label: string; icon: typeof Users; tipos: string[]; link: string }[] = [
  { key: "epi", label: "EPI (NR-06)", icon: HardHat, tipos: ["EPI_NAO_ENTREGUE", "EPI_VENCIDO", "EPI_VENCE_EM_BREVE", "EPI_CA_VENCIDO"], link: "/sst/epis" },
  { key: "saude", label: "ASO e exames (NR-07)", icon: Stethoscope, tipos: ["ASO_INEXISTENTE", "ASO_VENCIDO", "ASO_VENCE_EM_BREVE", "ASO_INAPTO", "ASO_DEMISSIONAL_PENDENTE", "EXAME_PENDENTE"], link: "/sst/saude" },
  { key: "trein", label: "Treinamentos", icon: GraduationCap, tipos: ["TREINAMENTO_FALTANDO", "TREINAMENTO_VENCIDO", "TREINAMENTO_VENCE_EM_BREVE"], link: "/sst/treinamentos" },
  { key: "maq", label: "Máquinas (NR-12)", icon: Cog, tipos: ["MAQUINA_NAO_AVALIADA", "MAQUINA_NAO_CONFORME", "MAQUINA_INTERDITADA"], link: "/sst/maquinas" },
  { key: "obrig", label: "Obrigações (PGR, PCMSO…)", icon: FileCheck2, tipos: ["OBRIGACAO_INEXISTENTE", "OBRIGACAO_VENCIDA", "OBRIGACAO_VENCE_EM_BREVE"], link: "/sst/obrigacoes" },
  { key: "inc", label: "Incidentes e CAT", icon: Siren, tipos: ["CAT_NAO_EMITIDA", "INCIDENTE_SEM_ACAO", "ACAO_ATRASADA"], link: "/sst/incidentes" },
  { key: "insp", label: "Inspeções", icon: ClipboardCheck, tipos: ["INSPECAO_ATRASADA", "INSPECAO_VENCE_EM_BREVE"], link: "/sst/inspecoes" },
  { key: "cipa", label: "CIPA", icon: Users2, tipos: ["CIPA_SEM_MANDATO", "CIPA_MANDATO_VENCENDO"], link: "/sst/cipa" },
  { key: "funcao", label: "Funções", icon: Users, tipos: ["SEM_FUNCAO"], link: "/sst/colaboradores" },
];

export default function SstPainelPage() {
  useTabTitle("SST — Painel");
  const [p, setP] = useState<Painel | null>(null);
  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState<string | null>(null);

  async function load() {
    const j = await fetch("/api/sst/painel").then((r) => r.json()).catch(() => null);
    setP(j?.data ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const pendFiltradas = p ? (grupo ? p.pendencias.filter((x) => GRUPOS.find((g) => g.key === grupo)!.tipos.includes(x.tipo)) : p.pendencias) : [];

  return (
    <div>
      <PageHeader
        title="Painel de conformidade"
        subtitle="Saúde e Segurança do Trabalho — empresa ativa"
        breadcrumbs={[{ label: "SST" }, { label: "Painel" }]}
        action={<button onClick={load} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Atualizar</button>}
      />
      <div className="px-8 pb-8 space-y-6">
        {loading && !p ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !p ? (
          <p className="text-sm text-danger">Não foi possível carregar o painel.</p>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Colaboradores" valor={p.totais.colaboradores} icon={<Users className="w-4 h-4" />} href="/sst/colaboradores" />
              <Kpi label="Regulares" valor={p.totais.ok} cls="text-success" icon={<ShieldCheck className="w-4 h-4" />} href="/sst/colaboradores?semaforo=OK" />
              <Kpi label="Com atenção" valor={p.totais.atencao} cls="text-warning" href="/sst/colaboradores?semaforo=ATENCAO" />
              <Kpi label="Com pendência" valor={p.totais.critico} cls="text-danger" href="/sst/colaboradores?semaforo=CRITICO" />
              <Kpi label="Sem função SST" valor={p.totais.semFuncao} cls="text-muted-foreground" href="/sst/colaboradores?semaforo=SEM_FUNCAO" />
            </div>

            {/* Severidade */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SEVERIDADE) as Severidade[]).map((s) => (
                <span key={s} className={cn("inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border", SEVERIDADE[s].cls)}>
                  <span className={cn("w-2 h-2 rounded-full", SEVERIDADE[s].dot)} />{SEVERIDADE[s].label}: <strong>{p.porSeveridade[s]}</strong>
                </span>
              ))}
              <span className="text-xs text-muted-foreground self-center ml-auto">Calculado em {new Date(p.geradoEm).toLocaleString("pt-BR")}</span>
            </div>

            {/* Por norma/grupo */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {GRUPOS.map((g) => {
                const n = g.tipos.reduce((acc, t) => acc + (p.porTipo[t] ?? 0), 0);
                const criticas = p.pendencias.filter((x) => g.tipos.includes(x.tipo) && x.severidade === "CRITICA").length;
                const ativo = grupo === g.key;
                return (
                  <button key={g.key} onClick={() => setGrupo(ativo ? null : g.key)}
                    className={cn("text-left rounded-xl border p-4 transition-colors", ativo ? "border-info bg-info/5" : "border-border bg-card hover:bg-muted/40",
                      n === 0 ? "" : criticas > 0 ? "border-l-4 border-l-danger" : "border-l-4 border-l-warning")}>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground"><g.icon className="w-4 h-4 text-muted-foreground" />{g.label}</div>
                    <div className={cn("mt-2 text-2xl font-semibold", n === 0 ? "text-success" : criticas > 0 ? "text-danger" : "text-warning")}>{n}</div>
                    <div className="text-xs text-muted-foreground">{n === 0 ? "tudo regular" : `${criticas} crítica(s)`} · <Link href={g.link} className="text-info hover:underline" onClick={(e) => e.stopPropagation()}>abrir</Link></div>
                  </button>
                );
              })}
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Pendências */}
              <div className="md:col-span-2 bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-foreground">Pendências {grupo ? `— ${GRUPOS.find((g) => g.key === grupo)!.label}` : ""}</h2>
                  <span className="text-xs text-muted-foreground">{pendFiltradas.length}</span>
                </div>
                <div className="px-4 max-h-[60vh] overflow-y-auto">
                  <ListaPendencias itens={pendFiltradas} mostrarColaborador vazio="Nenhuma pendência — tudo regular." />
                </div>
              </div>
              <div className="space-y-6">
              {/* Acidentes do ano */}
              <div className="bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-foreground">Acidentes em {new Date().getFullYear()}</h2>
                  <Link href="/sst/incidentes" className="text-xs text-info hover:underline">ocorrências</Link>
                </div>
                <div className="p-4 grid grid-cols-4 gap-2 text-center">
                  {[["Ocorrências", p.incidentes.ano, "text-foreground"], ["C/ afastamento", p.incidentes.comAfastamento, "text-danger"], ["Dias perdidos", p.incidentes.diasPerdidos, "text-danger"], ["Em aberto", p.incidentes.abertos, "text-warning"]].map(([l, v, c]) => (
                    <div key={String(l)}><div className={cn("text-xl font-semibold", String(c))}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
                  ))}
                </div>
              </div>
              {/* Máquinas NR-12 */}
              <div className="bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-foreground">Máquinas (NR-12)</h2>
                  <Link href="/sst/maquinas" className="text-xs text-info hover:underline">inventário</Link>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2 text-center">
                  {[["Conformes", p.maquinas.conformes, "text-success"], ["Em adequação", p.maquinas.emAdequacao, "text-warning"], ["Não conformes", p.maquinas.naoConformes, "text-danger"], ["Não avaliadas", p.maquinas.naoAvaliadas, "text-muted-foreground"], ["Interditadas", p.maquinas.interditadas, "text-danger"], ["Total", p.maquinas.total, "text-foreground"]].map(([l, v, c]) => (
                    <div key={String(l)}><div className={cn("text-xl font-semibold", String(c))}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
                  ))}
                </div>
              </div>
              {/* Obrigações */}
              <div className="bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-foreground">Obrigações documentais</h2>
                  <Link href="/sst/obrigacoes" className="text-xs text-info hover:underline">gerenciar</Link>
                </div>
                <ul className="divide-y divide-border/60 px-4">
                  {p.obrigacoes.length === 0 && <li className="py-3 text-sm text-muted-foreground italic">Nenhuma obrigação cadastrada.</li>}
                  {p.obrigacoes.map((o) => (
                    <li key={o.id} className="py-2 flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", o.situacao === "VIGENTE" ? "bg-success" : o.situacao === "VENCE_EM_BREVE" ? "bg-warning" : "bg-danger")} />
                      <span className="text-sm text-foreground flex-1 truncate">{o.nome}{o.norma ? <span className="text-xs text-muted-foreground"> · {o.norma}</span> : null}</span>
                      <span className="text-xs text-muted-foreground">{o.documento?.validade ? fmtData(o.documento.validade) : o.situacao === "INEXISTENTE" ? "sem documento" : "sem validade"}</span>
                    </li>
                  ))}
                </ul>
              </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, valor, cls, icon, href }: { label: string; valor: number; cls?: string; icon?: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="bg-card rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold text-foreground", cls)}>{valor}</div>
    </Link>
  );
}
