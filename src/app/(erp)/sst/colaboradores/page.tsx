"use client";

// Colaboradores com semáforo SST (EPI / ASO / função). Clique abre a ficha.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { Semaforo, SeloAfastado, fmtData, type Pendencia } from "@/components/sst/comum";

type Linha = {
  id: string; nome: string; ativo: boolean; setor: string | null;
  funcao: { id: string; nome: string; desde: string } | null;
  semaforo: "OK" | "ATENCAO" | "CRITICO"; afastamento: { desde: string; ate: string | null; motivo: string | null } | null; pendencias: Pendencia[]; nEpi: number; nAso: number; nTreino: number;
};

export default function SstColaboradoresPage() {
  useTabTitle("SST — Colaboradores");
  const router = useRouter();
  const sp = useSearchParams();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = usePersistedState<string>("sst:colaboradores:semaforo", sp.get("semaforo") ?? "");
  const [somenteAtivos, setSomenteAtivos] = usePersistedState<boolean>("sst:colaboradores:ativos", true);
  const [agrupar, setAgrupar] = usePersistedState<"" | "funcao" | "setor">("sst:colaboradores:agrupar", "");
  const [fechados, setFechados] = useState<Set<string>>(new Set());

  // ?funcao=<id> (vindo da tabela de funções) restringe a lista àquela função.
  const funcaoId = sp.get("funcao") ?? "";
  useEffect(() => { const s = sp.get("semaforo"); if (s) setFiltro(s); }, [sp]); // eslint-disable-line
  useEffect(() => {
    fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setLinhas(j.data ?? [])).finally(() => setLoading(false));
  }, []);

  const visiveis = useMemo(() => linhas
    .filter((l) => !somenteAtivos || l.ativo)
    .filter((l) => !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || (l.setor ?? "").toLowerCase().includes(busca.toLowerCase()))
    .filter((l) => !filtro || (filtro === "SEM_FUNCAO" ? !l.funcao : filtro === "AFASTADO" ? !!l.afastamento : l.semaforo === filtro && !l.afastamento))
    .filter((l) => !funcaoId || l.funcao?.id === funcaoId)
    .sort((a, b) => ({ CRITICO: 0, ATENCAO: 1, OK: 2 }[a.semaforo] - { CRITICO: 0, ATENCAO: 1, OK: 2 }[b.semaforo]) || a.nome.localeCompare(b.nome)),
  [linhas, busca, filtro, somenteAtivos, funcaoId]);

  // Agrupamento (por função SST ou setor): grupos em ordem alfabética, "sem …" por último.
  const grupos = useMemo(() => {
    if (!agrupar) return null;
    const m = new Map<string, Linha[]>();
    for (const l of visiveis) {
      const k = agrupar === "funcao" ? l.funcao?.nome ?? "" : l.setor ?? "";
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b))
      .map(([chave, itens]) => ({ chave, titulo: chave || (agrupar === "funcao" ? "Sem função SST" : "Sem setor"), itens, pendentes: itens.filter((l) => l.semaforo === "CRITICO" && !l.afastamento).length }));
  }, [visiveis, agrupar]);
  const alternarGrupo = (k: string) => setFechados((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div>
      <PageHeader title="Colaboradores" subtitle="Situação de EPI, ASO e função por pessoa" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Colaboradores" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou setor..." className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
          </div>
          <SelectMenu value={filtro} onChange={setFiltro} className="w-44" options={[
            { value: "", label: "Todos" }, { value: "CRITICO", label: "Com pendência" }, { value: "ATENCAO", label: "Com atenção" }, { value: "OK", label: "Regulares" }, { value: "SEM_FUNCAO", label: "Sem função SST" }, { value: "AFASTADO", label: "Afastados" },
          ]} />
          <SelectMenu value={agrupar} onChange={(v) => setAgrupar(v as "" | "funcao" | "setor")} className="w-48" options={[
            { value: "", label: "Sem agrupar" }, { value: "funcao", label: "Agrupar por função" }, { value: "setor", label: "Agrupar por setor" },
          ]} />
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="rounded" checked={somenteAtivos} onChange={(e) => setSomenteAtivos(e.target.checked)} /> só ativos</label>
          {funcaoId && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-info/30 bg-info/5 text-info">função: {linhas.find((l) => l.funcao?.id === funcaoId)?.funcao?.nome ?? "…"}<button onClick={() => router.replace("/sst/colaboradores")} className="hover:text-foreground" title="Remover filtro">×</button></span>}
          <span className="text-xs text-muted-foreground ml-auto">{visiveis.length} de {linhas.length}</span>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Colaborador</th>
                  <th className="text-left px-3 py-2 font-semibold">Setor</th>
                  <th className="text-left px-3 py-2 font-semibold">Função SST</th>
                  <th className="text-left px-3 py-2 font-semibold">Situação</th>
                  <th className="text-right px-3 py-2 font-semibold">EPI</th>
                  <th className="text-right px-3 py-2 font-semibold">ASO/exames</th>
                  <th className="text-right px-3 py-2 font-semibold">Treinamentos</th>
                </tr>
              </thead>
              <tbody>
                {(grupos ?? [{ chave: "", titulo: "", itens: visiveis, pendentes: 0 }]).map((g) => (
                  <Fragment key={g.chave || "_"}>
                  {grupos && (
                    <tr onClick={() => alternarGrupo(g.chave)} className="border-t border-border bg-muted/50 cursor-pointer select-none hover:bg-muted">
                      <td colSpan={7} className="px-4 py-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          {fechados.has(g.chave) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {g.titulo}
                          <span className="font-normal text-muted-foreground">· {g.itens.length} {g.itens.length === 1 ? "pessoa" : "pessoas"}</span>
                          {g.pendentes > 0 && <span className="font-normal text-danger">· {g.pendentes} com pendência</span>}
                        </span>
                      </td>
                    </tr>
                  )}
                  {!fechados.has(g.chave) && g.itens.map((l) => (
                  <tr key={l.id} onClick={() => router.push(`/sst/colaboradores/${l.id}`)} className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className={cn("px-4 py-2 text-foreground", grupos && "pl-9", !l.ativo && "text-muted-foreground line-through")}>{l.nome}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.setor ?? "—"}</td>
                    <td className="px-3 py-2">{l.funcao ? <>{agrupar === "funcao" ? null : <>{l.funcao.nome} </>}<span className="text-xs text-muted-foreground">desde {fmtData(l.funcao.desde)}</span></> : <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="px-3 py-2">{l.afastamento ? <SeloAfastado a={l.afastamento} /> : <Semaforo s={l.semaforo} />}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", l.nEpi > 0 ? "text-danger font-medium" : "text-muted-foreground")}>{l.nEpi}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", l.nAso > 0 ? "text-danger font-medium" : "text-muted-foreground")}>{l.nAso}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", l.nTreino > 0 ? "text-danger font-medium" : "text-muted-foreground")}>{l.nTreino}</td>
                  </tr>
                  ))}
                  </Fragment>
                ))}
                {visiveis.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum colaborador.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
