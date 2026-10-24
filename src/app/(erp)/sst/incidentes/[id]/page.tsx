"use client";

// Ficha da ocorrência: dados, investigação (causas), CAT, ações corretivas,
// evidências (fotos no GED), encerramento com regras.
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Trash2, CheckCircle2, Circle, Plus, Save } from "lucide-react";
import { TIPO_INCIDENTE, STATUS_INCIDENTE, UploadAnexo, DocLink, fmtData, useLookups } from "@/components/sst/comum";
import { AbrirSolicitacaoSst, SolicitacoesVinculadas, type SsVinculada } from "@/components/manutencao/SolicitacaoOrigemSst";

type Acao = { id: string; descricao: string; prazo: string | null; concluidaEm: string | null; responsavel: { id: string; nome: string } | null };
type Inc = { id: string; numero: string; tipo: string; data: string; local: string | null; descricao: string; parteCorpo: string | null; agente: string | null; diasAfastamento: number | null; catNumero: string | null; catEmitidaEm: string | null; catDocumentoId: string | null; investigacao: string | null; status: string; evidencias: string[]; colaborador: { id: string; nome: string } | null; setor: { nome: string } | null; maquina: { id: string; nome: string; ativoId: string | null } | null; acoes: Acao[]; solicitacoesManutencao: SsVinculada[] };

export default function SstIncidentePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lk = useLookups();
  const [i, setI] = useState<Inc | null>(null);
  const [loading, setLoading] = useState(true);
  useTabTitle(i ? `Ocorrência ${i.numero}` : "Ocorrência");
  const load = useCallback(async () => { const j = await fetch(`/api/sst/incidentes/${id}`).then((r) => r.json()).catch(() => null); setI(j?.data ?? null); setLoading(false); }, [id]);
  useEffect(() => { load(); }, [load]);
  const [erro, setErro] = useState(""); const [saving, setSaving] = useState(false);
  async function patch(data: Record<string, unknown>) {
    setSaving(true); setErro("");
    const res = await fetch(`/api/sst/incidentes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return false; }
    await load(); return true;
  }
  // investigação / CAT (edição local)
  const [inv, setInv] = useState(""); const [cat, setCat] = useState({ catNumero: "", catEmitidaEm: "" }); const [dias, setDias] = useState("");
  useEffect(() => { if (i) { setInv(i.investigacao ?? ""); setCat({ catNumero: i.catNumero ?? "", catEmitidaEm: i.catEmitidaEm ? i.catEmitidaEm.slice(0, 10) : "" }); setDias(i.diasAfastamento ? String(i.diasAfastamento) : ""); } }, [i]);
  // ações
  const [nova, setNova] = useState({ descricao: "", responsavelId: "", prazo: "" });
  async function addAcao() {
    if (!nova.descricao.trim()) return;
    setSaving(true);
    await fetch("/api/sst/acoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidenteId: id, ...nova, responsavelId: nova.responsavelId || null, prazo: nova.prazo || null }) });
    setSaving(false); setNova({ descricao: "", responsavelId: "", prazo: "" }); load();
  }
  async function patchAcao(aid: string, data: Record<string, unknown>) { setSaving(true); await fetch("/api/sst/acoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: aid, ...data }) }); setSaving(false); load(); }
  async function delAcao(aid: string) { setSaving(true); await fetch(`/api/sst/acoes?id=${aid}`, { method: "DELETE" }); setSaving(false); load(); }
  const [del, setDel] = useState(false);
  async function excluir() { setSaving(true); await fetch(`/api/sst/incidentes/${id}`, { method: "DELETE" }); setSaving(false); router.push("/sst/incidentes"); }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!i) return <p className="px-8 py-8 text-sm text-danger">Ocorrência não encontrada.</p>;
  const exigeCat = ["ACIDENTE_COM_AFASTAMENTO", "DOENCA_OCUPACIONAL", "TRAJETO"].includes(i.tipo);

  return (
    <div>
      <PageHeader title={`Ocorrência ${i.numero}`} subtitle={[TIPO_INCIDENTE[i.tipo]?.label, fmtData(i.data), i.colaborador?.nome, i.local, i.setor?.nome].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Incidentes", href: "/sst/incidentes" }, { label: i.numero }]}
        action={<div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", STATUS_INCIDENTE[i.status]?.cls)}>{STATUS_INCIDENTE[i.status]?.label}</span>
          <SelectMenu value={i.status} onChange={(v) => patch({ status: v })} className="w-44" options={Object.entries(STATUS_INCIDENTE).map(([value, v]) => ({ value, label: v.label }))} />
          <Button size="sm" variant="outline" className="text-danger border-danger/30 hover:bg-danger/10" onClick={() => setDel(true)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>} />
      <div className="px-8 pb-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {erro && <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{erro}</div>}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Descrição</h2></div>
            <div className="p-4 text-sm text-foreground whitespace-pre-wrap">{i.descricao}
              <p className="text-xs text-muted-foreground mt-2">{[i.parteCorpo ? `Parte do corpo: ${i.parteCorpo}` : null, i.agente ? `Agente: ${i.agente}` : null, i.maquina ? `Máquina: ${i.maquina.nome}` : null].filter(Boolean).join(" · ")}</p>
              {i.maquina && <Link href={`/sst/maquinas/${i.maquina.id}`} className="text-xs text-info hover:underline">abrir ficha da máquina</Link>}
            </div>
          </section>
          {/* Manutenção: máquina envolvida → SS para corrigir (origem SST_INCIDENTE) */}
          {(i.maquina || i.solicitacoesManutencao.length > 0) && (
            <section className="bg-card rounded-xl border border-border">
              <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Manutenção</h2></div>
              <div className="p-4 space-y-2">
                {i.solicitacoesManutencao.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma solicitação de manutenção aberta para esta ocorrência.</p>}
                <SolicitacoesVinculadas lista={i.solicitacoesManutencao} />
                <AbrirSolicitacaoSst origem="SST_INCIDENTE" origemId={i.id} ativoId={i.maquina?.ativoId} vinculadas={i.solicitacoesManutencao} onCriada={load}
                  descricaoInicial={[`Ocorrência SST ${i.numero} (${TIPO_INCIDENTE[i.tipo]?.label ?? i.tipo}) de ${fmtData(i.data)}${i.maquina ? ` envolvendo a máquina ${i.maquina.nome}` : ""}${i.local ? ` — ${i.local}` : ""}.`, i.descricao, i.agente ? `Agente: ${i.agente}` : ""].filter(Boolean).join("\n")} />
              </div>
            </section>
          )}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between"><h2 className="font-semibold text-sm text-foreground">Investigação (causas)</h2><Button size="sm" variant="outline" disabled={saving || inv === (i.investigacao ?? "")} onClick={() => patch({ investigacao: inv, ...(i.status === "ABERTO" ? { status: "EM_INVESTIGACAO" } : {}) })} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Salvar</Button></div>
            <div className="p-4"><textarea value={inv} onChange={(e) => setInv(e.target.value)} rows={5} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="5 porquês / árvore de causas: causa imediata, causas básicas, falhas de gestão…" /></div>
          </section>
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Ações corretivas <span className="text-xs text-muted-foreground font-normal">{i.acoes.filter((a) => a.concluidaEm).length}/{i.acoes.length}</span></h2></div>
            <ul className="divide-y divide-border/60">
              {i.acoes.map((a) => { const atrasada = !a.concluidaEm && a.prazo && new Date(a.prazo).getTime() < Date.now(); return (
                <li key={a.id} className="px-4 py-2.5 flex items-start gap-3">
                  <button onClick={() => patchAcao(a.id, { concluida: !a.concluidaEm })} className={cn("mt-0.5", a.concluidaEm ? "text-success" : "text-muted-foreground/50 hover:text-success")}>{a.concluidaEm ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</button>
                  <div className="flex-1 min-w-0"><p className={cn("text-sm", a.concluidaEm ? "text-muted-foreground line-through" : "text-foreground")}>{a.descricao}</p>
                    <p className="text-xs text-muted-foreground">{a.responsavel?.nome ?? "sem responsável"}{a.prazo && <span className={cn(atrasada && "text-danger font-medium")}> · prazo {fmtData(a.prazo)}{atrasada ? " (atrasada)" : ""}</span>}{a.concluidaEm && ` · concluída em ${fmtData(a.concluidaEm)}`}</p></div>
                  <button onClick={() => delAcao(a.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ); })}
              {i.acoes.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground italic">Nenhuma ação definida.</li>}
            </ul>
            <div className="px-4 py-3 border-t border-border/60 grid grid-cols-[1fr_180px_150px_auto] gap-2 items-end">
              <div><Label>Nova ação</Label><Input value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} className="h-9" placeholder="O que será feito para não repetir" /></div>
              <div><Label>Responsável</Label><SelectMenu value={nova.responsavelId} onChange={(v) => setNova({ ...nova, responsavelId: v })} options={[{ value: "", label: "—" }, ...lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))]} /></div>
              <div><Label>Prazo</Label><DatePicker value={nova.prazo} onChange={(v) => setNova({ ...nova, prazo: v })} /></div>
              <Button size="sm" variant="outline" disabled={!nova.descricao.trim() || saving} onClick={addAcao} className="h-9"><Plus className="w-4 h-4" /></Button>
            </div>
          </section>
        </div>
        <aside className="space-y-6">
          <section className={cn("bg-card rounded-xl border", exigeCat && !i.catNumero ? "border-danger/40" : "border-border")}>
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">CAT {exigeCat && !i.catNumero && <span className="text-xs text-danger font-normal">— obrigatória para este tipo</span>}</h2></div>
            <div className="p-4 space-y-3 text-sm">
              <div><Label>Número da CAT</Label><Input value={cat.catNumero} onChange={(e) => setCat({ ...cat, catNumero: e.target.value })} className="h-9" /></div>
              <div><Label>Emitida em</Label><DatePicker value={cat.catEmitidaEm} onChange={(v) => setCat({ ...cat, catEmitidaEm: v })} /></div>
              <div><Label>Dias de afastamento</Label><Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)} className="h-9" /></div>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => patch({ catNumero: cat.catNumero, catEmitidaEm: cat.catEmitidaEm || null, diasAfastamento: dias || null })} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Salvar</Button>
              <div><Label>CAT (PDF)</Label><div className="mt-1">{i.catDocumentoId ? <DocLink id={i.catDocumentoId} label="ver CAT" /> : <UploadAnexo tipo="outro" titulo={`CAT — ${i.numero}`} colaboradorId={i.colaborador?.id} value={null} onChange={(d) => d && patch({ catDocumentoId: d })} label="anexar CAT" />}</div></div>
            </div>
          </section>
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Evidências (fotos, laudos)</h2></div>
            <div className="p-4 space-y-2 text-sm">
              {i.evidencias.map((d) => <div key={d}><DocLink id={d} label="ver evidência" /> <button onClick={() => patch({ evidencias: i.evidencias.filter((x) => x !== d) })} className="text-xs text-muted-foreground hover:text-danger ml-2">remover</button></div>)}
              <UploadAnexo tipo="outro" titulo={`Evidência — ${i.numero}`} value={null} onChange={(d) => d && patch({ evidencias: [...i.evidencias, d] })} label="anexar evidência" />
            </div>
          </section>
          {i.status !== "ENCERRADO" && (
            <Button className="w-full bg-success hover:bg-success/90 text-white" disabled={saving} onClick={() => patch({ status: "ENCERRADO" })}>Encerrar ocorrência</Button>
          )}
        </aside>
      </div>
      <ConfirmDialog open={del} onOpenChange={setDel} title="Excluir ocorrência?" description={`${i.numero} vai para a lixeira.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
