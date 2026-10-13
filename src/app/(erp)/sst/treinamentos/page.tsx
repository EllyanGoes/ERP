"use client";

// Treinamentos obrigatórios (NR-10/12/35/33/11, CIPA, brigada): tipos, turmas
// com participantes e certificados, e reciclagens a vencer.
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
import { Loader2, Plus, Pencil, Trash2, GraduationCap } from "lucide-react";
import { SeveridadeBadge, UploadAnexo, DocLink, fmtData, hojeISO, type Pendencia } from "@/components/sst/comum";

type Tipo = { id: string; nome: string; norma: string | null; cargaHoraria: number | null; validadeMeses: number | null; ativo: boolean; _count: { requisitos: number; turmas: number } };
type Turma = { id: string; data: string; instrutor: string | null; entidade: string | null; cargaHoraria: number | null; listaPresencaDocumentoId: string | null; tipo: { id: string; nome: string; norma: string | null; validadeMeses: number | null }; participantes: { colaboradorId: string; validade: string | null; aprovado: boolean; certificadoDocumentoId: string | null; colaborador: { id: string; nome: string } }[] };
type Colab = { id: string; nome: string; ativo: boolean; funcao: { nome: string } | null; pendencias: Pendencia[] };
const TIPOS_TREIN = ["TREINAMENTO_FALTANDO", "TREINAMENTO_VENCIDO", "TREINAMENTO_VENCE_EM_BREVE"];

export default function SstTreinamentosPage() {
  useTabTitle("SST — Treinamentos");
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"turmas" | "pendencias" | "tipos">("turmas");
  async function load() {
    setLoading(true);
    const [t, u, c] = await Promise.all([fetch("/api/sst/treinamentos-tipos").then((r) => r.json()), fetch("/api/sst/treinamentos").then((r) => r.json()), fetch("/api/sst/colaboradores").then((r) => r.json())]);
    setTipos(t.data ?? []); setTurmas(u.data ?? []); setColabs(c.data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const pendencias = useMemo(() => colabs.filter((c) => c.ativo).flatMap((c) => c.pendencias.filter((p) => TIPOS_TREIN.includes(p.tipo)).map((p) => ({ ...p, colaboradorNome: c.nome, funcao: c.funcao?.nome }))), [colabs]);

  // tipo
  const [dlgTipo, setDlgTipo] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [tNome, setTNome] = useState(""); const [tNorma, setTNorma] = useState(""); const [tCarga, setTCarga] = useState(""); const [tVal, setTVal] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrirTipo(t?: Tipo) { setEditId(t?.id ?? null); setTNome(t?.nome ?? ""); setTNorma(t?.norma ?? ""); setTCarga(t?.cargaHoraria ? String(t.cargaHoraria) : ""); setTVal(t?.validadeMeses ? String(t.validadeMeses) : ""); setErro(""); setDlgTipo(true); }
  async function salvarTipo() {
    if (!tNome.trim()) { setErro("Informe o nome."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/treinamentos-tipos/${editId}` : "/api/sst/treinamentos-tipos", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: tNome, norma: tNorma || null, cargaHoraria: tCarga || null, validadeMeses: tVal || null }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgTipo(false); load();
  }
  const [delTipo, setDelTipo] = useState<Tipo | null>(null);
  async function excluirTipo() { if (!delTipo) return; setSaving(true); const res = await fetch(`/api/sst/treinamentos-tipos/${delTipo.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) alert(j.error || "Erro"); setDelTipo(null); load(); }

  // turma
  const [dlgTurma, setDlgTurma] = useState(false);
  const [uTipo, setUTipo] = useState(""); const [uData, setUData] = useState(hojeISO()); const [uInstrutor, setUInstrutor] = useState(""); const [uEntidade, setUEntidade] = useState(""); const [uCarga, setUCarga] = useState(""); const [uLista, setULista] = useState<string | null>(null); const [uSel, setUSel] = useState<Record<string, boolean>>({}); const [uBusca, setUBusca] = useState("");
  function abrirTurma(tipoId = "") { setUTipo(tipoId); setUData(hojeISO()); setUInstrutor(""); setUEntidade(""); setUCarga(""); setULista(null); setUSel({}); setUBusca(""); setErro(""); setDlgTurma(true); }
  const tipoSel = tipos.find((t) => t.id === uTipo);
  // pré-seleciona quem tem pendência desse tipo
  useEffect(() => { if (!dlgTurma || !uTipo) return; const ids = pendencias.filter((p) => p.referenciaId === uTipo).map((p) => p.colaboradorId!); setUSel(Object.fromEntries(ids.map((i) => [i, true]))); }, [uTipo, dlgTurma]); // eslint-disable-line
  async function salvarTurma() {
    const ids = Object.entries(uSel).filter(([, v]) => v).map(([k]) => k);
    if (!uTipo || ids.length === 0) { setErro("Escolha o tipo e ao menos um participante."); return; }
    setSaving(true); setErro("");
    const res = await fetch("/api/sst/treinamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipoId: uTipo, data: uData, instrutor: uInstrutor || null, entidade: uEntidade || null, cargaHoraria: uCarga || null, listaPresencaDocumentoId: uLista, participantes: ids.map((colaboradorId) => ({ colaboradorId })) }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgTurma(false); load();
  }
  const [delTurma, setDelTurma] = useState<Turma | null>(null);
  async function excluirTurma() { if (!delTurma) return; setSaving(true); await fetch(`/api/sst/treinamentos?id=${delTurma.id}`, { method: "DELETE" }); setSaving(false); setDelTurma(null); load(); }

  return (
    <div>
      <PageHeader title="Treinamentos" subtitle="Treinamentos obrigatórios por função — turmas, certificados e reciclagens" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Treinamentos" }]}
        action={<div className="flex gap-2"><Button variant="outline" onClick={() => abrirTipo()} className="gap-1.5"><Plus className="w-4 h-4" /> Tipo</Button><Button onClick={() => abrirTurma()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><GraduationCap className="w-4 h-4" /> Nova turma</Button></div>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm w-fit">
          {([["turmas", `Turmas (${turmas.length})`], ["pendencias", `Pendentes / a vencer (${pendencias.length})`], ["tipos", `Tipos (${tipos.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} className={cn("px-3 py-1.5", aba === k ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:bg-muted")}>{l}</button>
          ))}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : aba === "turmas" ? (
          <div className="space-y-3">
            {turmas.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma turma registrada.</p>}
            {turmas.map((u) => (
              <div key={u.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{fmtData(u.data)}</span>
                  <h3 className="font-semibold text-sm text-foreground">{u.tipo.nome}</h3>
                  {u.tipo.norma && <span className="text-xs px-1.5 rounded bg-muted text-muted-foreground">{u.tipo.norma}</span>}
                  {u.cargaHoraria && <span className="text-xs text-muted-foreground">{u.cargaHoraria}h</span>}
                  {u.instrutor && <span className="text-xs text-muted-foreground">· {u.instrutor}{u.entidade ? ` (${u.entidade})` : ""}</span>}
                  <span className="ml-auto"><DocLink id={u.listaPresencaDocumentoId} label="lista de presença" /></span>
                  <button onClick={() => setDelTurma(u)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {u.participantes.map((p) => (
                    <Link key={p.colaboradorId} href={`/sst/colaboradores/${p.colaboradorId}`} className={cn("text-xs px-2 py-0.5 rounded-full border", p.aprovado ? "border-border text-foreground hover:bg-muted" : "border-danger/30 text-danger")}>
                      {p.colaborador.nome}{p.validade ? <span className="text-muted-foreground"> · até {fmtData(p.validade)}</span> : null}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : aba === "pendencias" ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {pendencias.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">Nenhum treinamento pendente ou vencendo.</p> : (
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Colaborador</th><th className="text-left px-3 py-2 font-semibold">Função</th><th className="text-left px-3 py-2 font-semibold">Pendência</th><th className="text-left px-3 py-2 font-semibold">Severidade</th><th className="text-left px-3 py-2 font-semibold">Vence</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>{pendencias.map((p, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-4 py-2"><Link href={p.link} className="text-foreground hover:text-info">{p.colaboradorNome}</Link></td>
                    <td className="px-3 py-2 text-muted-foreground">{p.funcao ?? "—"}</td>
                    <td className="px-3 py-2 text-foreground">{p.titulo}</td>
                    <td className="px-3 py-2"><SeveridadeBadge s={p.severidade} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.vence ? fmtData(p.vence) : "—"}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => abrirTurma(p.referenciaId)} className="text-xs text-info hover:underline">abrir turma</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Treinamento</th><th className="text-left px-3 py-2 font-semibold">Norma</th><th className="text-right px-3 py-2 font-semibold">Carga</th><th className="text-right px-3 py-2 font-semibold">Validade</th><th className="text-right px-3 py-2 font-semibold">Funções</th><th className="text-right px-3 py-2 font-semibold">Turmas</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.id} className={cn("border-t border-border/60", !t.ativo && "opacity-50")}>
                    <td className="px-4 py-2 text-foreground">{t.nome}</td><td className="px-3 py-2 text-muted-foreground">{t.norma ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{t.cargaHoraria ? `${t.cargaHoraria}h` : "—"}</td><td className="px-3 py-2 text-right text-muted-foreground">{t.validadeMeses ? `${t.validadeMeses} m` : "não vence"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t._count.requisitos}</td><td className="px-3 py-2 text-right tabular-nums">{t._count.turmas}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => abrirTipo(t)} className="text-muted-foreground hover:text-foreground mr-2"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => setDelTipo(t)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
                {tipos.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum tipo. Ex.: NR-12 Operação segura de máquinas (8h, 24 m), NR-35 Trabalho em altura (8h, 24 m), NR-10 Básico (40h, 24 m).</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dlgTipo} onOpenChange={setDlgTipo}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar tipo" : "Novo tipo de treinamento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={tNome} onChange={(e) => setTNome(e.target.value)} placeholder="NR-12 Operação segura de máquinas" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Norma</Label><Input value={tNorma} onChange={(e) => setTNorma(e.target.value)} placeholder="NR-12" /></div>
              <div><Label>Carga (h)</Label><Input type="number" min={1} value={tCarga} onChange={(e) => setTCarga(e.target.value)} /></div>
              <div><Label>Validade (meses)</Label><Input type="number" min={1} value={tVal} onChange={(e) => setTVal(e.target.value)} placeholder="24" /></div>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgTipo(false)}>Cancelar</Button><Button onClick={salvarTipo} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlgTurma} onOpenChange={setDlgTurma}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Nova turma</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Treinamento</Label><SelectMenu value={uTipo} onChange={setUTipo} placeholder="Selecionar…" options={tipos.filter((t) => t.ativo).map((t) => ({ value: t.id, label: t.norma ? `${t.nome} (${t.norma})` : t.nome }))} /></div>
              <div><Label>Data</Label><DatePicker value={uData} onChange={setUData} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Instrutor</Label><Input value={uInstrutor} onChange={(e) => setUInstrutor(e.target.value)} /></div>
              <div><Label>Entidade</Label><Input value={uEntidade} onChange={(e) => setUEntidade(e.target.value)} /></div>
              <div><Label>Carga (h)</Label><Input type="number" value={uCarga} onChange={(e) => setUCarga(e.target.value)} placeholder={tipoSel?.cargaHoraria ? String(tipoSel.cargaHoraria) : ""} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><Label>Participantes ({Object.values(uSel).filter(Boolean).length})</Label><input value={uBusca} onChange={(e) => setUBusca(e.target.value)} placeholder="filtrar…" className="text-xs border border-border rounded px-2 py-1 bg-card" /></div>
              <div className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border/60">
                {colabs.filter((c) => c.ativo && (!uBusca || c.nome.toLowerCase().includes(uBusca.toLowerCase()))).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" className="rounded" checked={!!uSel[c.id]} onChange={(e) => setUSel({ ...uSel, [c.id]: e.target.checked })} />
                    <span className="flex-1 text-foreground">{c.nome}</span><span className="text-xs text-muted-foreground">{c.funcao?.nome ?? "sem função"}</span>
                  </label>
                ))}
              </div>
              {tipoSel?.validadeMeses && <p className="text-[11px] text-muted-foreground mt-1">Validade de cada participante: data + {tipoSel.validadeMeses} meses.</p>}
            </div>
            <div><Label>Lista de presença / certificados</Label><UploadAnexo tipo="outro" titulo={`Lista de presença — ${tipoSel?.nome ?? "treinamento"} — ${uData}`} value={uLista} onChange={setULista} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgTurma(false)}>Cancelar</Button><Button onClick={salvarTurma} disabled={saving}>{saving ? "Salvando…" : "Registrar turma"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!delTipo} onOpenChange={(o) => !o && setDelTipo(null)} title="Excluir tipo?" description={delTipo?.nome ?? ""} onConfirm={excluirTipo} loading={saving} confirmLabel="Excluir" />
      <ConfirmDialog open={!!delTurma} onOpenChange={(o) => !o && setDelTurma(null)} title="Excluir turma?" description="Os participantes perdem o registro deste treinamento. Vai para a lixeira." onConfirm={excluirTurma} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
