"use client";

// Ordens de Serviço (operação): fila por situação, nova OS direta (emergência sem
// SS) e geração manual das preventivas vencendo. Detalhe em /pcm/os/[id].
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { CalendarClock, Loader2, Plus, Search, Timer } from "lucide-react";
import {
  AtivoCombobox, DataHora, OPCOES_PRIORIDADE, PrioridadeTxt, StatusOSBadge, api, brl, fmtData, useManutLookups,
} from "@/components/manutencao/comum";

type OS = {
  id: string; numero: string; status: string; prioridade: string; descricao: string; createdAt: string; programadaPara: string | null; prazo: string | null;
  paradaInicio: string | null; paradaFim: string | null; concluidaEm: string | null; localTexto: string | null; planoId: string | null;
  custoMaoObra: string; custoMaterial: string; custoTerceiros: string;
  ativo: { id: string; tag: string; nome: string } | null; tipo: { sigla: string; nome: string; natureza: string };
  equipe: { nome: string } | null; responsavel: { nome: string } | null; apontamentos: { nome: string }[];
};

const SITUACOES = [
  { value: "abertas", label: "Em aberto" },
  { value: "encerradas", label: "A validar" },
  { value: "concluidas", label: "Concluídas" },
  { value: "canceladas", label: "Canceladas" },
  { value: "todas", label: "Todas" },
];

export default function OrdensServicoPage() {
  useTabTitle("Ordens de Serviço");
  const router = useRouter();
  const lk = useManutLookups();
  const [situacao, setSituacao] = usePersistedState<string>("pcm:os:situacao", "abertas");
  const [equipeId, setEquipeId] = usePersistedState<string>("pcm:os:equipe", "");
  const [tipoId, setTipoId] = usePersistedState<string>("pcm:os:tipo", "");
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<OS[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ situacao, ...(equipeId ? { equipeId } : {}), ...(tipoId ? { tipoId } : {}) });
    const j = await fetch(`/api/pcm/os?${qs}`).then((r) => r.json()).catch(() => ({}));
    setLista(j.data ?? []); setLoading(false);
  }, [situacao, equipeId, tipoId]);
  useEffect(() => { load(); }, [load]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? lista.filter((o) => `${o.numero} ${o.descricao} ${o.ativo?.tag ?? ""} ${o.ativo?.nome ?? ""} ${o.localTexto ?? ""}`.toLowerCase().includes(q)) : lista;
  }, [lista, busca]);
  const hoje = new Date();
  const atrasada = (o: OS) => !["CONCLUIDA", "CANCELADA", "ENCERRADA"].includes(o.status) && !!(o.prazo ?? o.programadaPara) && new Date(o.prazo ?? o.programadaPara!) < new Date(hoje.toDateString());

  // nova OS
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ativoId: "", tipoId: "", descricao: "", prioridade: "", equipeId: "", responsavelId: "", programadaPara: "", ativoParado: false, paradaInicio: "" });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrirNova() { setF({ ativoId: "", tipoId: "", descricao: "", prioridade: "", equipeId: "", responsavelId: "", programadaPara: "", ativoParado: false, paradaInicio: "" }); setErro(""); setOpen(true); }
  async function criar() {
    setSaving(true); setErro("");
    const r = await api<{ id: string }>("/api/pcm/os", "POST", { ...f, programadaPara: f.programadaPara || null, paradaInicio: f.paradaInicio || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    setOpen(false); router.push(`/pcm/os/${r.data!.id}`);
  }

  const [gerando, setGerando] = useState(false); const [msgGerar, setMsgGerar] = useState("");
  async function gerar() {
    setGerando(true); setMsgGerar("");
    const r = await api<{ geradas: { numero: string }[]; puladas: number }>("/api/pcm/preventivas", "POST");
    setGerando(false);
    setMsgGerar(r.ok ? (r.data!.geradas.length ? `${r.data!.geradas.length} preventiva(s) gerada(s): ${r.data!.geradas.map((g) => g.numero).join(", ")}` : "Nenhuma preventiva vencendo.") : r.error!);
    if (r.ok && r.data!.geradas.length) load();
  }

  return (
    <div>
      <PageHeader title="Ordens de Serviço" subtitle="Corretivas, preventivas e inspeções — da abertura à validação pelo PCM" breadcrumbs={[{ label: "Manutenção" }, { label: "Ordens de Serviço" }]}
        action={<div className="flex gap-2">
          <Button variant="outline" onClick={gerar} disabled={gerando} className="gap-1.5">{gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Gerar preventivas</Button>
          <Button onClick={abrirNova} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova OS</Button>
        </div>} />
      <div className="px-8 pb-8 space-y-4">
        {msgGerar && <p className="text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">{msgGerar}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {SITUACOES.map((s) => (
            <button key={s.value} onClick={() => setSituacao(s.value)} className={cn("text-xs px-2.5 py-1 rounded-full border", situacao === s.value ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{s.label}</button>
          ))}
          <SelectMenu value={equipeId} onChange={setEquipeId} options={[{ value: "", label: "Todas as equipes" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} triggerClassName="h-8 text-xs" />
          <SelectMenu value={tipoId} onChange={setTipoId} options={[{ value: "", label: "Todos os tipos" }, ...lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))]} triggerClassName="h-8 text-xs" />
          <div className="relative ml-auto"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, ativo, descrição…" className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" /></div>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">OS</th><th className="text-left px-3 py-2 font-semibold">Ativo</th><th className="text-left px-3 py-2 font-semibold">Descrição</th>
                <th className="text-left px-3 py-2 font-semibold">Tipo</th><th className="text-left px-3 py-2 font-semibold">Prioridade</th><th className="text-left px-3 py-2 font-semibold">Equipe</th>
                <th className="text-left px-3 py-2 font-semibold">Programada</th><th className="text-left px-3 py-2 font-semibold">Status</th><th className="text-right px-4 py-2 font-semibold">Custo</th>
              </tr></thead>
              <tbody>
                {visiveis.map((o) => (
                  <tr key={o.id} onClick={() => router.push(`/pcm/os/${o.id}`)} className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{o.numero}{o.planoId && <span className="ml-1 text-[10px] text-info">plano</span>}</td>
                    <td className="px-3 py-2 text-foreground">
                      {o.ativo ? <><span className="text-xs text-muted-foreground">{o.ativo.tag}</span> {o.ativo.nome}</> : <span className="text-muted-foreground">{o.localTexto ?? "—"}</span>}
                      {o.paradaInicio && !o.paradaFim && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">parado</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[22rem] truncate" title={o.descricao}>{o.descricao}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={o.tipo.nome}>{o.tipo.sigla}</td>
                    <td className="px-3 py-2"><PrioridadeTxt p={o.prioridade} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{o.equipe?.nome ?? "—"}</td>
                    <td className={cn("px-3 py-2 text-xs whitespace-nowrap", atrasada(o) ? "text-danger font-medium" : "text-muted-foreground")}>{fmtData(o.prazo ?? o.programadaPara)}{atrasada(o) && " · atrasada"}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1.5"><StatusOSBadge s={o.status} />{o.apontamentos.length > 0 && <span title={`Em execução: ${o.apontamentos.map((a) => a.nome).join(", ")}`}><Timer className="w-3.5 h-3.5 text-warning" /></span>}</div></td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">{brl(Number(o.custoMaoObra) + Number(o.custoMaterial) + Number(o.custoTerceiros))}</td>
                  </tr>
                ))}
                {visiveis.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma OS nesta situação.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nova OS</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ativo</Label><AtivoCombobox ativos={lk.ativos} value={f.ativoId} onChange={(v) => setF({ ...f, ativoId: v })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Tipo de manutenção</Label><SelectMenu value={f.tipoId} onChange={(v) => setF({ ...f, tipoId: v })} placeholder="Escolha…" options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
              <div><Label>Prioridade <span className="text-muted-foreground font-normal text-xs">(vazio = pela criticidade)</span></Label><SelectMenu value={f.prioridade} onChange={(v) => setF({ ...f, prioridade: v })} options={[{ value: "", label: "Automática" }, ...OPCOES_PRIORIDADE]} /></div>
            </div>
            <div><Label>Descrição do serviço</Label><Textarea rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="O que precisa ser feito / o que foi observado" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Equipe</Label><SelectMenu value={f.equipeId} onChange={(v) => setF({ ...f, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
              <div><Label>Responsável</Label><ComboboxWithCreate value={f.responsavelId} onChange={(v) => setF({ ...f, responsavelId: v })} allowNone options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="—" /></div>
            </div>
            <div><Label>Programada para</Label><DataHora value={f.programadaPara} onChange={(v) => setF({ ...f, programadaPara: v })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.ativoParado} onChange={(e) => setF({ ...f, ativoParado: e.target.checked })} /> O ativo está parado</label>
            {f.ativoParado && <div><Label>Parado desde <span className="text-muted-foreground font-normal text-xs">(vazio = agora)</span></Label><DataHora value={f.paradaInicio} onChange={(v) => setF({ ...f, paradaInicio: v })} /></div>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={criar} disabled={saving}>{saving ? "Criando…" : "Criar e abrir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
