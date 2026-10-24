"use client";

// Solicitações de Serviço: qualquer usuário abre (equipamento, problema, se parou);
// o PCM faz a triagem — vira OS, é anexada a uma OS aberta ou é recusada.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { AtivoCombobox, DataHora, OPCOES_PRIORIDADE, PrioridadeTxt, StatusOSBadge, api, fmtDataHora, useManutLookups } from "@/components/manutencao/comum";

type SS = {
  id: string; numero: string; descricao: string; status: string; prioridade: string | null; ativoParado: boolean; paradoDesde: string | null;
  localTexto: string | null; solicitanteNome: string | null; createdAt: string; motivoRecusa: string | null; triadoPor: string | null;
  ativo: { id: string; tag: string; nome: string } | null; ordem: { id: string; numero: string; status: string } | null;
};
type OSAberta = { id: string; numero: string; descricao: string; ativo: { tag: string; nome: string } | null };

const ABAS = [
  { value: "ABERTA", label: "Aguardando triagem" },
  { value: "CONVERTIDA", label: "Viraram OS" },
  { value: "ANEXADA", label: "Anexadas" },
  { value: "RECUSADA", label: "Recusadas" },
  { value: "todas", label: "Todas" },
];
const STATUS_SS: Record<string, string> = { ABERTA: "Aguardando", CONVERTIDA: "Virou OS", ANEXADA: "Anexada", RECUSADA: "Recusada" };

export default function SolicitacoesServicoPage() {
  useTabTitle("Solicitações de Serviço");
  const router = useRouter();
  const lk = useManutLookups();
  const [aba, setAba] = usePersistedState<string>("pcm:ss:aba", "ABERTA");
  const [lista, setLista] = useState<SS[]>([]);
  const [podeTriar, setPodeTriar] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/pcm/solicitacoes?status=${aba}`).then((r) => r.json()).catch(() => ({}));
    setLista(j.data ?? []); setPodeTriar(!!j.podeTriar); setLoading(false);
  }, [aba]);
  useEffect(() => { load(); }, [load]);

  // nova SS
  const [nova, setNova] = useState<{ ativoId: string; localTexto: string; descricao: string; ativoParado: boolean; paradoDesde: string; prioridade: string } | null>(null);
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  async function enviar() {
    if (!nova) return;
    setSaving(true); setErro("");
    const r = await api("/api/pcm/solicitacoes", "POST", { ...nova, paradoDesde: nova.paradoDesde || null, prioridade: nova.prioridade || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    setNova(null); setAba("ABERTA"); load();
  }

  // triagem
  const [tri, setTri] = useState<{ ss: SS; acao: "converter" | "anexar" | "recusar"; ativoId: string; tipoId: string; descricao: string; prioridade: string; equipeId: string; responsavelId: string; programadaPara: string; ordemId: string; motivo: string } | null>(null);
  const [abertas, setAbertas] = useState<OSAberta[]>([]);
  async function abrirTriagem(ss: SS, acao: "converter" | "anexar" | "recusar") {
    setErro("");
    const corretiva = lk.tipos.find((t) => t.natureza === "CORRETIVA" && t.contaComoFalha);
    setTri({ ss, acao, ativoId: ss.ativo?.id ?? "", tipoId: corretiva?.id ?? "", descricao: ss.descricao, prioridade: ss.prioridade ?? (ss.ativoParado ? "ALTA" : ""), equipeId: "", responsavelId: "", programadaPara: "", ordemId: "", motivo: "" });
    if (acao === "anexar") {
      const j = await fetch(`/api/pcm/os?situacao=abertas${ss.ativo ? `&ativoId=${ss.ativo.id}` : ""}`).then((r) => r.json()).catch(() => ({}));
      setAbertas(j.data ?? []);
    }
  }
  async function triar() {
    if (!tri) return;
    setSaving(true); setErro("");
    const { ss, ...corpo } = tri;
    const r = await api<{ ordemId: string | null }>(`/api/pcm/solicitacoes/${ss.id}`, "POST", { ...corpo, programadaPara: corpo.programadaPara || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    setTri(null);
    if (tri.acao === "converter" && r.data?.ordemId) router.push(`/pcm/os/${r.data.ordemId}`); else load();
  }

  const urgentes = useMemo(() => lista.filter((s) => s.status === "ABERTA" && (s.ativoParado || s.prioridade === "EMERGENCIA")).length, [lista]);

  return (
    <div>
      <PageHeader title="Solicitações de Serviço" subtitle={podeTriar ? "Pedidos de manutenção abertos pela fábrica — faça a triagem" : "Peça manutenção e acompanhe suas solicitações"}
        breadcrumbs={[{ label: "Manutenção" }, { label: "Solicitações" }]}
        action={<Button onClick={() => { setErro(""); setNova({ ativoId: "", localTexto: "", descricao: "", ativoParado: false, paradoDesde: "", prioridade: "" }); }} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova solicitação</Button>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {ABAS.map((a) => <button key={a.value} onClick={() => setAba(a.value)} className={cn("text-xs px-2.5 py-1 rounded-full border", aba === a.value ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{a.label}</button>)}
          {urgentes > 0 && <span className="ml-2 text-xs text-danger inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {urgentes} com máquina parada/emergência</span>}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2">
            {lista.map((s) => (
              <div key={s.id} className={cn("bg-card border rounded-xl px-4 py-3", s.status === "ABERTA" && (s.ativoParado || s.prioridade === "EMERGENCIA") ? "border-danger/40" : "border-border")}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[16rem]">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{s.numero}</span>
                      <span className="text-foreground">{s.ativo ? `${s.ativo.tag} — ${s.ativo.nome}` : s.localTexto ?? "—"}</span>
                      {s.ativoParado && <span className="text-[11px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">parado desde {fmtDataHora(s.paradoDesde)}</span>}
                      {s.prioridade && <PrioridadeTxt p={s.prioridade} />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{s.descricao}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{s.solicitanteNome ?? "—"} · {fmtDataHora(s.createdAt)}{s.triadoPor ? ` · triada por ${s.triadoPor}` : ""}</p>
                    {s.status === "RECUSADA" && s.motivoRecusa && <p className="text-xs text-danger mt-1">Recusada: {s.motivoRecusa}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.ordem ? <Link href={`/pcm/os/${s.ordem.id}`} className="text-xs text-info hover:underline inline-flex items-center gap-1.5">{s.ordem.numero} <StatusOSBadge s={s.ordem.status} /></Link> : <span className="text-xs text-muted-foreground">{STATUS_SS[s.status] ?? s.status}</span>}
                    {podeTriar && s.status === "ABERTA" && <>
                      <Button size="sm" onClick={() => abrirTriagem(s, "converter")}>Gerar OS</Button>
                      <Button size="sm" variant="outline" onClick={() => abrirTriagem(s, "anexar")}>Anexar a OS</Button>
                      <Button size="sm" variant="outline" onClick={() => abrirTriagem(s, "recusar")}>Recusar</Button>
                    </>}
                  </div>
                </div>
              </div>
            ))}
            {lista.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Nenhuma solicitação aqui.</p>}
          </div>
        )}
      </div>

      <Dialog open={!!nova} onOpenChange={(v) => !v && setNova(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Nova solicitação de manutenção</DialogTitle></DialogHeader>
          {nova && <div className="space-y-3">
            <div><Label>Equipamento</Label><AtivoCombobox ativos={lk.ativos} value={nova.ativoId} onChange={(v) => setNova({ ...nova, ativoId: v })} allowNone /></div>
            {!nova.ativoId && <div><Label>Não achou? Diga onde fica</Label><Input value={nova.localTexto} onChange={(e) => setNova({ ...nova, localTexto: e.target.value })} placeholder="Ex.: esteira depois do forno 2" /></div>}
            <div><Label>O que está acontecendo?</Label><Textarea rows={4} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} placeholder="Barulho, vazamento, não liga…" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={nova.ativoParado} onChange={(e) => setNova({ ...nova, ativoParado: e.target.checked })} /> A máquina parou</label>
            {nova.ativoParado && <div><Label>Parada desde <span className="text-muted-foreground font-normal text-xs">(vazio = agora)</span></Label><DataHora value={nova.paradoDesde} onChange={(v) => setNova({ ...nova, paradoDesde: v })} /></div>}
            <div><Label>Urgência</Label><SelectMenu value={nova.prioridade} onChange={(v) => setNova({ ...nova, prioridade: v })} options={[{ value: "", label: "Deixar o PCM decidir" }, ...OPCOES_PRIORIDADE]} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setNova(null)}>Cancelar</Button><Button onClick={enviar} disabled={saving}>{saving ? "Enviando…" : "Enviar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tri} onOpenChange={(v) => !v && setTri(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{tri?.acao === "converter" ? `Gerar OS da ${tri.ss.numero}` : tri?.acao === "anexar" ? `Anexar ${tri.ss.numero} a uma OS aberta` : `Recusar ${tri?.ss.numero}`}</DialogTitle></DialogHeader>
          {tri && <div className="space-y-3">
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap">{tri.ss.descricao}</p>
            {tri.acao === "converter" && <>
              <div><Label>Ativo</Label><AtivoCombobox ativos={lk.ativos} value={tri.ativoId} onChange={(v) => setTri({ ...tri, ativoId: v })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Tipo</Label><SelectMenu value={tri.tipoId} onChange={(v) => setTri({ ...tri, tipoId: v })} options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
                <div><Label>Prioridade</Label><SelectMenu value={tri.prioridade} onChange={(v) => setTri({ ...tri, prioridade: v })} options={[{ value: "", label: "Pela criticidade" }, ...OPCOES_PRIORIDADE]} /></div>
              </div>
              <div><Label>Descrição da OS</Label><Textarea rows={3} value={tri.descricao} onChange={(e) => setTri({ ...tri, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Equipe</Label><SelectMenu value={tri.equipeId} onChange={(v) => setTri({ ...tri, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
                <div><Label>Responsável</Label><ComboboxWithCreate value={tri.responsavelId} onChange={(v) => setTri({ ...tri, responsavelId: v })} allowNone options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="—" /></div>
              </div>
              <div><Label>Programar para</Label><DataHora value={tri.programadaPara} onChange={(v) => setTri({ ...tri, programadaPara: v })} /></div>
              {tri.ss.ativoParado && <p className="text-xs text-danger">A parada informada ({fmtDataHora(tri.ss.paradoDesde)}) entra na OS e marca o ativo como parado.</p>}
            </>}
            {tri.acao === "anexar" && (
              <div><Label>OS em aberto</Label>
                <SelectMenu value={tri.ordemId} onChange={(v) => setTri({ ...tri, ordemId: v })} placeholder={abertas.length ? "Escolha…" : "Nenhuma OS aberta deste ativo"}
                  options={abertas.map((o) => ({ value: o.id, label: `${o.numero} · ${o.ativo ? o.ativo.tag : "—"} · ${o.descricao.slice(0, 60)}` }))} />
              </div>
            )}
            {tri.acao === "recusar" && <div><Label>Motivo (o solicitante recebe)</Label><Textarea rows={3} value={tri.motivo} onChange={(e) => setTri({ ...tri, motivo: e.target.value })} /></div>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setTri(null)}>Voltar</Button><Button onClick={triar} disabled={saving} variant={tri?.acao === "recusar" ? "destructive" : "default"}>{saving ? "Salvando…" : "Confirmar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
