"use client";

// Obrigações documentais (PGR, PCMSO, LTCAT, AEP, AVCB…): o documento vive no
// GED; aqui se define o que é obrigatório na empresa e se vê a vigência.
import { useEffect, useState } from "react";
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
import { Loader2, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { fmtData, useLookups } from "@/components/sst/comum";

type Obrig = { id: string; nome: string; norma: string | null; periodicidadeMeses: number | null; observacoes: string | null; categoriaGed: { id: string; nome: string; slug: string }; responsavel: { id: string; nome: string } | null; documento: { id: string; titulo: string; validade: string | null; emissao: string | null } | null; situacao: "VIGENTE" | "VENCE_EM_BREVE" | "VENCIDA" | "INEXISTENTE" };
const SIT: Record<Obrig["situacao"], { label: string; cls: string }> = {
  VIGENTE: { label: "Vigente", cls: "bg-success/15 text-success" }, VENCE_EM_BREVE: { label: "Vence em breve", cls: "bg-warning/15 text-warning" },
  VENCIDA: { label: "Vencida", cls: "bg-danger/15 text-danger" }, INEXISTENTE: { label: "Sem documento", cls: "bg-danger/15 text-danger" },
};
const SUGESTOES = [
  { nome: "PGR — Programa de Gerenciamento de Riscos", norma: "NR-01", meses: 24 }, { nome: "PCMSO", norma: "NR-07", meses: 12 }, { nome: "LTCAT", norma: "NR-15/16", meses: 12 },
  { nome: "AEP — Avaliação Ergonômica Preliminar", norma: "NR-17", meses: 24 }, { nome: "AVCB / Laudo de bombeiros", norma: "NR-23", meses: 12 }, { nome: "Laudo das instalações elétricas", norma: "NR-10", meses: 12 },
];

export default function SstObrigacoesPage() {
  useTabTitle("SST — Obrigações");
  const [lista, setLista] = useState<Obrig[]>([]);
  const [loading, setLoading] = useState(true);
  const lk = useLookups();
  async function load() { setLoading(true); const j = await fetch("/api/sst/obrigacoes").then((r) => r.json()); setLista(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); }, []);

  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [norma, setNorma] = useState(""); const [cat, setCat] = useState(""); const [per, setPer] = useState(""); const [resp, setResp] = useState(""); const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(o?: Obrig, sug?: typeof SUGESTOES[number]) {
    setEditId(o?.id ?? null); setNome(o?.nome ?? sug?.nome ?? ""); setNorma(o?.norma ?? sug?.norma ?? ""); setCat(o?.categoriaGed.id ?? ""); setPer(o?.periodicidadeMeses ? String(o.periodicidadeMeses) : sug ? String(sug.meses) : ""); setResp(o?.responsavel?.id ?? ""); setObs(o?.observacoes ?? ""); setErro(""); setOpen(true);
  }
  async function salvar() {
    if (!nome.trim() || !cat) { setErro("Informe o nome e a categoria do GED."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/obrigacoes/${editId}` : "/api/sst/obrigacoes", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, norma: norma || null, categoriaGedId: cat, periodicidadeMeses: per || null, responsavelId: resp || null, observacoes: obs || null }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  const [del, setDel] = useState<Obrig | null>(null);
  async function excluir() { if (!del) return; setSaving(true); await fetch(`/api/sst/obrigacoes/${del.id}`, { method: "DELETE" }); setSaving(false); setDel(null); load(); }

  return (
    <div>
      <PageHeader title="Obrigações documentais" subtitle="PGR, PCMSO, LTCAT, AEP, AVCB… — vigência por empresa (documentos no GED)" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Obrigações" }]}
        action={<Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova obrigação</Button>} />
      <div className="px-8 pb-8 space-y-4">
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">Obrigação</th><th className="text-left px-3 py-2 font-semibold">Norma</th><th className="text-left px-3 py-2 font-semibold">Situação</th><th className="text-left px-3 py-2 font-semibold">Documento vigente</th><th className="text-left px-3 py-2 font-semibold">Validade</th><th className="text-left px-3 py-2 font-semibold">Responsável</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id} className="border-t border-border/60">
                    <td className="px-4 py-2 text-foreground">{o.nome}<div className="text-[11px] text-muted-foreground">GED: {o.categoriaGed.nome}{o.periodicidadeMeses ? ` · a cada ${o.periodicidadeMeses} meses` : ""}</div></td>
                    <td className="px-3 py-2 text-muted-foreground">{o.norma ?? "—"}</td>
                    <td className="px-3 py-2"><span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", SIT[o.situacao].cls)}>{SIT[o.situacao].label}</span></td>
                    <td className="px-3 py-2">{o.documento ? <Link href={`/documentos/${o.documento.id}`} className="text-info hover:underline inline-flex items-center gap-1">{o.documento.titulo} <ExternalLink className="w-3 h-3" /></Link> : <Link href={`/documentos?categoria=${o.categoriaGed.slug}`} className="text-xs text-info hover:underline">anexar no GED</Link>}</td>
                    <td className={cn("px-3 py-2", o.situacao === "VENCIDA" ? "text-danger font-medium" : "text-muted-foreground")}>{o.documento?.validade ? fmtData(o.documento.validade) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.responsavel?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => abrir(o)} className="text-muted-foreground hover:text-foreground mr-2"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => setDel(o)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma obrigação cadastrada. Sugestões abaixo.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.filter((s) => !lista.some((o) => o.nome === s.nome)).map((s) => (
            <button key={s.nome} onClick={() => abrir(undefined, s)} className="text-xs px-2.5 py-1 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted">+ {s.nome} <span className="opacity-60">({s.norma})</span></button>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar obrigação" : "Nova obrigação"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Norma</Label><Input value={norma} onChange={(e) => setNorma(e.target.value)} placeholder="NR-01" /></div>
              <div><Label>Periodicidade (meses)</Label><Input type="number" min={1} value={per} onChange={(e) => setPer(e.target.value)} /></div>
            </div>
            <div><Label>Categoria do GED (onde o documento é anexado)</Label><SelectMenu value={cat} onChange={setCat} placeholder="Selecionar…" options={lk.categorias.map((c) => ({ value: c.id, label: c.nome }))} />
              <p className="text-[11px] text-muted-foreground mt-0.5">O documento vigente é o de validade mais recente nessa categoria, na empresa ativa. Crie categorias em Documentos → Categorias.</p></div>
            <div><Label>Responsável</Label><SelectMenu value={resp} onChange={setResp} options={[{ value: "", label: "—" }, ...lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))]} /></div>
            <div><Label>Observações</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir obrigação?" description={`${del?.nome ?? ""} — os documentos do GED não são apagados.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
