"use client";

// Carga da equipe — quem está ocioso (sem tarefa aberta), quem não tem nada
// para hoje e quem está ocupado (e até quando), nos projetos ativos em que o
// usuário participa. "Hoje" = tarefa com início ≤ hoje ≤ prazo (sem início:
// só o prazo; sem datas: conta como aberta, mas não ocupa o dia).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import InfoHint from "@/components/shared/InfoHint";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronRight, Coffee, Loader2, Search, Timer, Users } from "lucide-react";
import { PrioridadeBadge } from "@/components/projetos/comum";
import TarefaCardOverlay from "@/components/projetos/TarefaCardOverlay";

type TarefaDTO = {
  id: string; titulo: string; prioridade: string; dataInicio: string | null; prazo: string | null; prazoHora: string | null;
  projetoId: string; coluna: { nome: string; categoria: string };
};
type PessoaDTO = { id: string; nome: string; convidado: boolean; projetos: string[]; tarefas: TarefaDTO[] };
type ProjetoDTO = { id: string; nome: string; cor: string | null };

type Situacao = "ociosa" | "livre-hoje" | "ocupada";
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const maisUmDia = (d: string) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };

function analisar(p: PessoaDTO, hoje: string) {
  const hojeTarefas = p.tarefas.filter((t) => {
    const ini = dia(t.dataInicio), fim = dia(t.prazo);
    if (!ini && !fim) return false;
    return (ini ?? fim!) <= hoje && hoje <= (fim ?? ini!);
  });
  const atrasadas = p.tarefas.filter((t) => { const f = dia(t.prazo); return f !== null && f < hoje; });
  const semData = p.tarefas.filter((t) => !t.dataInicio && !t.prazo);
  const futuras = p.tarefas.filter((t) => { const i = dia(t.dataInicio) ?? dia(t.prazo); return i !== null && i > hoje; });
  const proxima = futuras.map((t) => dia(t.dataInicio) ?? dia(t.prazo)!).sort()[0] ?? null;
  // Livre a partir de: dia seguinte ao último prazo das tarefas datadas (atrasadas contam como hoje).
  const fins = p.tarefas.map((t) => dia(t.prazo) ?? dia(t.dataInicio)).filter(Boolean) as string[];
  const ultimo = fins.length ? fins.map((f) => (f < hoje ? hoje : f)).sort().at(-1)! : null;
  const situacao: Situacao = p.tarefas.length === 0 ? "ociosa" : hojeTarefas.length || atrasadas.length ? "ocupada" : "livre-hoje";
  return { hojeTarefas, atrasadas, semData, proxima, livreEm: ultimo ? maisUmDia(ultimo) : null, situacao };
}

const GRUPOS: { k: Situacao; titulo: string; desc: string; icon: typeof Coffee; cls: string }[] = [
  { k: "ociosa", titulo: "Sem tarefas", desc: "nenhuma tarefa aberta nos projetos", icon: Coffee, cls: "text-danger border-danger/30 bg-danger/5" },
  { k: "livre-hoje", titulo: "Sem tarefa para hoje", desc: "tem tarefas, mas nada no dia de hoje", icon: Timer, cls: "text-warning border-warning/30 bg-warning/5" },
  { k: "ocupada", titulo: "Ocupados", desc: "tarefa em andamento hoje ou atrasada", icon: Users, cls: "text-success border-success/30 bg-success/5" },
];

export default function EquipePage() {
  useTabTitle("Carga da equipe");
  const params = useSearchParams();
  const [projetoId, setProjetoId] = usePersistedState<string>("projetos.equipe.projeto", params.get("projeto") ?? "");
  const [comConvidados, setComConvidados] = usePersistedState<boolean>("projetos.equipe.convidados", true);
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<{ projetos: ProjetoDTO[]; pessoas: PessoaDTO[]; semResponsavel: number } | null>(null);
  const [todosProjetos, setTodosProjetos] = useState<ProjetoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [tarefaAberta, setTarefaAberta] = useState<{ tarefaId: string; projetoId: string } | null>(null);

  // Link vindo do quadro (?projeto=) vence o filtro salvo.
  useEffect(() => { const p = params.get("projeto"); if (p) setProjetoId(p); }, [params, setProjetoId]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/projetos/equipe${projetoId ? `?projetoId=${projetoId}` : ""}`).then((r) => r.json()).then((j) => {
      setDados(j.data ?? null);
      if (!projetoId && j.data) setTodosProjetos(j.data.projetos);
    }).finally(() => setLoading(false));
  }, [projetoId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (projetoId && todosProjetos.length === 0) fetch("/api/projetos/equipe").then((r) => r.json()).then((j) => setTodosProjetos(j.data?.projetos ?? [])); }, [projetoId, todosProjetos.length]);

  const hoje = hojeISO();
  const nomeProjeto = useMemo(() => new Map((dados?.projetos ?? todosProjetos).map((p) => [p.id, p])), [dados, todosProjetos]);
  const linhas = useMemo(() => (dados?.pessoas ?? [])
    .filter((p) => comConvidados || !p.convidado)
    .filter((p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
    .map((p) => ({ p, a: analisar(p, hoje) })), [dados, comConvidados, busca, hoje]);

  return (
    <div>
      <PageHeader title="Carga da equipe" subtitle="Quem está sem tarefas, quem não tem nada para hoje e quem está ocupado — nos projetos ativos de que você participa."
        breadcrumbs={[{ label: "Projetos", href: "/projetos" }, { label: "Carga da equipe" }]} />
      <div className="px-8 pb-10 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <SelectMenu value={projetoId} onChange={setProjetoId} triggerClassName="w-[280px]" options={[{ value: "", label: "Todos os projetos" }, ...todosProjetos.map((p) => ({ value: p.id, label: p.nome }))]} />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa…" className="h-9 w-56 rounded-lg border border-border bg-card pl-8 pr-3 text-sm" />
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={comConvidados} onChange={(e) => setComConvidados(e.target.checked)} /> Incluir convidados (sem login)
          </label>
          <InfoHint side="bottom"><b>Hoje</b> = tarefa cujo período (início → prazo) inclui o dia de hoje, ou atrasada. Tarefa sem nenhuma data conta como aberta, mas não ocupa o dia. Concluídas e arquivadas não contam.</InfoHint>
          {dados && dados.semResponsavel > 0 && <span className="ml-auto inline-flex items-center gap-1 text-xs text-warning"><AlertTriangle className="w-3.5 h-3.5" /> {dados.semResponsavel} tarefa(s) aberta(s) sem responsável</span>}
        </div>

        {loading && !dados ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GRUPOS.map((g) => {
                const n = linhas.filter((l) => l.a.situacao === g.k).length;
                return (
                  <div key={g.k} className={cn("rounded-xl border p-4", g.cls)}>
                    <div className="flex items-center gap-2 text-sm font-medium"><g.icon className="w-4 h-4" /> {g.titulo}</div>
                    <p className="text-3xl font-semibold mt-1 tabular-nums">{n}</p>
                    <p className="text-xs opacity-80">{g.desc}</p>
                  </div>
                );
              })}
            </div>

            {GRUPOS.map((g) => {
              const grupo = linhas.filter((l) => l.a.situacao === g.k)
                .sort((x, y) => (x.a.livreEm ?? "").localeCompare(y.a.livreEm ?? "") || x.p.nome.localeCompare(y.p.nome));
              if (grupo.length === 0) return null;
              return (
                <div key={g.k} className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted text-sm font-medium text-foreground"><g.icon className="w-4 h-4" /> {g.titulo} <span className="text-muted-foreground font-normal">({grupo.length})</span></div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left font-medium px-4 py-2">Pessoa</th>
                        <th className="text-right font-medium px-3 py-2">Abertas</th>
                        <th className="text-right font-medium px-3 py-2">Hoje</th>
                        <th className="text-right font-medium px-3 py-2">Atrasadas</th>
                        <th className="text-right font-medium px-3 py-2">Sem data</th>
                        <th className="text-left font-medium px-3 py-2">Próxima começa</th>
                        <th className="text-left font-medium px-3 py-2">Livre a partir de</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {grupo.map(({ p, a }) => {
                        const exp = !!aberto[p.id];
                        return [
                          <tr key={p.id} className={cn("hover:bg-muted/40", p.tarefas.length && "cursor-pointer")} onClick={() => p.tarefas.length && setAberto((o) => ({ ...o, [p.id]: !o[p.id] }))}>
                            <td className="px-4 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                {p.tarefas.length ? (exp ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
                                <span className="font-medium text-foreground">{p.nome}</span>
                                {p.convidado && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">convidado</span>}
                              </span>
                              <span className="block pl-5 text-[11px] text-muted-foreground truncate max-w-[420px]">{p.projetos.map((id) => nomeProjeto.get(id)?.nome).filter(Boolean).join(" · ") || "—"}</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.tarefas.length}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{a.hojeTarefas.length || "—"}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums", a.atrasadas.length && "text-danger font-medium")}>{a.atrasadas.length || "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.semData.length || "—"}</td>
                            <td className="px-3 py-2">{a.proxima ? fmt(a.proxima) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2">{g.k === "ociosa" ? <span className="text-danger font-medium">agora</span> : a.livreEm ? fmt(a.livreEm) : <span className="text-muted-foreground">sem prazo definido</span>}</td>
                          </tr>,
                          exp && (
                            <tr key={`${p.id}-t`} className="bg-muted/20">
                              <td colSpan={7} className="px-4 py-2">
                                <ul className="space-y-1">
                                  {[...p.tarefas].sort((x, y) => (dia(x.prazo) ?? "9999").localeCompare(dia(y.prazo) ?? "9999")).map((t) => {
                                    const atras = dia(t.prazo) !== null && dia(t.prazo)! < hoje;
                                    const proj = nomeProjeto.get(t.projetoId);
                                    return (
                                      <li key={t.id}>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setTarefaAberta({ tarefaId: t.id, projetoId: t.projetoId }); }} className="w-full flex items-center gap-3 rounded px-2 py-1 text-left text-xs hover:bg-muted">
                                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: proj?.cor ?? "#94a3b8" }} />
                                          <span className="flex-1 min-w-0 truncate text-foreground">{t.titulo} <span className="text-muted-foreground">· {proj?.nome} · {t.coluna.nome}</span></span>
                                          <PrioridadeBadge prioridade={t.prioridade} />
                                          <span className={cn("w-[150px] text-right tabular-nums", atras ? "text-danger" : "text-muted-foreground")}>
                                            {t.dataInicio ? `${fmt(dia(t.dataInicio)!)} → ` : ""}{t.prazo ? fmt(dia(t.prazo)!) : "sem prazo"}{atras && " · atrasada"}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {linhas.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma pessoa nos projetos selecionados.</p>}
          </>
        )}
      </div>
      {tarefaAberta && <TarefaCardOverlay tarefaId={tarefaAberta.tarefaId} projetoId={tarefaAberta.projetoId} onFechar={() => { setTarefaAberta(null); load(); }} onMudou={load} />}
    </div>
  );
}
