"use client";

// Funções SST e seus requisitos (EPIs obrigatórios, exames e periodicidade).
import { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";

type TreinTipo = { id: string; nome: string; norma: string | null; ativo: boolean };
type Funcao = { id: string; nome: string; cbo: string | null; grauRisco: number | null; ativo: boolean; requisitosTreinamento: { treinamentoTipoId: string; treinamentoTipo: { id: string; nome: string } }[]; requisitosEpi: { epiId: string; obrigatorio: boolean; quantidade: number; epi: { id: string; nome: string; ca: string | null } }[]; requisitosExame: { exameTipoId: string; periodicidadeMeses: number; exameTipo: { id: string; nome: string } }[]; _count: { colaboradores: number } };
type Epi = { id: string; nome: string; ca: string | null; ativo: boolean };
type ExameTipo = { id: string; nome: string; periodicidadeMeses: number | null; ativo: boolean };

export default function SstConfigPage() {
  useTabTitle("SST — Funções e requisitos");
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [tipos, setTipos] = useState<ExameTipo[]>([]);
  const [treinos, setTreinos] = useState<TreinTipo[]>([]);
  const [rTreinos, setRTreinos] = useState<string[]>([]);
  const [addTreino, setAddTreino] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const [f, e, t, tr] = await Promise.all([fetch("/api/sst/funcoes").then((r) => r.json()), fetch("/api/sst/epis").then((r) => r.json()), fetch("/api/sst/exames-tipos").then((r) => r.json()), fetch("/api/sst/treinamentos-tipos").then((r) => r.json())]);
    setFuncoes(f.data ?? []); setEpis(e.data ?? []); setTipos(t.data ?? []); setTreinos(tr.data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [cbo, setCbo] = useState(""); const [grau, setGrau] = useState("");
  const [rEpis, setREpis] = useState<{ epiId: string; obrigatorio: boolean; quantidade: number }[]>([]);
  const [rExames, setRExames] = useState<{ exameTipoId: string; periodicidadeMeses: number }[]>([]);
  const [addEpi, setAddEpi] = useState(""); const [addExame, setAddExame] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(f?: Funcao) {
    setEditId(f?.id ?? null); setNome(f?.nome ?? ""); setCbo(f?.cbo ?? ""); setGrau(f?.grauRisco ? String(f.grauRisco) : "");
    setREpis(f?.requisitosEpi.map((r) => ({ epiId: r.epiId, obrigatorio: r.obrigatorio, quantidade: r.quantidade })) ?? []);
    setRExames(f?.requisitosExame.map((r) => ({ exameTipoId: r.exameTipoId, periodicidadeMeses: r.periodicidadeMeses })) ?? []);
    setRTreinos(f?.requisitosTreinamento.map((r) => r.treinamentoTipoId) ?? []); setAddTreino("");
    setAddEpi(""); setAddExame(""); setErro(""); setOpen(true);
  }
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome da função."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/funcoes/${editId}` : "/api/sst/funcoes", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, cbo: cbo || null, grauRisco: grau || null, epis: rEpis, exames: rExames, treinamentos: rTreinos.map((treinamentoTipoId) => ({ treinamentoTipoId })) }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  const [del, setDel] = useState<Funcao | null>(null);
  async function excluir() { if (!del) return; setSaving(true); const res = await fetch(`/api/sst/funcoes/${del.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) alert(j.error || "Erro"); setDel(null); load(); }
  async function alternarAtivo(f: Funcao) { await fetch(`/api/sst/funcoes/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !f.ativo }) }); load(); }

  return (
    <div>
      <PageHeader title="Funções e requisitos" subtitle="O que cada função exige: EPIs, exames e periodicidade" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Configurações" }]}
        action={<Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova função</Button>} />
      <div className="px-8 pb-8 space-y-3">
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : funcoes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma função SST. Comece pelas funções do chão de fábrica (operador de máquina, forneiro, eletricista…) e defina os EPIs e exames de cada uma.</p>
        ) : funcoes.map((f) => (
          <div key={f.id} className={cn("bg-card rounded-xl border border-border p-4", !f.ativo && "opacity-50")}>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">{f.nome}</h3>
              {f.cbo && <span className="text-xs text-muted-foreground">CBO {f.cbo}</span>}
              {f.grauRisco && <span className="text-xs px-1.5 rounded bg-muted text-muted-foreground">risco {f.grauRisco}</span>}
              <span className="text-xs text-muted-foreground ml-auto">{f._count.colaboradores} colaborador(es)</span>
              <button onClick={() => alternarAtivo(f)} className="text-xs text-muted-foreground hover:text-foreground">{f.ativo ? "inativar" : "ativar"}</button>
              <button onClick={() => abrir(f)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => setDel(f)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="mt-2 grid md:grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs font-semibold text-muted-foreground mb-1">Treinamentos</p>
                {f.requisitosTreinamento.length === 0 ? <p className="text-xs text-muted-foreground italic">nenhum</p> : <div className="flex flex-wrap gap-1">{f.requisitosTreinamento.map((r) => <span key={r.treinamentoTipoId} className="text-xs px-2 py-0.5 rounded-full border border-border text-foreground">{r.treinamentoTipo.nome}</span>)}</div>}</div>
              <div><p className="text-xs font-semibold text-muted-foreground mb-1">EPIs</p>
                {f.requisitosEpi.length === 0 ? <p className="text-xs text-muted-foreground italic">nenhum</p> : <div className="flex flex-wrap gap-1">{f.requisitosEpi.map((r) => <span key={r.epiId} className={cn("text-xs px-2 py-0.5 rounded-full border", r.obrigatorio ? "border-info/30 bg-info/5 text-info" : "border-border text-muted-foreground")}>{r.quantidade > 1 ? `${r.quantidade}× ` : ""}{r.epi.nome}{!r.obrigatorio && " (opcional)"}</span>)}</div>}</div>
              <div><p className="text-xs font-semibold text-muted-foreground mb-1">Exames</p>
                {f.requisitosExame.length === 0 ? <p className="text-xs text-muted-foreground italic">nenhum (ASO periódico a cada 12 meses)</p> : <div className="flex flex-wrap gap-1">{f.requisitosExame.map((r) => <span key={r.exameTipoId} className="text-xs px-2 py-0.5 rounded-full border border-border text-foreground">{r.exameTipo.nome} · {r.periodicidadeMeses}m</span>)}</div>}</div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editId ? "Editar função" : "Nova função SST"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Operador de máquinas" /></div>
              <div><Label>CBO</Label><Input value={cbo} onChange={(e) => setCbo(e.target.value)} /></div>
              <div><Label>Grau de risco</Label><SelectMenu value={grau} onChange={setGrau} options={[{ value: "", label: "—" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} /></div>
            </div>
            <div>
              <Label>EPIs exigidos</Label>
              <div className="mt-1 space-y-1">
                {rEpis.map((r, i) => { const e = epis.find((x) => x.id === r.epiId); return (
                  <div key={r.epiId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-foreground">{e?.nome ?? r.epiId}</span>
                    <Input type="number" min={1} value={r.quantidade} onChange={(ev) => setREpis(rEpis.map((x, j) => j === i ? { ...x, quantidade: Number(ev.target.value) || 1 } : x))} className="h-8 w-16 text-xs" />
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" className="rounded" checked={r.obrigatorio} onChange={(ev) => setREpis(rEpis.map((x, j) => j === i ? { ...x, obrigatorio: ev.target.checked } : x))} /> obrigatório</label>
                    <button onClick={() => setREpis(rEpis.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger"><X className="w-3.5 h-3.5" /></button>
                  </div>); })}
                <div className="flex gap-2">
                  <SelectMenu value={addEpi} onChange={setAddEpi} placeholder="Adicionar EPI…" className="flex-1" options={epis.filter((e) => e.ativo && !rEpis.some((r) => r.epiId === e.id)).map((e) => ({ value: e.id, label: e.ca ? `${e.nome} · CA ${e.ca}` : e.nome }))} />
                  <Button size="sm" variant="outline" disabled={!addEpi} onClick={() => { setREpis([...rEpis, { epiId: addEpi, obrigatorio: true, quantidade: 1 }]); setAddEpi(""); }}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
            <div>
              <Label>Exames complementares e periodicidade</Label>
              <div className="mt-1 space-y-1">
                {rExames.map((r, i) => { const t = tipos.find((x) => x.id === r.exameTipoId); return (
                  <div key={r.exameTipoId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-foreground">{t?.nome ?? r.exameTipoId}</span>
                    <span className="text-xs text-muted-foreground">a cada</span>
                    <Input type="number" min={1} value={r.periodicidadeMeses} onChange={(ev) => setRExames(rExames.map((x, j) => j === i ? { ...x, periodicidadeMeses: Number(ev.target.value) || 12 } : x))} className="h-8 w-16 text-xs" />
                    <span className="text-xs text-muted-foreground">meses</span>
                    <button onClick={() => setRExames(rExames.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger"><X className="w-3.5 h-3.5" /></button>
                  </div>); })}
                <div className="flex gap-2">
                  <SelectMenu value={addExame} onChange={setAddExame} placeholder="Adicionar exame…" className="flex-1" options={tipos.filter((t) => t.ativo && !rExames.some((r) => r.exameTipoId === t.id)).map((t) => ({ value: t.id, label: t.nome }))} />
                  <Button size="sm" variant="outline" disabled={!addExame} onClick={() => { const t = tipos.find((x) => x.id === addExame); setRExames([...rExames, { exameTipoId: addExame, periodicidadeMeses: t?.periodicidadeMeses ?? 12 }]); setAddExame(""); }}><Plus className="w-4 h-4" /></Button>
                </div>
                <p className="text-[11px] text-muted-foreground">A menor periodicidade vira a validade padrão do ASO periódico. Tipos de exame: em ASO e exames.</p>
              </div>
            </div>
            <div>
              <Label>Treinamentos obrigatórios</Label>
              <div className="mt-1 space-y-1">
                {rTreinos.map((id) => <div key={id} className="flex items-center gap-2 text-sm"><span className="flex-1 text-foreground">{treinos.find((t) => t.id === id)?.nome ?? id}</span><button onClick={() => setRTreinos(rTreinos.filter((x) => x !== id))} className="text-muted-foreground hover:text-danger"><X className="w-3.5 h-3.5" /></button></div>)}
                <div className="flex gap-2">
                  <SelectMenu value={addTreino} onChange={setAddTreino} placeholder="Adicionar treinamento…" className="flex-1" options={treinos.filter((t) => t.ativo && !rTreinos.includes(t.id)).map((t) => ({ value: t.id, label: t.norma ? `${t.nome} (${t.norma})` : t.nome }))} />
                  <Button size="sm" variant="outline" disabled={!addTreino} onClick={() => { setRTreinos([...rTreinos, addTreino]); setAddTreino(""); }}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir função?" description={`${del?.nome ?? ""} — só é possível sem colaboradores vinculados.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
