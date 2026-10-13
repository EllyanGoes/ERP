"use client";

// Inspeções periódicas (extintores, máquinas, instalações, checklists) com
// próxima data, resultado por item e ações corretivas quando não conforme.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Loader2, Plus, Trash2, ClipboardCheck, CheckCircle2, Circle, X } from "lucide-react";
import { TIPOS_INSPECAO, TIPO_INSPECAO_LABEL, UploadAnexo, DocLink, fmtData, hojeISO, useLookups } from "@/components/sst/comum";

type Item = { item: string; ok: boolean; obs?: string };
type Acao = { id: string; descricao: string; prazo: string | null; concluidaEm: string | null; responsavel: { nome: string } | null };
type Ins = { id: string; tipo: string; descricao: string; data: string; proxima: string | null; resultado: string; itens: Item[] | null; documentoId: string | null; observacoes: string | null; maquina: { id: string; nome: string } | null; responsavel: { nome: string } | null; acoes: Acao[] };
const CHECKLISTS: Record<string, string[]> = {
  EXTINTOR: ["Lacre e pino intactos", "Manômetro na faixa verde", "Validade da carga/teste hidrostático", "Sinalização e acesso desobstruído", "Suporte/altura corretos"],
  MAQUINA: ["Proteções fixas no lugar", "Intertravamentos funcionando", "Parada de emergência testada", "Sinalização legível", "Área limpa e desobstruída"],
  INSTALACAO: ["Pisos sem buracos/derrapantes", "Iluminação adequada", "Saídas de emergência livres", "Escadas com corrimão", "Armazenamento seguro"],
  ELETRICA: ["Quadros fechados e sinalizados", "Aterramento", "Fiação sem emendas expostas", "DR/disjuntores identificados"],
  ALTURA: ["Linha de vida/ancoragem", "Cinto e talabarte em dia", "Guarda-corpo", "Permissão de trabalho"],
};
const PERIODO_PADRAO: Record<string, number> = { EXTINTOR: 1, MAQUINA: 3, INSTALACAO: 6, ELETRICA: 12, ALTURA: 6, CHECKLIST_NR18: 1, CIPA: 1, OUTRO: 6 };

export default function SstInspecoesPage() {
  useTabTitle("SST — Inspeções");
  const lk = useLookups();
  const [lista, setLista] = useState<Ins[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  async function load() { setLoading(true); const j = await fetch("/api/sst/inspecoes").then((r) => r.json()); setLista(j.data ?? []); setLoading(false); }
  useEffect(() => { load(); }, []);
  const visiveis = useMemo(() => lista.filter((i) => !filtro || i.tipo === filtro), [lista, filtro]);

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tipo: "EXTINTOR", descricao: "", data: hojeISO(), proxima: "", maquinaId: "", observacoes: "" });
  const [itens, setItens] = useState<Item[]>([]); const [novoItem, setNovoItem] = useState(""); const [doc, setDoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(tipo = "EXTINTOR") {
    const d = new Date(); d.setMonth(d.getMonth() + (PERIODO_PADRAO[tipo] ?? 6));
    setF({ tipo, descricao: "", data: hojeISO(), proxima: d.toISOString().slice(0, 10), maquinaId: "", observacoes: "" });
    setItens((CHECKLISTS[tipo] ?? []).map((item) => ({ item, ok: true }))); setNovoItem(""); setDoc(null); setErro(""); setOpen(true);
  }
  function mudarTipo(tipo: string) { const d = new Date(f.data + "T12:00:00"); d.setMonth(d.getMonth() + (PERIODO_PADRAO[tipo] ?? 6)); setF({ ...f, tipo, proxima: d.toISOString().slice(0, 10) }); setItens((CHECKLISTS[tipo] ?? []).map((item) => ({ item, ok: true }))); }
  async function salvar() {
    const descricao = f.descricao.trim() || (f.maquinaId ? lk.maquinas.find((m) => m.id === f.maquinaId)?.nome ?? "" : "");
    if (!descricao) { setErro("Descreva o que foi inspecionado (ou escolha a máquina)."); return; }
    setSaving(true); setErro("");
    const res = await fetch("/api/sst/inspecoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, descricao, maquinaId: f.maquinaId || null, proxima: f.proxima || null, itens, documentoId: doc }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  // ações nas não conformes
  const [acaoPara, setAcaoPara] = useState<string | null>(null); const [acao, setAcao] = useState({ descricao: "", responsavelId: "", prazo: "" });
  async function addAcao() { if (!acaoPara || !acao.descricao.trim()) return; setSaving(true); await fetch("/api/sst/acoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inspecaoId: acaoPara, ...acao, responsavelId: acao.responsavelId || null, prazo: acao.prazo || null }) }); setSaving(false); setAcaoPara(null); setAcao({ descricao: "", responsavelId: "", prazo: "" }); load(); }
  async function concluirAcao(aid: string, concluida: boolean) { await fetch("/api/sst/acoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: aid, concluida }) }); load(); }
  const [del, setDel] = useState<Ins | null>(null);
  async function excluir() { if (!del) return; setSaving(true); await fetch(`/api/sst/inspecoes?id=${del.id}`, { method: "DELETE" }); setSaving(false); setDel(null); load(); }

  return (
    <div>
      <PageHeader title="Inspeções periódicas" subtitle="Extintores, máquinas, instalações, elétrica, altura — com checklist e próxima data" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Inspeções" }]}
        action={<Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><ClipboardCheck className="w-4 h-4" /> Nova inspeção</Button>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltro("")} className={cn("text-xs px-2.5 py-1 rounded-full border", !filtro ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>Todas ({lista.length})</button>
          {TIPOS_INSPECAO.map((t) => { const n = lista.filter((i) => i.tipo === t).length; return n > 0 ? <button key={t} onClick={() => setFiltro(filtro === t ? "" : t)} className={cn("text-xs px-2.5 py-1 rounded-full border", filtro === t ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{TIPO_INSPECAO_LABEL[t]} ({n})</button> : null; })}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : visiveis.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma inspeção registrada.</p> : (
          <div className="space-y-3">
            {visiveis.map((i) => { const atrasada = i.proxima && new Date(i.proxima).getTime() < Date.now(); const naoOk = (i.itens ?? []).filter((x) => !x.ok); return (
              <div key={i.id} className={cn("bg-card rounded-xl border p-4", i.resultado === "NAO_CONFORME" ? "border-danger/30" : "border-border")}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-1.5 rounded bg-muted text-muted-foreground">{TIPO_INSPECAO_LABEL[i.tipo] ?? i.tipo}</span>
                  <h3 className="font-semibold text-sm text-foreground">{i.descricao}</h3>
                  {i.maquina && <Link href={`/sst/maquinas/${i.maquina.id}`} className="text-xs text-info hover:underline">{i.maquina.nome}</Link>}
                  <span className={cn("text-[11px] px-1.5 py-0.5 rounded", i.resultado === "CONFORME" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>{i.resultado === "CONFORME" ? "Conforme" : "Não conforme"}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmtData(i.data)}{i.responsavel ? ` · ${i.responsavel.nome}` : ""}</span>
                  <span className={cn("text-xs", atrasada ? "text-danger font-medium" : "text-muted-foreground")}>{i.proxima ? `próxima ${fmtData(i.proxima)}${atrasada ? " (atrasada)" : ""}` : ""}</span>
                  <DocLink id={i.documentoId} label="laudo/foto" />
                  <button onClick={() => setDel(i)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {naoOk.length > 0 && <p className="text-xs text-danger mt-1">Itens não conformes: {naoOk.map((x) => x.item + (x.obs ? ` (${x.obs})` : "")).join("; ")}</p>}
                {i.observacoes && <p className="text-xs text-muted-foreground mt-1">{i.observacoes}</p>}
                {(i.acoes.length > 0 || i.resultado === "NAO_CONFORME") && (
                  <div className="mt-2 space-y-1">
                    {i.acoes.map((a) => <div key={a.id} className="flex items-center gap-2 text-xs"><button onClick={() => concluirAcao(a.id, !a.concluidaEm)} className={a.concluidaEm ? "text-success" : "text-muted-foreground/50"}>{a.concluidaEm ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}</button><span className={cn(a.concluidaEm ? "line-through text-muted-foreground" : "text-foreground")}>{a.descricao}</span><span className="text-muted-foreground">{a.responsavel?.nome ?? ""}{a.prazo ? ` · ${fmtData(a.prazo)}` : ""}</span></div>)}
                    {acaoPara === i.id ? (
                      <div className="flex gap-2 items-end"><Input value={acao.descricao} onChange={(e) => setAcao({ ...acao, descricao: e.target.value })} placeholder="Ação corretiva" className="h-8 text-xs" /><SelectMenu value={acao.responsavelId} onChange={(v) => setAcao({ ...acao, responsavelId: v })} className="w-40" options={[{ value: "", label: "Responsável" }, ...lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))]} /><DatePicker value={acao.prazo} onChange={(v) => setAcao({ ...acao, prazo: v })} /><Button size="sm" variant="outline" onClick={addAcao} disabled={saving} className="h-8">OK</Button><button onClick={() => setAcaoPara(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button></div>
                    ) : <button onClick={() => setAcaoPara(i.id)} className="text-xs text-info hover:underline">+ ação corretiva</button>}
                  </div>
                )}
              </div>
            ); })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nova inspeção</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={f.tipo} onChange={mudarTipo} options={TIPOS_INSPECAO.map((t) => ({ value: t, label: TIPO_INSPECAO_LABEL[t] }))} /></div>
              <div><Label>Data</Label><DatePicker value={f.data} onChange={(v) => setF({ ...f, data: v })} /></div>
              <div><Label>Próxima</Label><DatePicker value={f.proxima} onChange={(v) => setF({ ...f, proxima: v })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>O que foi inspecionado</Label><Input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Extintores do galpão 2, quadro elétrico…" /></div>
              <div><Label>Máquina (opcional)</Label><SelectMenu value={f.maquinaId} onChange={(v) => setF({ ...f, maquinaId: v })} options={[{ value: "", label: "—" }, ...lk.maquinas.map((m) => ({ value: m.id, label: m.local ? `${m.nome} (${m.local})` : m.nome }))]} /></div>
            </div>
            <div>
              <Label>Checklist</Label>
              <div className="mt-1 space-y-1">
                {itens.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <button onClick={() => setItens(itens.map((x, j) => j === idx ? { ...x, ok: !x.ok } : x))} className={it.ok ? "text-success" : "text-danger"}>{it.ok ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}</button>
                    <span className={cn("flex-1", it.ok ? "text-foreground" : "text-danger")}>{it.item}</span>
                    {!it.ok && <Input value={it.obs ?? ""} onChange={(e) => setItens(itens.map((x, j) => j === idx ? { ...x, obs: e.target.value } : x))} placeholder="o que está errado" className="h-8 w-56 text-xs" />}
                    <button onClick={() => setItens(itens.filter((_, j) => j !== idx))} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <div className="flex gap-2"><Input value={novoItem} onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && novoItem.trim()) { setItens([...itens, { item: novoItem.trim(), ok: true }]); setNovoItem(""); } }} placeholder="Novo item do checklist (Enter)" className="h-8 text-xs" /><Button size="sm" variant="outline" className="h-8" disabled={!novoItem.trim()} onClick={() => { setItens([...itens, { item: novoItem.trim(), ok: true }]); setNovoItem(""); }}><Plus className="w-4 h-4" /></Button></div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Qualquer item marcado com X torna a inspeção &quot;não conforme&quot; e pede ação corretiva.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Observações</Label><Input value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
              <div><Label>Laudo / fotos</Label><UploadAnexo tipo="outro" titulo={`Inspeção ${TIPO_INSPECAO_LABEL[f.tipo]} — ${f.descricao || f.data}`} value={doc} onChange={setDoc} /></div>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir inspeção?" description={del?.descricao ?? ""} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
