"use client";

// Ficha da máquina (NR-12): dados, status, apreciação de risco e manual (GED),
// proteções exigidas com evidência, e tarefa de adequação no Projetos.
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Loader2, Plus, Trash2, CheckCircle2, Circle, ExternalLink, Save } from "lucide-react";
import { StatusMaquinaBadge, STATUS_MAQUINA, UploadAnexo, DocLink, fmtData, useLookups } from "@/components/sst/comum";

type Prot = { id: string; descricao: string; tipo: string | null; conforme: boolean; evidenciaDocumentoId: string | null; verificadoEm: string | null; observacoes: string | null };
type Maq = { id: string; nome: string; local: string | null; codApl: number | null; fabricante: string | null; anoFabricacao: number | null; status: string; apreciacaoRiscoDocumentoId: string | null; manualDocumentoId: string | null; tarefaId: string | null; observacoes: string | null; setor: { id: string; nome: string } | null; protecoes: Prot[]; tarefa: { id: string; titulo: string; concluidaEm: string | null; prazo: string | null; projetoId: string; projeto: { nome: string }; coluna: { nome: string } } | null };
const TIPOS_PROT = ["Proteção fixa", "Proteção móvel intertravada", "Dispositivo de parada de emergência", "Dispositivo de segurança (cortina/tapete/bimanual)", "Sinalização / rotulagem", "Aterramento / elétrica", "Outro"];
const SUGESTOES = ["Enclausuramento de partes móveis (correias, polias, engrenagens)", "Botão de parada de emergência acessível", "Intertravamento das proteções móveis", "Sinalização de segurança e manual em português", "Dispositivo de partida/parada (não religa sozinho após queda de energia)"];

export default function SstMaquinaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lk = useLookups();
  const [m, setM] = useState<Maq | null>(null);
  const [loading, setLoading] = useState(true);
  useTabTitle(m ? `NR-12 · ${m.nome}` : "Máquina");
  const load = useCallback(async () => { const j = await fetch(`/api/sst/maquinas/${id}`).then((r) => r.json()).catch(() => null); setM(j?.data ?? null); setLoading(false); }, [id]);
  useEffect(() => { load(); }, [load]);

  const [erro, setErro] = useState(""); const [saving, setSaving] = useState(false);
  async function patch(data: Record<string, unknown>) {
    setSaving(true); setErro("");
    const res = await fetch(`/api/sst/maquinas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return false; }
    await load(); return true;
  }
  // edição dos dados
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ nome: "", local: "", setorId: "", fabricante: "", anoFabricacao: "", codApl: "", observacoes: "" });
  function abrirEdit() { if (!m) return; setF({ nome: m.nome, local: m.local ?? "", setorId: m.setor?.id ?? "", fabricante: m.fabricante ?? "", anoFabricacao: m.anoFabricacao ? String(m.anoFabricacao) : "", codApl: m.codApl ? String(m.codApl) : "", observacoes: m.observacoes ?? "" }); setEdit(true); }
  async function salvarEdit() { if (await patch({ ...f, setorId: f.setorId || null })) setEdit(false); }

  // proteções
  const [novaProt, setNovaProt] = useState(""); const [novoTipo, setNovoTipo] = useState("");
  async function addProt(descricao: string, tipo = "") {
    if (!descricao.trim()) return;
    setSaving(true);
    await fetch(`/api/sst/maquinas/${id}/protecoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descricao, tipo: tipo || null }) });
    setSaving(false); setNovaProt(""); setNovoTipo(""); load();
  }
  async function patchProt(protecaoId: string, data: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/sst/maquinas/${id}/protecoes`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ protecaoId, ...data }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) setErro(j.error || "Erro");
    load();
  }
  async function delProt(protecaoId: string) { setSaving(true); await fetch(`/api/sst/maquinas/${id}/protecoes?protecaoId=${protecaoId}`, { method: "DELETE" }); setSaving(false); load(); }

  // tarefa
  const [dlgTarefa, setDlgTarefa] = useState(false); const [projetoId, setProjetoId] = useState("");
  async function criarTarefa() {
    if (!projetoId) return;
    setSaving(true); setErro("");
    const res = await fetch(`/api/sst/maquinas/${id}/tarefa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projetoId }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgTarefa(false); load();
  }
  const [del, setDel] = useState(false);
  async function excluir() { setSaving(true); await fetch(`/api/sst/maquinas/${id}`, { method: "DELETE" }); setSaving(false); router.push("/sst/maquinas"); }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!m) return <p className="px-8 py-8 text-sm text-danger">Máquina não encontrada.</p>;
  const pend = m.protecoes.filter((p) => !p.conforme).length;

  return (
    <div>
      <PageHeader title={m.nome} subtitle={[m.local, m.setor?.nome, m.fabricante, m.anoFabricacao ? `fab. ${m.anoFabricacao}` : null, m.codApl ? `Engeman ${m.codApl}` : null].filter(Boolean).join(" · ") || "—"}
        breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Máquinas", href: "/sst/maquinas" }, { label: m.nome }]}
        action={<div className="flex items-center gap-2">
          <StatusMaquinaBadge s={m.status} />
          <SelectMenu value={m.status} onChange={(v) => patch({ status: v })} className="w-44" options={Object.entries(STATUS_MAQUINA).map(([value, v]) => ({ value, label: v.label }))} />
          <Button size="sm" variant="outline" onClick={abrirEdit}>Editar</Button>
          <Button size="sm" variant="outline" className="text-danger border-danger/30 hover:bg-danger/10" onClick={() => setDel(true)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>} />
      <div className="px-8 pb-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {erro && <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{erro}</div>}
          {/* Proteções */}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">Proteções exigidas <span className="text-xs text-muted-foreground font-normal">{m.protecoes.length - pend}/{m.protecoes.length} conformes</span></h2>
              {pend === 0 && m.protecoes.length > 0 && m.status !== "CONFORME" && <button onClick={() => patch({ status: "CONFORME" })} className="text-xs text-success hover:underline">marcar máquina como conforme</button>}
            </div>
            <ul className="divide-y divide-border/60">
              {m.protecoes.map((p) => (
                <li key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                  <button onClick={() => patchProt(p.id, { conforme: !p.conforme })} disabled={saving} title={p.conforme ? "Marcar como pendente" : "Marcar como conforme"} className={cn("mt-0.5 shrink-0", p.conforme ? "text-success" : "text-muted-foreground/50 hover:text-success")}>
                    {p.conforme ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", p.conforme ? "text-muted-foreground" : "text-foreground")}>{p.descricao}{p.tipo && <span className="text-xs text-muted-foreground"> · {p.tipo}</span>}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      {p.conforme && p.verificadoEm && <span className="text-muted-foreground">verificado em {fmtData(p.verificadoEm)}</span>}
                      {p.evidenciaDocumentoId ? <DocLink id={p.evidenciaDocumentoId} label="evidência" /> : (
                        <UploadAnexo tipo="outro" titulo={`NR-12 evidência — ${m.nome} — ${p.descricao}`} value={null} onChange={(d) => d && patchProt(p.id, { evidenciaDocumentoId: d })} label="anexar evidência (foto/laudo)" />
                      )}
                      {p.conforme && !p.evidenciaDocumentoId && <span className="text-warning">sem evidência — a auditoria vai pedir</span>}
                    </div>
                  </div>
                  <button onClick={() => delProt(p.id)} className="text-muted-foreground hover:text-danger shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
              {m.protecoes.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground italic">Nenhuma proteção listada. Adicione as exigidas pela apreciação de risco:</li>}
            </ul>
            <div className="px-4 py-3 border-t border-border/60 space-y-2">
              <div className="flex gap-2">
                <Input value={novaProt} onChange={(e) => setNovaProt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProt(novaProt, novoTipo)} placeholder="Nova proteção exigida…" className="h-9" />
                <SelectMenu value={novoTipo} onChange={setNovoTipo} className="w-56" placeholder="Tipo" options={[{ value: "", label: "Tipo (opcional)" }, ...TIPOS_PROT.map((t) => ({ value: t, label: t }))]} />
                <Button size="sm" variant="outline" disabled={!novaProt.trim() || saving} onClick={() => addProt(novaProt, novoTipo)}><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">{SUGESTOES.filter((s) => !m.protecoes.some((p) => p.descricao === s)).map((s) => <button key={s} onClick={() => addProt(s)} className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted">+ {s}</button>)}</div>
            </div>
          </section>

          {/* Documentos */}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Documentos da máquina</h2></div>
            <div className="p-4 grid md:grid-cols-2 gap-4 text-sm">
              <div><Label>Apreciação de risco (NR-12 item 12.3)</Label><div className="mt-1">{m.apreciacaoRiscoDocumentoId ? <div className="flex items-center gap-2"><DocLink id={m.apreciacaoRiscoDocumentoId} label="ver documento" /><button onClick={() => patch({ apreciacaoRiscoDocumentoId: null })} className="text-xs text-muted-foreground hover:text-danger">remover</button></div> : <UploadAnexo tipo="outro" titulo={`Apreciação de risco — ${m.nome}`} value={null} onChange={(d) => d && patch({ apreciacaoRiscoDocumentoId: d, ...(m.status === "NAO_AVALIADA" ? { status: pend > 0 ? "NAO_CONFORME" : "EM_ADEQUACAO" } : {}) })} label="anexar apreciação de risco" />}</div></div>
              <div><Label>Manual / instruções de segurança</Label><div className="mt-1">{m.manualDocumentoId ? <div className="flex items-center gap-2"><DocLink id={m.manualDocumentoId} label="ver documento" /><button onClick={() => patch({ manualDocumentoId: null })} className="text-xs text-muted-foreground hover:text-danger">remover</button></div> : <UploadAnexo tipo="outro" titulo={`Manual — ${m.nome}`} value={null} onChange={(d) => d && patch({ manualDocumentoId: d })} label="anexar manual" />}</div></div>
            </div>
            {m.observacoes && <p className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap">{m.observacoes}</p>}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Adequação (Projetos)</h2></div>
            <div className="p-4 text-sm space-y-2">
              {m.tarefa ? (
                <>
                  <Link href={`/projetos/${m.tarefa.projetoId}?tarefa=${m.tarefa.id}`} className="text-info hover:underline inline-flex items-center gap-1">{m.tarefa.titulo} <ExternalLink className="w-3 h-3" /></Link>
                  <p className="text-xs text-muted-foreground">{m.tarefa.projeto.nome} · {m.tarefa.coluna.nome}{m.tarefa.prazo ? ` · prazo ${fmtData(m.tarefa.prazo)}` : ""}{m.tarefa.concluidaEm ? " · concluída" : ""}</p>
                  {m.tarefa.concluidaEm && m.status !== "CONFORME" && <p className="text-xs text-warning">Tarefa concluída, mas a máquina ainda não está conforme: confira as proteções e anexe as evidências.</p>}
                  <button onClick={() => patch({ tarefaId: null })} className="text-xs text-muted-foreground hover:text-danger">desvincular</button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">Crie a tarefa de adequação num projeto para acompanhar a execução. Concluir a tarefa não muda o status da máquina — quem comprova é o técnico, com evidência.</p>
                  <Button size="sm" variant="outline" onClick={() => { setProjetoId(lk.projetos[0]?.id ?? ""); setDlgTarefa(true); }}>Criar tarefa no Projetos</Button>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Editar máquina</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Local</Label><Input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} /></div>
              <div><Label>Setor</Label><SelectMenu value={f.setorId} onChange={(v) => setF({ ...f, setorId: v })} options={[{ value: "", label: "—" }, ...lk.setores.map((s) => ({ value: s.id, label: s.nome }))]} /></div>
              <div><Label>Fabricante</Label><Input value={f.fabricante} onChange={(e) => setF({ ...f, fabricante: e.target.value })} /></div>
              <div><Label>Ano</Label><Input type="number" value={f.anoFabricacao} onChange={(e) => setF({ ...f, anoFabricacao: e.target.value })} /></div>
              <div><Label>Cód. Engeman (CODAPL)</Label><Input type="number" value={f.codApl} onChange={(e) => setF({ ...f, codApl: e.target.value })} /></div>
            </div>
            <div><Label>Observações</Label><Input value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(false)}>Cancelar</Button><Button onClick={salvarEdit} disabled={saving} className="gap-1.5"><Save className="w-4 h-4" /> Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dlgTarefa} onOpenChange={setDlgTarefa}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar tarefa de adequação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Projeto</Label><SelectMenu value={projetoId} onChange={setProjetoId} placeholder="Selecionar…" options={lk.projetos.map((p) => ({ value: p.id, label: p.nome }))} /></div>
            <p className="text-xs text-muted-foreground">A tarefa &quot;NR-12: {m.nome}&quot; entra na primeira coluna do projeto com as proteções pendentes na descrição. A máquina passa a &quot;Em adequação&quot;.</p>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgTarefa(false)}>Cancelar</Button><Button onClick={criarTarefa} disabled={saving || !projetoId}>{saving ? "Criando…" : "Criar tarefa"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={del} onOpenChange={setDel} title="Excluir máquina do inventário?" description={`${m.nome} — proteções e vínculos são apagados; os documentos do GED ficam.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
