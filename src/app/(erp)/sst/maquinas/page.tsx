"use client";

// Inventário de máquinas (NR-12): status de conformidade, proteções pendentes,
// vínculo com os ativos da Manutenção e cadastro manual.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Search, Link2 } from "lucide-react";
import { StatusMaquinaBadge, STATUS_MAQUINA, useLookups } from "@/components/sst/comum";

type Maq = { id: string; nome: string; local: string | null; codApl: number | null; status: string; tarefaId: string | null; setor: { id: string; nome: string } | null; protecoes: { id: string; conforme: boolean }[] };
type Ativo = { id: string; codApl: number; tag: string; descricao: string; caminho: string; jaCadastrada: boolean };

export default function SstMaquinasPage() {
  useTabTitle("SST — Máquinas");
  const router = useRouter();
  const lk = useLookups();
  const [lista, setLista] = useState<Maq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = usePersistedState<string>("sst:maquinas:status", "");
  async function load() { setLoading(true); const j = await fetch("/api/sst/maquinas").then((r) => r.json()); setLista(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); }, []);
  // tag do ativo da Manutenção por codApl (coluna "Ativo")
  const [tagPorCod, setTagPorCod] = useState<Record<number, string>>({});
  useEffect(() => { fetch("/api/pcm/ativos/lista").then((r) => (r.ok ? r.json() : { data: [] })).then((j) => setTagPorCod(Object.fromEntries((j.data ?? []).map((a: { codApl: number; tag: string }) => [a.codApl, a.tag])))).catch(() => {}); }, []);
  const visiveis = useMemo(() => lista.filter((m) => !filtro || m.status === filtro).filter((m) => !busca || `${m.nome} ${m.local ?? ""} ${m.setor?.nome ?? ""}`.toLowerCase().includes(busca.toLowerCase())), [lista, filtro, busca]);
  const contagem = (s: string) => lista.filter((m) => m.status === s).length;

  // nova máquina
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(""); const [local, setLocal] = useState(""); const [setorId, setSetorId] = useState(""); const [fab, setFab] = useState(""); const [ano, setAno] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSaving(true); setErro("");
    const res = await fetch("/api/sst/maquinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, local: local || null, setorId: setorId || null, fabricante: fab || null, anoFabricacao: ano || null }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); router.push(`/sst/maquinas/${j.data.id}`);
  }

  // vincular ativos da Manutenção (cria a máquina já ligada ao ativo)
  const [imp, setImp] = useState(false); const [ativos, setAtivos] = useState<Ativo[] | null>(null); const [impErro, setImpErro] = useState(""); const [impSel, setImpSel] = useState<Record<number, boolean>>({}); const [impBusca, setImpBusca] = useState("");
  async function abrirImport() {
    setImp(true); setAtivos(null); setImpErro(""); setImpSel({});
    const res = await fetch("/api/sst/maquinas/ativos").catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setImpErro(j?.error || "Não foi possível carregar os ativos da Manutenção."); setAtivos([]); return; }
    setAtivos(j.data ?? []);
  }
  async function importar() {
    const sel = (ativos ?? []).filter((a) => impSel[a.codApl]);
    if (sel.length === 0) return;
    setSaving(true);
    const res = await fetch("/api/sst/maquinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lote: sel.map((a) => ({ nome: a.descricao, local: a.caminho || null, codApl: a.codApl })) }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setImpErro(j.error || "Erro"); return; }
    setImp(false); load();
  }

  return (
    <div>
      <PageHeader title="Máquinas e equipamentos" subtitle="Inventário NR-12 — status de proteção, apreciação de risco e evidências" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Máquinas" }]}
        action={<div className="flex gap-2"><Button variant="outline" onClick={abrirImport} className="gap-1.5"><Link2 className="w-4 h-4" /> Vincular ativos da Manutenção</Button><Button onClick={() => { setNome(""); setLocal(""); setSetorId(""); setFab(""); setAno(""); setErro(""); setOpen(true); }} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova máquina</Button></div>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltro("")} className={cn("text-xs px-2.5 py-1 rounded-full border", !filtro ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>Todas ({lista.length})</button>
          {Object.entries(STATUS_MAQUINA).map(([k, v]) => contagem(k) > 0 || filtro === k ? (
            <button key={k} onClick={() => setFiltro(filtro === k ? "" : k)} className={cn("text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5", filtro === k ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}><span className={cn("w-2 h-2 rounded-full", v.dot)} />{v.label} ({contagem(k)})</button>
          ) : null)}
          <div className="relative ml-auto"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar máquina, local, setor…" className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" /></div>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Máquina</th><th className="text-left px-3 py-2 font-semibold">Local</th><th className="text-left px-3 py-2 font-semibold">Setor</th><th className="text-left px-3 py-2 font-semibold">Status</th><th className="text-left px-3 py-2 font-semibold">Proteções</th><th className="text-left px-3 py-2 font-semibold">Ativo (Manutenção)</th><th className="text-left px-3 py-2 font-semibold">Tarefa</th></tr></thead>
              <tbody>
                {visiveis.map((m) => { const ok = m.protecoes.filter((p) => p.conforme).length; return (
                  <tr key={m.id} onClick={() => router.push(`/sst/maquinas/${m.id}`)} className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className="px-4 py-2 text-foreground">{m.nome}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.local ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.setor?.nome ?? "—"}</td>
                    <td className="px-3 py-2"><StatusMaquinaBadge s={m.status} /></td>
                    <td className="px-3 py-2 text-xs">{m.protecoes.length === 0 ? <span className="text-muted-foreground/60">—</span> : <span className={cn(ok === m.protecoes.length ? "text-success" : "text-danger font-medium")}>{ok}/{m.protecoes.length} conformes</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{m.codApl ? tagPorCod[m.codApl] ?? `#${m.codApl}` : "—"}</td>
                    <td className="px-3 py-2 text-xs">{m.tarefaId ? <span className="text-info">vinculada</span> : <span className="text-muted-foreground/60">—</span>}</td>
                  </tr>
                ); })}
                {visiveis.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma máquina. Vincule ativos da Manutenção ou cadastre à mão.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nova máquina</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Exaustor 04" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Local</Label><Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Pré-forno" /></div>
              <div><Label>Setor</Label><SelectMenu value={setorId} onChange={setSetorId} options={[{ value: "", label: "—" }, ...lk.setores.map((s) => ({ value: s.id, label: s.nome }))]} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fabricante</Label><Input value={fab} onChange={(e) => setFab(e.target.value)} /></div>
              <div><Label>Ano de fabricação</Label><Input type="number" value={ano} onChange={(e) => setAno(e.target.value)} /></div>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Criar e abrir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imp} onOpenChange={setImp}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Vincular ativos da Manutenção</DialogTitle></DialogHeader>
          {ativos === null ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
            <div className="space-y-3">
              {impErro && <p className="text-sm text-danger">{impErro}</p>}
              <input value={impBusca} onChange={(e) => setImpBusca(e.target.value)} placeholder="filtrar por descrição, tag ou caminho…" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-card" />
              <div className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border/60">
                {ativos.filter((a) => !impBusca || `${a.descricao} ${a.tag} ${a.caminho}`.toLowerCase().includes(impBusca.toLowerCase())).slice(0, 400).map((a) => (
                  <label key={a.codApl} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", a.jaCadastrada ? "opacity-50" : "cursor-pointer hover:bg-muted/40")}>
                    <input type="checkbox" className="rounded" disabled={a.jaCadastrada} checked={!!impSel[a.codApl]} onChange={(e) => setImpSel({ ...impSel, [a.codApl]: e.target.checked })} />
                    <span className="flex-1 text-foreground">{a.descricao} <span className="text-xs text-muted-foreground">{a.tag}</span></span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-[40%]">{a.jaCadastrada ? "já no inventário" : a.caminho}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{Object.values(impSel).filter(Boolean).length} selecionado(s). O caminho na árvore vira o &quot;local&quot;; ajuste depois na ficha.</p>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setImp(false)}>Cancelar</Button><Button onClick={importar} disabled={saving || !ativos || Object.values(impSel).filter(Boolean).length === 0}>{saving ? "Vinculando…" : "Vincular selecionados"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
