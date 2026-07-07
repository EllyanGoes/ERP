"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { Clock, Plus, Pencil, Trash2, Loader2, X, Save, Search } from "lucide-react";

type Faixa = { horaInicial: string; horaFinal: string };
type Horario = {
  id: string;
  nome: string;
  ativo: boolean;
  faixas: Faixa[];
  _count: { escalas: number };
};

// Máscara "HH:MM" progressiva.
const mHora = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
};
const minutos = (h: string) => {
  const m = h.match(/^(\d{2}):(\d{2})$/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
};
// Duração da faixa (vira o dia quando a final é menor — turno noturno).
const duracao = (f: Faixa) => {
  const i = minutos(f.horaInicial), fim = minutos(f.horaFinal);
  if (i === null || fim === null) return null;
  const d = (fim - i + 24 * 60) % (24 * 60);
  return d;
};
const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const resumo = (faixas: Faixa[]) => faixas.map((f) => `[${f.horaInicial} - ${f.horaFinal}]`).join(" ");

export default function HorariosTrabalhoPage() {
  useTabTitle("Horários de Trabalho");
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Form (create/edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fNome, setFNome] = useState("");
  const [fAtivo, setFAtivo] = useState(true);
  const [fFaixas, setFFaixas] = useState<Faixa[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/rh/horarios");
    const j = await res.json();
    setHorarios(Array.isArray(j.data) ? j.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setFNome("");
    setFAtivo(true);
    setFFaixas([{ horaInicial: "08:00", horaFinal: "12:00" }, { horaInicial: "13:30", horaFinal: "17:30" }]);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(h: Horario) {
    setEditingId(h.id);
    setFNome(h.nome);
    setFAtivo(h.ativo);
    setFFaixas(h.faixas.map((f) => ({ ...f })));
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave() {
    if (!fNome.trim()) { setFormError("Nome é obrigatório"); return; }
    if (fFaixas.length === 0 || fFaixas.some((f) => duracao(f) === null)) {
      setFormError("Preencha as horas de todas as faixas (HH:MM)"); return;
    }
    setSaving(true); setFormError("");
    try {
      const url = editingId ? `/api/rh/horarios/${editingId}` : "/api/rh/horarios";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: fNome.trim(), ativo: fAtivo, faixas: fFaixas }),
      });
      const j = await res.json();
      if (!res.ok) { setFormError(j.error || "Erro ao salvar"); return; }
      await load();
      setFormOpen(false);
    } catch {
      setFormError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true); setDeleteError("");
    try {
      const res = await fetch(`/api/rh/horarios/${deleteId}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) { setDeleteError(j.error || "Erro ao excluir"); return; }
      await load();
      setDeleteId(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  const filtered = horarios.filter((h) => h.nome.toLowerCase().includes(search.toLowerCase()));
  const totalForm = fFaixas.reduce((a, f) => a + (duracao(f) ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Horários de Trabalho"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Horários de Trabalho" }]}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo Horário
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar horários..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {formOpen && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm text-foreground">{editingId ? "Editar Horário" : "Novo Horário"}</h3>
            {formError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{formError}</p>
            )}

            <div className="space-y-1.5">
              <Label>Nome<span className="text-red-500 ml-0.5">*</span></Label>
              <Input value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Ex: HORÁRIO PADRÃO" autoFocus />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[7rem_7rem_6rem_2rem] gap-2 text-xs text-muted-foreground uppercase tracking-wide px-1">
                <span>Hora inicial</span><span>Hora final</span><span>Tempo</span><span />
              </div>
              {fFaixas.map((f, i) => {
                const d = duracao(f);
                return (
                  <div key={i} className="grid grid-cols-[7rem_7rem_6rem_2rem] gap-2 items-center">
                    <Input value={f.horaInicial} inputMode="numeric" placeholder="08:00" onChange={(e) => setFFaixas((fs) => fs.map((x, j) => j === i ? { ...x, horaInicial: mHora(e.target.value) } : x))} className="h-9 text-center" />
                    <Input value={f.horaFinal} inputMode="numeric" placeholder="12:00" onChange={(e) => setFFaixas((fs) => fs.map((x, j) => j === i ? { ...x, horaFinal: mHora(e.target.value) } : x))} className="h-9 text-center" />
                    <span className="text-sm text-muted-foreground tabular-nums text-center">{d !== null ? fmtMin(d) : "—"}</span>
                    <button onClick={() => setFFaixas((fs) => fs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger justify-self-center" title="Remover faixa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setFFaixas((fs) => [...fs, { horaInicial: "", horaFinal: "" }])}>
                  <Plus className="w-4 h-4 mr-1.5" /> Adicionar faixa
                </Button>
                {totalForm > 0 && <span className="text-xs text-muted-foreground">Total: <span className="font-semibold tabular-nums">{fmtMin(totalForm)}</span></span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="h-ativo" type="checkbox" checked={fAtivo} onChange={(e) => setFAtivo(e.target.checked)} className="rounded" />
              <Label htmlFor="h-ativo" className="cursor-pointer">Ativo</Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</> : <><Save className="w-4 h-4 mr-1" />Salvar</>}
              </Button>
            </div>
          </div>
        )}

        {deleteId && (
          <div className="border border-danger/30 rounded-xl p-4 bg-danger/10 space-y-3">
            <p className="text-sm text-danger font-medium">
              Confirmar exclusão do horário &ldquo;{horarios.find((h) => h.id === deleteId)?.nome}&rdquo;?
            </p>
            {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />} Excluir
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum horário cadastrado</p>
            <p className="text-muted-foreground text-sm mt-1">Clique em &quot;Novo Horário&quot; para criar o primeiro.</p>
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {filtered.map((h) => {
              const total = h.faixas.reduce((a, f) => a + (duracao(f) ?? 0), 0);
              return (
                <div key={h.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", h.ativo ? "bg-emerald-400" : "bg-muted-foreground/30")} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{h.nome}</p>
                      <p className="text-xs text-muted-foreground truncate tabular-nums">
                        {resumo(h.faixas)}{total > 0 ? ` · ${fmtMin(total)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground">
                      {h._count.escalas} escala{h._count.escalas !== 1 ? "s" : ""}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(h)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-danger hover:bg-danger/10" onClick={() => { setDeleteId(h.id); setDeleteError(""); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
