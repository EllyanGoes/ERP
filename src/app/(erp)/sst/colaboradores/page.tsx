"use client";

// Colaboradores com semáforo SST (EPI / ASO / função). Clique abre a ficha.
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";
import { Semaforo, fmtData, type Pendencia } from "@/components/sst/comum";

type Linha = {
  id: string; nome: string; ativo: boolean; setor: string | null;
  funcao: { id: string; nome: string; desde: string } | null;
  semaforo: "OK" | "ATENCAO" | "CRITICO"; pendencias: Pendencia[]; nEpi: number; nAso: number;
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

  // ?funcao=<id> (vindo da tabela de funções) restringe a lista àquela função.
  const funcaoId = sp.get("funcao") ?? "";
  useEffect(() => { const s = sp.get("semaforo"); if (s) setFiltro(s); }, [sp]); // eslint-disable-line
  useEffect(() => {
    fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setLinhas(j.data ?? [])).finally(() => setLoading(false));
  }, []);

  const visiveis = useMemo(() => linhas
    .filter((l) => !somenteAtivos || l.ativo)
    .filter((l) => !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || (l.setor ?? "").toLowerCase().includes(busca.toLowerCase()))
    .filter((l) => !filtro || (filtro === "SEM_FUNCAO" ? !l.funcao : l.semaforo === filtro))
    .filter((l) => !funcaoId || l.funcao?.id === funcaoId)
    .sort((a, b) => ({ CRITICO: 0, ATENCAO: 1, OK: 2 }[a.semaforo] - { CRITICO: 0, ATENCAO: 1, OK: 2 }[b.semaforo]) || a.nome.localeCompare(b.nome)),
  [linhas, busca, filtro, somenteAtivos, funcaoId]);

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
            { value: "", label: "Todos" }, { value: "CRITICO", label: "Com pendência" }, { value: "ATENCAO", label: "Com atenção" }, { value: "OK", label: "Regulares" }, { value: "SEM_FUNCAO", label: "Sem função SST" },
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
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} onClick={() => router.push(`/sst/colaboradores/${l.id}`)} className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className={cn("px-4 py-2 text-foreground", !l.ativo && "text-muted-foreground line-through")}>{l.nome}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.setor ?? "—"}</td>
                    <td className="px-3 py-2">{l.funcao ? <>{l.funcao.nome} <span className="text-xs text-muted-foreground">desde {fmtData(l.funcao.desde)}</span></> : <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="px-3 py-2"><Semaforo s={l.semaforo} /></td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", l.nEpi > 0 ? "text-danger font-medium" : "text-muted-foreground")}>{l.nEpi}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", l.nAso > 0 ? "text-danger font-medium" : "text-muted-foreground")}>{l.nAso}</td>
                  </tr>
                ))}
                {visiveis.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum colaborador.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
