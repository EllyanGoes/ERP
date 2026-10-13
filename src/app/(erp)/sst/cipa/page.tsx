"use client";

// CIPA (NR-05): mandato vigente, membros (titulares/suplentes, empregador/
// empregados), ata de eleição e reuniões mensais com ata.
import { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, Users2, X } from "lucide-react";
import { UploadAnexo, DocLink, fmtData, hojeISO } from "@/components/sst/comum";

type Membro = { colaboradorId: string; papel: string; representa: string; colaborador: { id: string; nome: string } };
type Reuniao = { id: string; data: string; pauta: string | null; ataDocumentoId: string | null };
type Mandato = { id: string; inicio: string; fim: string; ataEleicaoDocumentoId: string | null; observacoes: string | null; membros: Membro[]; reunioes: Reuniao[] };
type Colab = { id: string; nome: string; ativo: boolean };
const PAPEIS = ["PRESIDENTE", "VICE", "SECRETARIO", "TITULAR", "SUPLENTE"];
const PAPEL_LABEL: Record<string, string> = { PRESIDENTE: "Presidente", VICE: "Vice-presidente", SECRETARIO: "Secretário(a)", TITULAR: "Titular", SUPLENTE: "Suplente" };

export default function SstCipaPage() {
  useTabTitle("SST — CIPA");
  const [mandatos, setMandatos] = useState<Mandato[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); const j = await fetch("/api/sst/cipa").then((r) => r.json()); setMandatos(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setColabs(j.data ?? [])); }, []);
  const hoje = Date.now();
  const vigente = mandatos.find((m) => new Date(m.inicio).getTime() <= hoje && new Date(m.fim).getTime() >= hoje) ?? null;

  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ inicio: hojeISO(), fim: "", observacoes: "" }); const [ata, setAta] = useState<string | null>(null);
  const [membros, setMembros] = useState<{ colaboradorId: string; papel: string; representa: string }[]>([]); const [addColab, setAddColab] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(m?: Mandato) {
    const fim = new Date(); fim.setFullYear(fim.getFullYear() + 1);
    setEditId(m?.id ?? null); setF({ inicio: m ? m.inicio.slice(0, 10) : hojeISO(), fim: m ? m.fim.slice(0, 10) : fim.toISOString().slice(0, 10), observacoes: m?.observacoes ?? "" }); setAta(m?.ataEleicaoDocumentoId ?? null);
    setMembros(m?.membros.map((x) => ({ colaboradorId: x.colaboradorId, papel: x.papel, representa: x.representa })) ?? []); setAddColab(""); setErro(""); setOpen(true);
  }
  async function salvar() {
    if (!f.inicio || !f.fim) { setErro("Informe início e fim."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/cipa/${editId}` : "/api/sst/cipa", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, ataEleicaoDocumentoId: ata, membros }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  // reunião
  const [dlgReu, setDlgReu] = useState<string | null>(null); const [reu, setReu] = useState({ data: hojeISO(), pauta: "" }); const [reuAta, setReuAta] = useState<string | null>(null);
  async function salvarReuniao() { if (!dlgReu) return; setSaving(true); await fetch(`/api/sst/cipa/${dlgReu}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...reu, ataDocumentoId: reuAta }) }); setSaving(false); setDlgReu(null); load(); }
  async function delReuniao(mid: string, rid: string) { await fetch(`/api/sst/cipa/${mid}?reuniaoId=${rid}`, { method: "DELETE" }); load(); }
  const [del, setDel] = useState<Mandato | null>(null);
  async function excluir() { if (!del) return; setSaving(true); await fetch(`/api/sst/cipa/${del.id}`, { method: "DELETE" }); setSaving(false); setDel(null); load(); }

  return (
    <div>
      <PageHeader title="CIPA" subtitle="Comissão Interna de Prevenção de Acidentes (NR-05) — mandato, membros e reuniões" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "CIPA" }]}
        action={<Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Users2 className="w-4 h-4" /> Novo mandato</Button>} />
      <div className="px-8 pb-8 space-y-4">
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : mandatos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum mandato. A NR-05 exige CIPA a partir de 20 empregados (dimensionamento pelo grau de risco); mandato de 1 ano, reuniões mensais com ata.</p>
        ) : mandatos.map((m) => { const ehVigente = vigente?.id === m.id; return (
          <div key={m.id} className={cn("bg-card rounded-xl border p-4", ehVigente ? "border-success/40" : "border-border opacity-80")}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm text-foreground">Mandato {fmtData(m.inicio)} → {fmtData(m.fim)}</h3>
              {ehVigente ? <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">vigente</span> : new Date(m.fim).getTime() < hoje ? <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">encerrado</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-info/15 text-info">futuro</span>}
              <DocLink id={m.ataEleicaoDocumentoId} label="ata de eleição" />
              <span className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { setReu({ data: hojeISO(), pauta: "" }); setReuAta(null); setDlgReu(m.id); }} className="gap-1"><Plus className="w-3.5 h-3.5" /> Reunião</Button>
                <button onClick={() => abrir(m)} className="text-xs text-info hover:underline">editar</button>
                <button onClick={() => setDel(m)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            </div>
            <div className="mt-3 grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Membros ({m.membros.length})</p>
                {["EMPREGADOR", "EMPREGADOS"].map((rep) => (
                  <div key={rep} className="mb-1"><span className="text-[11px] text-muted-foreground">{rep === "EMPREGADOR" ? "Representantes do empregador" : "Representantes dos empregados"}:</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">{m.membros.filter((x) => x.representa === rep).map((x) => <span key={x.colaboradorId} className="text-xs px-2 py-0.5 rounded-full border border-border text-foreground">{x.colaborador.nome} <span className="text-muted-foreground">· {PAPEL_LABEL[x.papel] ?? x.papel}</span></span>)}{m.membros.filter((x) => x.representa === rep).length === 0 && <span className="text-xs text-muted-foreground italic">nenhum</span>}</div></div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Reuniões ({m.reunioes.length})</p>
                {m.reunioes.length === 0 ? <p className="text-xs text-muted-foreground italic">nenhuma — a NR-05 pede reunião mensal com ata</p> : (
                  <ul className="space-y-0.5">{m.reunioes.map((r) => <li key={r.id} className="text-xs flex items-center gap-2"><span className="text-muted-foreground w-20">{fmtData(r.data)}</span><span className="flex-1 text-foreground truncate">{r.pauta ?? "—"}</span><DocLink id={r.ataDocumentoId} label="ata" /><button onClick={() => delReuniao(m.id, r.id)} className="text-muted-foreground hover:text-danger"><X className="w-3 h-3" /></button></li>)}</ul>
                )}
              </div>
            </div>
          </div>
        ); })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editId ? "Editar mandato" : "Novo mandato da CIPA"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-3">
              <div><Label>Início</Label><DatePicker value={f.inicio} onChange={(v) => setF({ ...f, inicio: v })} /></div>
              <div><Label>Fim</Label><DatePicker value={f.fim} onChange={(v) => setF({ ...f, fim: v })} /></div>
              <div><Label>Ata de eleição</Label><UploadAnexo tipo="outro" titulo={`Ata de eleição CIPA — ${f.inicio}`} value={ata} onChange={setAta} /></div>
            </div>
            <div>
              <Label>Membros</Label>
              <div className="mt-1 space-y-1">
                {membros.map((x, idx) => (
                  <div key={x.colaboradorId} className="grid grid-cols-[1fr_150px_190px_auto] gap-2 items-center text-sm">
                    <span className="text-foreground truncate">{colabs.find((c) => c.id === x.colaboradorId)?.nome ?? x.colaboradorId}</span>
                    <SelectMenu value={x.papel} onChange={(v) => setMembros(membros.map((y, j) => j === idx ? { ...y, papel: v } : y))} options={PAPEIS.map((p) => ({ value: p, label: PAPEL_LABEL[p] }))} />
                    <SelectMenu value={x.representa} onChange={(v) => setMembros(membros.map((y, j) => j === idx ? { ...y, representa: v } : y))} options={[{ value: "EMPREGADOS", label: "Repr. empregados" }, { value: "EMPREGADOR", label: "Repr. empregador" }]} />
                    <button onClick={() => setMembros(membros.filter((_, j) => j !== idx))} className="text-muted-foreground hover:text-danger"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <div className="flex gap-2"><SelectMenu value={addColab} onChange={setAddColab} placeholder="Adicionar membro…" className="flex-1" options={colabs.filter((c) => c.ativo && !membros.some((x) => x.colaboradorId === c.id)).map((c) => ({ value: c.id, label: c.nome }))} /><Button size="sm" variant="outline" disabled={!addColab} onClick={() => { setMembros([...membros, { colaboradorId: addColab, papel: "TITULAR", representa: "EMPREGADOS" }]); setAddColab(""); }}><Plus className="w-4 h-4" /></Button></div>
              </div>
            </div>
            <div><Label>Observações</Label><Input value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!dlgReu} onOpenChange={(o) => !o && setDlgReu(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Reunião da CIPA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Data</Label><DatePicker value={reu.data} onChange={(v) => setReu({ ...reu, data: v })} /></div>
            <div><Label>Pauta / resumo</Label><Input value={reu.pauta} onChange={(e) => setReu({ ...reu, pauta: e.target.value })} /></div>
            <div><Label>Ata</Label><UploadAnexo tipo="outro" titulo={`Ata CIPA — ${reu.data}`} value={reuAta} onChange={setReuAta} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgReu(null)}>Cancelar</Button><Button onClick={salvarReuniao} disabled={saving}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir mandato?" description="Membros e reuniões deste mandato são apagados." onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
