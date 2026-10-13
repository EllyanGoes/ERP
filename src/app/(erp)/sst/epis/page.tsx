"use client";

// Cadastro de EPIs (CA, validade, vida útil, item de estoque) + entrega em lote.
import { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, Users } from "lucide-react";
import { fmtData, hojeISO, useLookups, TIPO_ENTREGA } from "@/components/sst/comum";

type Epi = { id: string; nome: string; ca: string | null; caValidade: string | null; vidaUtilDias: number | null; fabricante: string | null; itemId: string | null; ativo: boolean; item: { id: string; codigo: string; descricao: string } | null; _count: { entregas: number; requisitos: number } };
type Colab = { id: string; nome: string; ativo: boolean; funcao: { nome: string } | null };

export default function SstEpisPage() {
  useTabTitle("SST — EPIs");
  const [epis, setEpis] = useState<Epi[]>([]);
  const [loading, setLoading] = useState(true);
  const lk = useLookups();
  const [colabs, setColabs] = useState<Colab[]>([]);
  async function load() { setLoading(true); const j = await fetch("/api/sst/epis").then((r) => r.json()); setEpis(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setColabs(j.data ?? [])); }, []);

  // form
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [ca, setCa] = useState(""); const [caValidade, setCaValidade] = useState(""); const [vida, setVida] = useState(""); const [fab, setFab] = useState(""); const [itemId, setItemId] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(e?: Epi) {
    setEditId(e?.id ?? null); setNome(e?.nome ?? ""); setCa(e?.ca ?? ""); setCaValidade(e?.caValidade ? e.caValidade.slice(0, 10) : ""); setVida(e?.vidaUtilDias ? String(e.vidaUtilDias) : ""); setFab(e?.fabricante ?? ""); setItemId(e?.itemId ?? ""); setErro(""); setOpen(true);
  }
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/epis/${editId}` : "/api/sst/epis", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, ca: ca || null, caValidade: caValidade || null, vidaUtilDias: vida || null, fabricante: fab || null, itemId: itemId || null }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  const [del, setDel] = useState<Epi | null>(null);
  async function excluir() { if (!del) return; setSaving(true); const res = await fetch(`/api/sst/epis/${del.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) { alert(j.error || "Erro"); } setDel(null); load(); }
  async function alternarAtivo(e: Epi) { await fetch(`/api/sst/epis/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !e.ativo }) }); load(); }

  // entrega em lote
  const [lote, setLote] = useState(false);
  const [lEpiId, setLEpiId] = useState(""); const [lSel, setLSel] = useState<Record<string, boolean>>({}); const [lData, setLData] = useState(hojeISO()); const [lLocal, setLLocal] = useState(""); const [lTipo, setLTipo] = useState("ENTREGA"); const [lBusca, setLBusca] = useState("");
  const epiLote = epis.find((e) => e.id === lEpiId);
  async function salvarLote() {
    const ids = Object.entries(lSel).filter(([, v]) => v).map(([k]) => k);
    if (!lEpiId || ids.length === 0) { setErro("Escolha o EPI e ao menos um colaborador."); return; }
    setSaving(true); setErro("");
    const res = await fetch("/api/sst/entregas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorIds: ids, epiId: lEpiId, tipo: lTipo, quantidade: 1, data: lData, localEstoqueId: lLocal || null, motivo: "Entrega em lote" }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setLote(false); setLSel({}); load();
  }

  return (
    <div>
      <PageHeader title="EPIs e entregas" subtitle="Equipamentos de proteção individual (NR-06)" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "EPIs" }]}
        action={<div className="flex gap-2"><Button variant="outline" onClick={() => { setErro(""); setLote(true); }} className="gap-1.5"><Users className="w-4 h-4" /> Entrega em lote</Button><Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo EPI</Button></div>} />
      <div className="px-8 pb-8">
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">EPI</th><th className="text-left px-3 py-2 font-semibold">CA</th><th className="text-left px-3 py-2 font-semibold">Validade do CA</th><th className="text-right px-3 py-2 font-semibold">Vida útil</th><th className="text-left px-3 py-2 font-semibold">Item de estoque</th><th className="text-right px-3 py-2 font-semibold">Entregas</th><th className="text-right px-3 py-2 font-semibold">Funções</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {epis.map((e) => {
                  const caVencido = e.caValidade ? new Date(e.caValidade).getTime() < Date.now() : false;
                  return (
                    <tr key={e.id} className={cn("border-t border-border/60", !e.ativo && "opacity-50")}>
                      <td className="px-4 py-2 text-foreground">{e.nome}{e.fabricante ? <span className="text-xs text-muted-foreground"> · {e.fabricante}</span> : null}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.ca ?? "—"}</td>
                      <td className={cn("px-3 py-2", caVencido ? "text-danger font-medium" : "text-muted-foreground")}>{fmtData(e.caValidade)}{caVencido && " (vencido)"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{e.vidaUtilDias ? `${e.vidaUtilDias} d` : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.item ? `${e.item.codigo} ${e.item.descricao}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e._count.entregas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e._count.requisitos}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => alternarAtivo(e)} className="text-xs text-muted-foreground hover:text-foreground mr-2">{e.ativo ? "inativar" : "ativar"}</button>
                        <button onClick={() => abrir(e)} className="text-muted-foreground hover:text-foreground mr-2" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDel(e)} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
                {epis.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum EPI cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar EPI" : "Novo EPI"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Protetor auricular tipo plug" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>CA</Label><Input value={ca} onChange={(e) => setCa(e.target.value)} /></div>
              <div><Label>Validade do CA</Label><DatePicker value={caValidade} onChange={setCaValidade} /></div>
              <div><Label>Vida útil (dias)</Label><Input type="number" min={1} value={vida} onChange={(e) => setVida(e.target.value)} placeholder="troca a cada" /></div>
            </div>
            <div><Label>Fabricante</Label><Input value={fab} onChange={(e) => setFab(e.target.value)} /></div>
            <div><Label>Item do almoxarifado (opcional)</Label>
              <ComboboxWithCreate value={itemId} onChange={setItemId} allowNone noneLabel="Sem vínculo com estoque" placeholder="Buscar item…" options={lk.itens.map((i) => ({ value: i.id, label: i.descricao, code: i.codigo }))} />
              <p className="text-[11px] text-muted-foreground mt-0.5">Com item vinculado, a entrega pode dar saída de estoque.</p></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lote} onOpenChange={setLote}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Entrega em lote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>EPI</Label><SelectMenu value={lEpiId} onChange={setLEpiId} placeholder="Selecionar…" options={epis.filter((e) => e.ativo).map((e) => ({ value: e.id, label: e.ca ? `${e.nome} · CA ${e.ca}` : e.nome }))} /></div>
              <div><Label>Data</Label><DatePicker value={lData} onChange={setLData} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={lTipo} onChange={setLTipo} options={Object.entries(TIPO_ENTREGA).filter(([k]) => k !== "DEVOLUCAO").map(([value, label]) => ({ value, label }))} /></div>
              {epiLote?.itemId && <div><Label>Baixar do estoque (local)</Label><SelectMenu value={lLocal} onChange={setLLocal} options={[{ value: "", label: "— Não baixar —" }, ...lk.locais.map((l) => ({ value: l.id, label: l.nome }))]} /></div>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><Label>Colaboradores ({Object.values(lSel).filter(Boolean).length} selecionados)</Label>
                <input value={lBusca} onChange={(e) => setLBusca(e.target.value)} placeholder="filtrar…" className="text-xs border border-border rounded px-2 py-1 bg-card" /></div>
              <div className="max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border/60">
                {colabs.filter((c) => c.ativo && (!lBusca || c.nome.toLowerCase().includes(lBusca.toLowerCase()))).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" className="rounded" checked={!!lSel[c.id]} onChange={(e) => setLSel({ ...lSel, [c.id]: e.target.checked })} />
                    <span className="flex-1 text-foreground">{c.nome}</span><span className="text-xs text-muted-foreground">{c.funcao?.nome ?? "sem função"}</span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">O termo assinado pode ser anexado depois, na ficha de cada colaborador.</p>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLote(false)}>Cancelar</Button><Button onClick={salvarLote} disabled={saving}>{saving ? "Registrando…" : "Registrar entregas"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir EPI?" description={`${del?.nome ?? ""} — só é possível sem entregas registradas.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
