"use client";

// ASO e exames: agenda de vencimentos (quem precisa de exame nos próximos
// dias) + tipos de exame complementar.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { SeveridadeBadge, fmtData, type Pendencia } from "@/components/sst/comum";

type Colab = { id: string; nome: string; ativo: boolean; setor: string | null; funcao: { nome: string } | null; pendencias: Pendencia[] };
type ExameTipo = { id: string; nome: string; periodicidadeMeses: number | null; ativo: boolean; _count: { requisitos: number; asoExames: number } };

const TIPOS_SAUDE = ["ASO_INEXISTENTE", "ASO_VENCIDO", "ASO_VENCE_EM_BREVE", "ASO_INAPTO", "ASO_DEMISSIONAL_PENDENTE", "EXAME_PENDENTE"];

export default function SstSaudePage() {
  useTabTitle("SST — ASO e exames");
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [tipos, setTipos] = useState<ExameTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [janela, setJanela] = useState("60");
  async function load() {
    setLoading(true);
    const [c, t] = await Promise.all([fetch("/api/sst/colaboradores").then((r) => r.json()), fetch("/api/sst/exames-tipos").then((r) => r.json())]);
    setColabs(c.data ?? []); setTipos(t.data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const agenda = useMemo(() => {
    const lim = Date.now() + Number(janela) * 86_400_000;
    return colabs.filter((c) => c.ativo).flatMap((c) => c.pendencias.filter((p) => TIPOS_SAUDE.includes(p.tipo)).filter((p) => !p.vence || new Date(p.vence).getTime() <= lim).map((p) => ({ ...p, colaboradorNome: c.nome, setor: c.setor, funcao: c.funcao?.nome })))
      .sort((a, b) => (a.vence ? new Date(a.vence).getTime() : 0) - (b.vence ? new Date(b.vence).getTime() : 0));
  }, [colabs, janela]);

  // tipos de exame
  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [per, setPer] = useState(""); const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(t?: ExameTipo) { setEditId(t?.id ?? null); setNome(t?.nome ?? ""); setPer(t?.periodicidadeMeses ? String(t.periodicidadeMeses) : ""); setErro(""); setOpen(true); }
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/exames-tipos/${editId}` : "/api/sst/exames-tipos", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, periodicidadeMeses: per || null }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  const [del, setDel] = useState<ExameTipo | null>(null);
  async function excluir() { if (!del) return; setSaving(true); const res = await fetch(`/api/sst/exames-tipos/${del.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) alert(j.error || "Erro"); setDel(null); load(); }

  return (
    <div>
      <PageHeader title="ASO e exames" subtitle="Saúde ocupacional (NR-07) — agenda de vencimentos e tipos de exame" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "ASO e exames" }]}
        action={<Button onClick={() => abrir()} variant="outline" className="gap-1.5"><Plus className="w-4 h-4" /> Tipo de exame</Button>} />
      <div className="px-8 pb-8 grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Agenda — quem precisa de ASO/exame</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">próximos <SelectMenu value={janela} onChange={setJanela} className="w-28" options={[{ value: "30", label: "30 dias" }, { value: "60", label: "60 dias" }, { value: "90", label: "90 dias" }, { value: "3650", label: "todos" }]} /></div>
          </div>
          {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : agenda.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">Ninguém com ASO/exame pendente ou vencendo no período.</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-1.5 font-semibold">Colaborador</th><th className="text-left px-3 py-1.5 font-semibold">Função</th><th className="text-left px-3 py-1.5 font-semibold">Pendência</th><th className="text-left px-3 py-1.5 font-semibold">Severidade</th><th className="text-left px-3 py-1.5 font-semibold">Vence</th></tr></thead>
              <tbody>
                {agenda.map((p, i) => (
                  <tr key={i} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-2"><Link href={p.link} className="text-foreground hover:text-info">{p.colaboradorNome}</Link><span className="text-xs text-muted-foreground"> {p.setor ? `· ${p.setor}` : ""}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{p.funcao ?? "—"}</td>
                    <td className="px-3 py-2 text-foreground">{p.titulo}{p.detalhe && <span className="text-xs text-muted-foreground"> — {p.detalhe}</span>}</td>
                    <td className="px-3 py-2"><SeveridadeBadge s={p.severidade} /></td>
                    <td className={cn("px-3 py-2 text-xs", p.vence && new Date(p.vence).getTime() < Date.now() ? "text-danger font-medium" : "text-muted-foreground")}>{p.vence ? fmtData(p.vence) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="bg-card rounded-xl border border-border">
          <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Tipos de exame complementar</h2></div>
          <ul className="divide-y divide-border/60">
            {tipos.map((t) => (
              <li key={t.id} className={cn("px-4 py-2 flex items-center gap-2 text-sm", !t.ativo && "opacity-50")}>
                <span className="flex-1 text-foreground">{t.nome}</span>
                <span className="text-xs text-muted-foreground">{t.periodicidadeMeses ? `${t.periodicidadeMeses} m` : ""}</span>
                <button onClick={() => abrir(t)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDel(t)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
            {tipos.length === 0 && <li className="px-4 py-4 text-sm text-muted-foreground italic">Nenhum tipo. Ex.: Clínico, Audiometria, Espirometria, Hemograma, Raio-X de tórax.</li>}
          </ul>
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/60">A periodicidade por função é definida em Configurações → Funções.</p>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editId ? "Editar tipo de exame" : "Novo tipo de exame"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Audiometria" /></div>
            <div><Label>Periodicidade padrão (meses)</Label><Input type="number" min={1} value={per} onChange={(e) => setPer(e.target.value)} placeholder="12" /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir tipo de exame?" description={del?.nome ?? ""} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
