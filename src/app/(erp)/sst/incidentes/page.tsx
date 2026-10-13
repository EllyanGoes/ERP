"use client";

// Incidentes e acidentes: registro rápido, lista com status/CAT e indicadores do ano.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Siren } from "lucide-react";
import { TIPO_INCIDENTE, STATUS_INCIDENTE, fmtData, hojeISO, useLookups } from "@/components/sst/comum";

type Inc = { id: string; numero: string; tipo: string; data: string; local: string | null; status: string; catNumero: string | null; diasAfastamento: number | null; descricao: string; colaborador: { id: string; nome: string } | null; setor: { nome: string } | null; maquina: { nome: string } | null; acoes: { concluidaEm: string | null }[] };
type Colab = { id: string; nome: string; ativo: boolean };

export default function SstIncidentesPage() {
  useTabTitle("SST — Incidentes");
  const router = useRouter();
  const lk = useLookups();
  const [lista, setLista] = useState<Inc[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  async function load() { setLoading(true); const j = await fetch("/api/sst/incidentes").then((r) => r.json()); setLista(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setColabs(j.data ?? [])); }, []);
  const visiveis = useMemo(() => lista.filter((i) => !filtro || (filtro === "ABERTOS" ? i.status !== "ENCERRADO" : i.status === filtro)), [lista, filtro]);
  const ano = new Date().getFullYear();
  const doAno = lista.filter((i) => new Date(i.data).getFullYear() === ano);

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tipo: "QUASE_ACIDENTE", data: hojeISO(), descricao: "", local: "", setorId: "", maquinaId: "", colaboradorId: "", parteCorpo: "", agente: "", diasAfastamento: "" });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  async function salvar() {
    if (!f.descricao.trim()) { setErro("Descreva o ocorrido."); return; }
    setSaving(true); setErro("");
    const res = await fetch("/api/sst/incidentes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); router.push(`/sst/incidentes/${j.data.id}`);
  }

  return (
    <div>
      <PageHeader title="Incidentes e acidentes" subtitle="Registro, investigação, CAT e ações corretivas" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Incidentes" }]}
        action={<Button onClick={() => { setF({ tipo: "QUASE_ACIDENTE", data: hojeISO(), descricao: "", local: "", setorId: "", maquinaId: "", colaboradorId: "", parteCorpo: "", agente: "", diasAfastamento: "" }); setErro(""); setOpen(true); }} className="bg-danger hover:bg-danger/90 text-white gap-1.5"><Siren className="w-4 h-4" /> Registrar ocorrência</Button>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[["Ocorrências em " + ano, doAno.length, "text-foreground"], ["Com afastamento", doAno.filter((i) => i.tipo === "ACIDENTE_COM_AFASTAMENTO").length, "text-danger"], ["Dias perdidos", doAno.reduce((s, i) => s + (i.diasAfastamento ?? 0), 0), "text-danger"], ["Quase acidentes", doAno.filter((i) => i.tipo === "QUASE_ACIDENTE").length, "text-warning"], ["Em aberto", lista.filter((i) => i.status !== "ENCERRADO").length, "text-info"]].map(([l, v, c]) => (
            <div key={String(l)} className="bg-card rounded-xl border border-border p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={cn("mt-1 text-2xl font-semibold", String(c))}>{v}</div></div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {[["", "Todos"], ["ABERTOS", "Em aberto"], ["ABERTO", "Aberto"], ["EM_INVESTIGACAO", "Em investigação"], ["ACAO_DEFINIDA", "Ação definida"], ["ENCERRADO", "Encerrado"]].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={cn("text-xs px-2.5 py-1 rounded-full border", filtro === k ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{l}</button>
          ))}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Nº</th><th className="text-left px-3 py-2 font-semibold">Data</th><th className="text-left px-3 py-2 font-semibold">Tipo</th><th className="text-left px-3 py-2 font-semibold">Colaborador</th><th className="text-left px-3 py-2 font-semibold">Local / máquina</th><th className="text-left px-3 py-2 font-semibold">Status</th><th className="text-left px-3 py-2 font-semibold">CAT</th><th className="text-left px-3 py-2 font-semibold">Ações</th></tr></thead>
              <tbody>
                {visiveis.map((i) => { const exigeCat = ["ACIDENTE_COM_AFASTAMENTO", "DOENCA_OCUPACIONAL", "TRAJETO"].includes(i.tipo); return (
                  <tr key={i.id} onClick={() => router.push(`/sst/incidentes/${i.id}`)} className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className="px-4 py-2 font-medium text-foreground">{i.numero}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtData(i.data)}</td>
                    <td className="px-3 py-2"><span className={cn("text-[11px] px-1.5 py-0.5 rounded", TIPO_INCIDENTE[i.tipo]?.cls)}>{TIPO_INCIDENTE[i.tipo]?.label ?? i.tipo}</span></td>
                    <td className="px-3 py-2 text-foreground">{i.colaborador?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{[i.local, i.maquina?.nome, i.setor?.nome].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2"><span className={cn("text-[11px] px-1.5 py-0.5 rounded", STATUS_INCIDENTE[i.status]?.cls)}>{STATUS_INCIDENTE[i.status]?.label}</span></td>
                    <td className="px-3 py-2 text-xs">{i.catNumero ? <span className="text-success">{i.catNumero}</span> : exigeCat ? <span className="text-danger font-medium">não emitida</span> : <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i.acoes.length === 0 ? "—" : `${i.acoes.filter((a) => a.concluidaEm).length}/${i.acoes.length}`}</td>
                  </tr>
                ); })}
                {visiveis.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma ocorrência registrada.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Registrar ocorrência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Tipo</Label><SelectMenu value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={Object.entries(TIPO_INCIDENTE).map(([value, v]) => ({ value, label: v.label }))} /></div>
              <div><Label>Data</Label><DatePicker value={f.data} onChange={(v) => setF({ ...f, data: v })} /></div>
            </div>
            <div><Label>O que aconteceu</Label><textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} rows={3} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Descreva o ocorrido, como foi identificado e o que foi feito na hora" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Colaborador</Label><SelectMenu value={f.colaboradorId} onChange={(v) => setF({ ...f, colaboradorId: v })} placeholder="—" options={[{ value: "", label: "— Sem vítima / não se aplica —" }, ...colabs.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))]} /></div>
              <div><Label>Setor</Label><SelectMenu value={f.setorId} onChange={(v) => setF({ ...f, setorId: v })} options={[{ value: "", label: "—" }, ...lk.setores.map((s) => ({ value: s.id, label: s.nome }))]} /></div>
              <div><Label>Máquina</Label><SelectMenu value={f.maquinaId} onChange={(v) => setF({ ...f, maquinaId: v })} options={[{ value: "", label: "—" }, ...lk.maquinas.map((m) => ({ value: m.id, label: m.local ? `${m.nome} (${m.local})` : m.nome }))]} /></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Local</Label><Input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} /></div>
              <div><Label>Parte do corpo</Label><Input value={f.parteCorpo} onChange={(e) => setF({ ...f, parteCorpo: e.target.value })} /></div>
              <div><Label>Agente causador</Label><Input value={f.agente} onChange={(e) => setF({ ...f, agente: e.target.value })} placeholder="queda, corte, prensagem…" /></div>
              <div><Label>Dias de afastamento</Label><Input type="number" min={0} value={f.diasAfastamento} onChange={(e) => setF({ ...f, diasAfastamento: e.target.value })} /></div>
            </div>
            {["ACIDENTE_COM_AFASTAMENTO", "DOENCA_OCUPACIONAL", "TRAJETO"].includes(f.tipo) && <p className="text-xs text-danger">Este tipo exige CAT até o primeiro dia útil seguinte — registre o número na ficha da ocorrência.</p>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving} className="gap-1.5"><Plus className="w-4 h-4" /> {saving ? "Registrando…" : "Registrar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
