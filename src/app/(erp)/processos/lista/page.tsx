"use client";

// Lista de processos externos: filtros persistidos, criação em CreateDrawer.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import CreateDrawer from "@/components/shared/CreateDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Plus, Search } from "lucide-react";
import ProcessoForm from "@/components/processos/ProcessoForm";
import { PrazoChip, SituacaoBadge, TIPOS_PROCESSO, diasDesde, fmtData, useLookups, type LinhaProcesso } from "@/components/processos/comum";

function Lista() {
  useTabTitle("Processos");
  const sp = useSearchParams();
  const lk = useLookups();
  const [rows, setRows] = useState<LinhaProcesso[]>([]); const [loading, setLoading] = useState(true); const [pode, setPode] = useState(false);
  const [aba, setAba] = usePersistedState<"ativos" | "encerrados">("processos:lista:aba", "ativos");
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = usePersistedState("processos:lista:tipo", "");
  const [fResp, setFResp] = usePersistedState("processos:lista:resp", "");
  const [fPend, setFPend] = usePersistedState("processos:lista:pend", "");
  const [novo, setNovo] = useState(false);
  useEffect(() => { if (sp.get("novo") === "1") setNovo(true); }, [sp]);
  async function load() {
    const j = await fetch(`/api/processos${aba === "encerrados" ? "?encerrados=1" : ""}`).then((r) => r.json()).catch(() => ({}));
    setRows(j.data ?? []); setPode(!!j.podeEditar); setLoading(false);
  }
  useEffect(() => { load(); }, [aba]); // eslint-disable-line

  const vis = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!s || `${r.codigo} ${r.titulo} ${r.orgao} ${r.numero ?? ""} ${r.interessadoNome ?? ""} ${r.tags.join(" ")}`.toLowerCase().includes(s)) &&
      (!fTipo || r.tipo === fTipo) && (!fResp || r.responsavel?.id === fResp) &&
      (!fPend || (fPend === "prazo" ? r.pendencias.some((p) => p.tipo.startsWith("PRAZO")) : fPend === "parado" ? r.pendencias.some((p) => p.tipo === "SEM_ANDAMENTO") : r.situacao === "AGUARDANDO_EMPRESA")));
  }, [rows, q, fTipo, fResp, fPend]);

  return (
    <div>
      <PageHeader title="Processos" subtitle="Processos jurídicos e administrativos acompanhados fora da empresa" breadcrumbs={[{ label: "Processos", href: "/processos" }, { label: "Lista" }]}
        action={pode ? <Button onClick={() => setNovo(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo processo</Button> : undefined} />
      <div className="px-8 pb-8 space-y-3">
        <div className="flex items-center gap-1 border-b border-border">
          {(["ativos", "encerrados"] as const).map((k) => <button key={k} onClick={() => { setLoading(true); setAba(k); }} className={cn("px-3 py-2 text-sm -mb-px border-b-2 capitalize", aba === k ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{k}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, título, órgão, nº…" className="pl-8 h-8 w-72 text-sm" /></div>
          <SelectMenu value={fTipo} onChange={setFTipo} className="w-52" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Tipo: todos" }, ...Object.entries(TIPOS_PROCESSO).map(([value, label]) => ({ value, label }))]} />
          <SelectMenu value={fResp} onChange={setFResp} className="w-48" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Responsável: todos" }, ...lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))]} />
          <SelectMenu value={fPend} onChange={setFPend} className="w-52" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Pendência: qualquer" }, { value: "prazo", label: "Com prazo vencido/próximo" }, { value: "empresa", label: "Aguardando a empresa" }, { value: "parado", label: "Parados" }]} />
          <span className="ml-auto text-xs text-muted-foreground">{vis.length} processo(s)</span>
        </div>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">Processo</th><th className="text-left px-3 py-2 font-semibold">Órgão</th><th className="text-left px-3 py-2 font-semibold">Situação</th>
                <th className="text-left px-3 py-2 font-semibold">Próximo prazo</th><th className="text-left px-3 py-2 font-semibold">Último andamento</th><th className="text-left px-3 py-2 font-semibold">Responsável</th>
              </tr></thead>
              <tbody>
                {vis.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40 align-top">
                    <td className="px-4 py-2">
                      <Link href={`/processos/${r.id}`} className="font-medium text-foreground hover:underline">{r.titulo}</Link>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{r.codigo}</span>{r.numero && <span>· nº {r.numero}</span>}<span>· {TIPOS_PROCESSO[r.tipo] ?? r.tipo}</span>
                        {r.confidencial && <span className="inline-flex items-center gap-0.5"><Lock className="w-3 h-3" /> confidencial</span>}
                      </div>
                      {r.pendencias.filter((p) => p.tipo !== "PRAZO_VENCE_EM_BREVE" && p.tipo !== "PRAZO_VENCIDO").map((p, i) => <div key={i} className={cn("text-[11px]", p.severidade === "ALTA" ? "text-danger" : "text-warning")}>{p.titulo}</div>)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[14rem]">{r.orgao}</td>
                    <td className="px-3 py-2"><SituacaoBadge s={r.situacao} />{r.fase && <div className="text-[11px] text-muted-foreground mt-0.5">{r.fase}</div>}</td>
                    <td className="px-3 py-2">{r.proximoPrazo ? <><PrazoChip vence={r.proximoPrazo.vence} avisoDias={r.proximoPrazo.avisoDias} /><div className="text-[11px] text-muted-foreground truncate max-w-[14rem]">{r.proximoPrazo.descricao}</div></> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs">{r.ultimoAndamento ? <><span className="text-muted-foreground">{fmtData(r.ultimoAndamento.data)} · há {diasDesde(r.ultimoAndamento.data)}d</span><div className="truncate max-w-[16rem]">{r.ultimoAndamento.descricao}</div></> : <span className="text-muted-foreground">sem andamento</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.responsavel?.nome ?? "—"}</td>
                  </tr>
                ))}
                {vis.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum processo.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CreateDrawer open={novo} onOpenChange={setNovo} title="Novo processo" onCreated={load}><ProcessoForm /></CreateDrawer>
    </div>
  );
}

export default function ProcessosListaPage() {
  return <Suspense fallback={null}><Lista /></Suspense>;
}
