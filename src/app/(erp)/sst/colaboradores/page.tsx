"use client";

// Colaboradores com semáforo SST (EPI / ASO / função). Clique abre a ficha.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useCachedData } from "@/lib/use-cached-data";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Loader2, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/session-context";
import { SeloAfastado, fmtData, type Pendencia } from "@/components/sst/comum";

type Linha = {
  id: string; nome: string; ativo: boolean; setor: string | null;
  funcao: { id: string; nome: string; desde: string } | null;
  semaforo: "OK" | "ATENCAO" | "CRITICO"; afastamento: { desde: string; ate: string | null; motivo: string | null } | null; pendencias: Pendencia[]; nEpi: number; nAso: number; nTreino: number; nEpiAviso: number; nAsoAviso: number; nTreinoAviso: number;
};

export default function SstColaboradoresPage() {
  useTabTitle("SST — Colaboradores");
  const router = useRouter();
  const sp = useSearchParams();
  // Cache entre navegações: voltar da ficha mostra a lista na hora (e a rolagem
  // volta ao lugar); a atualização roda em segundo plano.
  const { data, loading } = useCachedData<Linha[]>("sst:colaboradores", () => fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => j.data ?? []));
  const linhas = useMemo(() => data ?? [], [data]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = usePersistedState<string>("sst:colaboradores:semaforo", sp.get("semaforo") ?? "");
  const [somenteAtivos, setSomenteAtivos] = usePersistedState<boolean>("sst:colaboradores:ativos", true);
  const [agrupar, setAgrupar] = usePersistedState<"" | "funcao" | "setor">("sst:colaboradores:agrupar", "");
  const [fechadosLista, setFechadosLista] = usePersistedState<string[]>("sst:colaboradores:fechados", []);
  const fechados = useMemo(() => new Set(fechadosLista), [fechadosLista]);
  // Relatórios em Excel (matriz colaborador × item, no formato da planilha do PCMSO).
  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? "";
  const [baixando, setBaixando] = useState<"" | "epi" | "exames" | "treinamentos">("");
  async function baixar(tipo: "epi" | "exames" | "treinamentos") {
    setBaixando(tipo);
    try {
      const { exportarPlanilhaMatriz } = await import("@/components/sst/planilhaMatriz");
      await exportarPlanilhaMatriz(tipo, empresaNome);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar o relatório.");
    } finally { setBaixando(""); }
  }

  // ?funcao=<id> (vindo da tabela de funções) restringe a lista àquela função.
  const funcaoId = sp.get("funcao") ?? "";
  useEffect(() => { const s = sp.get("semaforo"); if (s) setFiltro(s); }, [sp]); // eslint-disable-line

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
  const alternarGrupo = (k: string) => setFechadosLista(fechados.has(k) ? fechadosLista.filter((x) => x !== k) : [...fechadosLista, k]);

  return (
    <div>
      <PageHeader title="Colaboradores" subtitle="Situação de EPI, ASO e função por pessoa" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Colaboradores" }]}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="gap-1.5" disabled={!!baixando} />}>
              {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Relatórios
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuItem onClick={() => baixar("epi")}><FileSpreadsheet className="w-4 h-4" /> EPIs a entregar (Excel)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => baixar("exames")}><FileSpreadsheet className="w-4 h-4" /> Exames a realizar (Excel)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => baixar("treinamentos")}><FileSpreadsheet className="w-4 h-4" /> Treinamentos a realizar (Excel)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        } />
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
                      <td colSpan={6} className="px-4 py-1.5">
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
                    <td className={cn("px-4 py-2 text-foreground", grupos && "pl-9", !l.ativo && "text-muted-foreground line-through")}>{l.nome}{l.afastamento && <span className="ml-2 inline-block align-middle"><SeloAfastado a={l.afastamento} /></span>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.setor ?? "—"}</td>
                    <td className="px-3 py-2">{l.funcao ? <>{agrupar === "funcao" ? null : <>{l.funcao.nome} </>}<span className="text-xs text-muted-foreground">desde {fmtData(l.funcao.desde)}</span></> : <span className="text-muted-foreground/60">—</span>}</td>
                    <Contagem itens={pendenciasDa(l, "epi")} />
                    <Contagem itens={pendenciasDa(l, "aso")} />
                    <Contagem itens={pendenciasDa(l, "treino")} />
                  </tr>
                  ))}
                  </Fragment>
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

// Mesma separação por área da API (/api/sst/colaboradores).
const AREA: Record<"epi" | "aso" | "treino", (t: string) => boolean> = {
  epi: (t) => t.startsWith("EPI") || t === "FICHA_EPI_SEM_ASSINATURA",
  aso: (t) => t.startsWith("ASO") || t === "EXAME_PENDENTE",
  treino: (t) => t.startsWith("TREINAMENTO"),
};
const pendenciasDa = (l: Linha, area: keyof typeof AREA) => l.pendencias.filter((p) => AREA[area](p.tipo));
const grave = (p: Pendencia) => p.severidade === "ALTA" || p.severidade === "CRITICA";

/** A cor do número é a situação da área (vermelho = problema, amarelo = atenção);
 *  o hover lista cada item da pendência como tag. */
function Contagem({ itens }: { itens: Pendencia[] }) {
  const nGrave = itens.filter(grave).length;
  const cor = nGrave > 0 ? "text-danger font-medium" : itens.length > 0 ? "text-warning font-medium" : "text-muted-foreground";
  if (itens.length === 0) return <td className="px-3 py-2 text-right tabular-nums"><span className={cor}>0</span></td>;
  const ordenados = [...itens].sort((a, b) => Number(grave(b)) - Number(grave(a)));
  return (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
      <TooltipProvider delay={100}>
        <Tooltip>
          <TooltipTrigger render={<span className={cn(cor, "cursor-help underline decoration-dotted underline-offset-4")} />}>{itens.length}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-[340px] flex-col items-start gap-1 py-2">
            {ordenados.map((p, i) => (
              <span key={i} className={cn("rounded px-1.5 py-0.5 text-[11px] leading-snug whitespace-normal text-white", grave(p) ? "bg-red-600" : "bg-amber-600")}>
                {p.titulo}{p.detalhe ? <span className="opacity-80"> · {p.detalhe}</span> : null}
              </span>
            ))}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}
