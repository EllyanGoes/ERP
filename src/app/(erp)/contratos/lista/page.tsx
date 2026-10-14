"use client";

// Lista de contratos com filtros persistidos; criação em CreateDrawer.
import { useEffect, useMemo, useState } from "react";
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
import { Loader2, Plus, Search } from "lucide-react";
import ContratoForm from "@/components/contratos/ContratoForm";
import { StatusBadge, Semaforo, TIPO_CONTRATO, TIPO_EVENTO, LADO, fmtBRL, fmtData, nomeParte, useLookups, type Pendencia } from "@/components/contratos/comum";

type Row = {
  id: string; numero: string; titulo: string; tipo: string; lado: string; status: string; inicio: string; fimVigente: string | null; renovacao: string; valorMensal: number; tags: string[];
  fornecedor: { razaoSocial: string; nomeFantasia: string | null } | null; cliente: { razaoSocial: string; nomeFantasia: string | null } | null; responsavel: { id: string; nome: string };
  semaforo: "OK" | "ATENCAO" | "CRITICO"; pendencias: Pendencia[]; proximoEvento: { tipo: string; data: string } | null;
};

export default function ContratosListaPage() {
  useTabTitle("Contratos");
  const sp = useSearchParams();
  const lk = useLookups();
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true);
  const [aba, setAba] = usePersistedState<"ativos" | "encerrados">("contratos:lista:aba", "ativos");
  const [q, setQ] = useState(""); const [fLado, setFLado] = usePersistedState("contratos:lista:lado", ""); const [fTipo, setFTipo] = usePersistedState("contratos:lista:tipo", ""); const [fStatus, setFStatus] = usePersistedState("contratos:lista:status", ""); const [fResp, setFResp] = usePersistedState("contratos:lista:resp", ""); const [fVence, setFVence] = useState(sp.get("vence") ?? "");
  const [novo, setNovo] = useState(false);
  useEffect(() => { if (sp.get("novo") === "1") setNovo(true); }, [sp]);
  async function load() { setLoading(true); const j = await fetch(`/api/contratos${aba === "encerrados" ? "?encerrados=1" : ""}`).then((r) => r.json()); setRows(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); }, [aba]); // eslint-disable-line

  const vis = useMemo(() => {
    const s = q.trim().toLowerCase(); const lim = fVence ? Date.now() + Number(fVence) * 86_400_000 : null;
    return rows.filter((r) =>
      (!s || r.numero.toLowerCase().includes(s) || r.titulo.toLowerCase().includes(s) || nomeParte(r.fornecedor ?? r.cliente).toLowerCase().includes(s) || r.tags.some((t) => t.includes(s))) &&
      (!fLado || r.lado === fLado) && (!fTipo || r.tipo === fTipo) && (!fStatus || r.status === fStatus) && (!fResp || r.responsavel.id === fResp) &&
      (!lim || (r.fimVigente && new Date(r.fimVigente).getTime() <= lim)));
  }, [rows, q, fLado, fTipo, fStatus, fResp, fVence]);
  const totalMes = vis.filter((r) => r.lado === "DESPESA").reduce((s, r) => s + r.valorMensal, 0);

  return (
    <div>
      <PageHeader title="Contratos" subtitle="Cadastro, vigência e situação de cada contrato" breadcrumbs={[{ label: "Contratos", href: "/contratos" }, { label: "Lista" }]}
        action={<Button onClick={() => setNovo(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo contrato</Button>} />
      <div className="px-8 pb-8 space-y-3">
        <div className="flex items-center gap-1 border-b border-border">
          {(["ativos", "encerrados"] as const).map((k) => <button key={k} onClick={() => setAba(k)} className={cn("px-3 py-2 text-sm -mb-px border-b-2 capitalize", aba === k ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{k}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nº, título, contraparte, tag…" className="pl-8 h-8 w-72 text-sm" /></div>
          <SelectMenu value={fLado} onChange={setFLado} className="w-40" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Lado: todos" }, { value: "DESPESA", label: "Despesa" }, { value: "RECEITA", label: "Receita" }]} />
          <SelectMenu value={fTipo} onChange={setFTipo} className="w-48" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Tipo: todos" }, ...Object.entries(TIPO_CONTRATO).map(([value, label]) => ({ value, label }))]} />
          {aba === "ativos" && <SelectMenu value={fStatus} onChange={setFStatus} className="w-40" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Status: todos" }, { value: "MINUTA", label: "Minuta" }, { value: "VIGENTE", label: "Vigente" }, { value: "EM_RENOVACAO", label: "Em renovação" }, { value: "SUSPENSO", label: "Suspenso" }]} />}
          <SelectMenu value={fResp} onChange={setFResp} className="w-48" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Responsável: todos" }, ...lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))]} />
          <SelectMenu value={fVence} onChange={setFVence} className="w-44" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Vencimento: qualquer" }, { value: "30", label: "Vence em 30 dias" }, { value: "90", label: "Vence em 90 dias" }, { value: "180", label: "Vence em 180 dias" }]} />
          <span className="ml-auto text-xs text-muted-foreground">{vis.length} de {rows.length} · comprometido {fmtBRL(totalMes)}/mês</span>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">Contrato</th><th className="text-left px-3 py-2 font-semibold">Contraparte</th><th className="text-left px-3 py-2 font-semibold">Tipo</th><th className="text-left px-3 py-2 font-semibold">Vigência</th><th className="text-right px-3 py-2 font-semibold">Valor/mês</th><th className="text-left px-3 py-2 font-semibold">Próximo evento</th><th className="text-left px-3 py-2 font-semibold">Status</th><th className="text-left px-3 py-2 font-semibold">Situação</th><th className="text-left px-3 py-2 font-semibold">Responsável</th>
              </tr></thead>
              <tbody>
                {vis.map((r) => {
                  const ev = r.proximoEvento; const d = ev ? Math.ceil((new Date(ev.data).getTime() - Date.now()) / 86_400_000) : null;
                  return (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30">
                      <td className="px-4 py-2"><Link href={`/contratos/${r.id}`} className="text-foreground hover:text-info"><span className="text-xs text-muted-foreground mr-1">{r.numero}</span>{r.titulo}</Link>{r.tags.length > 0 && <p className="text-[10px] text-muted-foreground">{r.tags.join(" · ")}</p>}</td>
                      <td className="px-3 py-2"><span className={cn("text-[10px] px-1 rounded mr-1", LADO[r.lado]?.cls)}>{LADO[r.lado]?.label}</span>{nomeParte(r.fornecedor ?? r.cliente)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{TIPO_CONTRATO[r.tipo] ?? r.tipo}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtData(r.inicio)} → {r.fimVigente ? fmtData(r.fimVigente) : "indet."}{r.renovacao === "AUTOMATICA" && <span className="text-[10px] ml-1 text-warning">auto</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.valorMensal ? fmtBRL(r.valorMensal) : "—"}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{ev ? <><span className={cn(d !== null && d < 0 ? "text-danger" : d !== null && d <= 30 ? "text-warning" : "text-muted-foreground")}>{fmtData(ev.data)}</span> <span className="text-muted-foreground">{TIPO_EVENTO[ev.tipo] ?? ev.tipo}</span></> : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-3 py-2"><StatusBadge s={r.status} /></td>
                      <td className="px-3 py-2"><Semaforo s={r.semaforo} /></td>
                      <td className="px-3 py-2 text-muted-foreground">{r.responsavel.nome}</td>
                    </tr>
                  );
                })}
                {vis.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">{rows.length === 0 ? "Nenhum contrato ainda — use “Novo contrato”." : "Nenhum contrato com esses filtros."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CreateDrawer open={novo} onOpenChange={setNovo} title="Novo contrato" width="xl" onCreated={load}>
        <ContratoForm />
      </CreateDrawer>
    </div>
  );
}
