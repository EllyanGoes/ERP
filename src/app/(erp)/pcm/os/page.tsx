"use client";

// Ordens de Serviço — quadro no padrão do módulo Projetos: cabeçalho em uma linha
// (visões estilo Trello + filtros), visão ativa ocupando a área (Quadro por
// status com arrastar = ação da OS, Lista com as situações, Calendário) e o
// cartão da OS abrindo POR CIMA (?os=<id>) sem sair do quadro. Mantém a nova OS
// direta (emergência sem SS) e a geração manual das preventivas vencendo.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import EscClose from "@/components/shared/EscClose";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Calendar as CalendarIcon, CalendarClock, Check, ChevronDown, LayoutGrid, List, Loader2, Plus, Search, UserRound, X,
} from "lucide-react";
import {
  AtivoCombobox, DataHora, OPCOES_PRIORIDADE, api, fmtData, useManutLookups,
} from "@/components/manutencao/comum";
import type { OSResumo } from "@/components/manutencao/os-quadro";
import OSKanbanView from "@/components/manutencao/OSKanbanView";
import OSListaView from "@/components/manutencao/OSListaView";
import OSCalendarioView from "@/components/manutencao/OSCalendarioView";
import OrdemServicoDetalhe from "@/components/manutencao/OrdemServicoDetalhe";

type Visao = "kanban" | "lista" | "calendario";

const VISOES: { key: Visao; label: string; icon: typeof LayoutGrid }[] = [
  { key: "kanban", label: "Quadro", icon: LayoutGrid },
  { key: "lista", label: "Lista", icon: List },
  { key: "calendario", label: "Calendário", icon: CalendarIcon },
];

// Modais Radix (dialogs do detalhe) ou popovers abertos: o ESC é deles, não do cartão.
const SELETOR_CAMADA_ABERTA = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]';

export default function OrdensServicoPage() {
  // useSearchParams exige Suspense numa rota estática.
  return <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><QuadroOS /></Suspense>;
}

function QuadroOS() {
  useTabTitle("Ordens de Serviço");
  const router = useRouter();
  const searchParams = useSearchParams();
  const lk = useManutLookups();

  const [visao, setVisao] = usePersistedState<Visao>("pcm:os:visao", "kanban");
  const [showVisoes, setShowVisoes] = useState(false);

  // Filtros (persistidos por usuário). Situação vale só na Lista; Quadro e
  // Calendário mostram as abertas + a validar + concluídas dos últimos 30 dias.
  const [situacao, setSituacao] = usePersistedState<string>("pcm:os:situacao", "abertas");
  const [equipeId, setEquipeId] = usePersistedState<string>("pcm:os:equipe", "");
  const [tipoId, setTipoId] = usePersistedState<string>("pcm:os:tipo", "");
  const [prioridade, setPrioridade] = usePersistedState<string>("pcm:os:prioridade", "");
  const [minhas, setMinhas] = usePersistedState<boolean>("pcm:os:minhas", false);
  const [busca, setBusca] = useState("");

  const [lista, setLista] = useState<OSResumo[]>([]);
  const [podeValidar, setPodeValidar] = useState(false);
  const [loading, setLoading] = useState(true);
  const fonte = visao === "lista" ? situacao : "quadro";

  // Só a resposta da ÚLTIMA busca vale (troca rápida de filtro/visão).
  const reqSeq = useRef(0);
  const load = useCallback(async (silencioso = false) => {
    const seq = ++reqSeq.current;
    if (!silencioso) setLoading(true);
    const qs = new URLSearchParams({ situacao: fonte, ...(equipeId ? { equipeId } : {}), ...(tipoId ? { tipoId } : {}), ...(minhas ? { minhas: "1" } : {}) });
    const j = await fetch(`/api/pcm/os?${qs}`).then((r) => r.json()).catch(() => ({}));
    if (seq !== reqSeq.current) return;
    setLista(j.data ?? []); setPodeValidar(!!j.podeValidar); setLoading(false);
  }, [fonte, equipeId, tipoId, minhas]);
  useEffect(() => { load(); }, [load]);

  // Recarrega ao voltar o foco (colaboração sem websocket, como em Projetos).
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((o) => {
      if (prioridade && o.prioridade !== prioridade) return false;
      if (q && !`${o.numero} ${o.descricao} ${o.ativo?.tag ?? ""} ${o.ativo?.nome ?? ""} ${o.localTexto ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lista, busca, prioridade]);

  // Mutação local otimista (arrastar no quadro).
  const atualizarLocal = useCallback((id: string, patch: Partial<OSResumo>) => {
    setLista((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  // Aviso flutuante (erros de transição, pendências de encerramento…).
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  // ── Cartão da OS por cima do quadro (?os=<id>) ────────────────────────────
  const osAberta = searchParams.get("os");
  const abrirOS = useCallback((id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("os", id);
    router.replace(`/pcm/os?${p.toString()}`, { scroll: false });
  }, [router, searchParams]);
  const fecharOS = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("os");
    router.replace(`/pcm/os${p.size ? `?${p.toString()}` : ""}`, { scroll: false });
  }, [router, searchParams]);
  const recarregarSilencioso = useCallback(() => { load(true); }, [load]);

  // ESC com um dialog do detalhe aberto fecha só o dialog: anota na captura
  // (antes do Radix tratar) se havia camada aberta e o EscClose do cartão ignora.
  const escDeOutraCamada = useRef(false);
  useEffect(() => {
    if (!osAberta) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") escDeOutraCamada.current = !!document.querySelector(SELETOR_CAMADA_ABERTA); };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [osAberta]);
  const escFecharOS = useCallback(() => {
    if (escDeOutraCamada.current) { escDeOutraCamada.current = false; return; }
    fecharOS();
  }, [fecharOS]);

  // ── Nova OS ───────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ativoId: "", tipoId: "", descricao: "", prioridade: "", equipeId: "", responsavelId: "", programadaPara: "", ativoParado: false, paradaInicio: "" });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrirNova() { setF({ ativoId: "", tipoId: "", descricao: "", prioridade: "", equipeId: "", responsavelId: "", programadaPara: "", ativoParado: false, paradaInicio: "" }); setErro(""); setOpen(true); }
  async function criar() {
    setSaving(true); setErro("");
    const r = await api<{ id: string }>("/api/pcm/os", "POST", { ...f, programadaPara: f.programadaPara || null, paradaInicio: f.paradaInicio || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    setOpen(false); load(true); abrirOS(r.data!.id);
  }

  // ── Preventivas: prévia do que vai ser gerado, escolhe e gera ─────────────
  type Previa = { planoAtivoId: string; plano: string; planoCodigo: string; ativo: string; gatilho: string; vencimento: string | null; medida: { alvo: number; atual: number; unidade: string } | null; atrasada: boolean; checklist: number; kit: number; bloqueio: string | null; osAberta: { id: string; numero: string } | null };
  const [previa, setPrevia] = useState<Previa[] | null>(null);
  const [selPrev, setSelPrev] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false); const [msgGerar, setMsgGerar] = useState("");
  async function abrirPrevia() {
    setGerando(true); setMsgGerar("");
    const r = await api<Previa[]>("/api/pcm/preventivas", "GET");
    setGerando(false);
    if (!r.ok) { setMsgGerar(r.error!); return; }
    setPrevia(r.data!);
    setSelPrev(new Set(r.data!.filter((p) => !p.bloqueio).map((p) => p.planoAtivoId)));
  }
  async function gerar() {
    setGerando(true);
    const r = await api<{ geradas: { numero: string }[] }>("/api/pcm/preventivas", "POST", { planoAtivoIds: Array.from(selPrev) });
    setGerando(false);
    if (!r.ok) { setMsgGerar(r.error!); return; }
    setPrevia(null);
    setMsgGerar(r.data!.geradas.length ? `${r.data!.geradas.length} preventiva(s) gerada(s): ${r.data!.geradas.map((g) => g.numero).join(", ")}` : "Nenhuma preventiva gerada.");
    load(true);
  }

  const temFiltro = !!(equipeId || tipoId || prioridade || minhas || busca);
  const atual = VISOES.find((v) => v.key === visao) ?? VISOES[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabeçalho em UMA linha (modelo Trello): título, visões, filtros e ações ── */}
      <div className="px-6 py-2.5 border-b border-border shrink-0 flex items-center gap-x-2.5 gap-y-2 flex-wrap">
        <h1 className="font-bold text-lg text-foreground whitespace-nowrap">Ordens de Serviço</h1>

        {/* Visões — botão único (ícone da visão atual + seta) com o menu por nome. */}
        <div className="relative">
          <button
            onClick={() => setShowVisoes((v) => !v)}
            title={`Visualização: ${atual.label}`}
            aria-label={`Visualização: ${atual.label}`}
            className={cn("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-foreground transition-colors", showVisoes ? "bg-muted" : "bg-card hover:bg-muted")}
          >
            <atual.icon className="w-4 h-4" />
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {showVisoes && (
            <>
              <div className="fixed inset-0 z-40" onMouseDown={() => setShowVisoes(false)} />
              <div className="absolute left-0 top-full mt-1.5 z-50 w-60 bg-card border border-border rounded-xl shadow-xl p-1.5">
                <EscClose onClose={() => setShowVisoes(false)} />
                <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
                  <span className="w-4" />
                  <span className="text-xs font-semibold text-muted-foreground">Visualizações</span>
                  <button onClick={() => setShowVisoes(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
                {VISOES.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => { setVisao(v.key); setShowVisoes(false); }}
                    className={cn("w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors", visao === v.key ? "bg-info/10 text-info font-medium" : "text-foreground hover:bg-muted")}
                  >
                    <v.icon className="w-4 h-4" />
                    <span className="flex-1">{v.label}</span>
                    {visao === v.key && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Filtros */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, ativo, descrição…" className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
        </div>
        <SelectMenu value={equipeId} onChange={setEquipeId} className="w-40" options={[{ value: "", label: "Todas as equipes" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} />
        <SelectMenu value={tipoId} onChange={setTipoId} className="w-40" options={[{ value: "", label: "Todos os tipos" }, ...lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))]} />
        <SelectMenu value={prioridade} onChange={setPrioridade} className="w-36" options={[{ value: "", label: "Todas as prioridades" }, ...OPCOES_PRIORIDADE]} />
        <button
          onClick={() => setMinhas(!minhas)}
          title="OS em que sou o responsável ou tenho apontamento"
          className={cn("inline-flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors", minhas ? "border-info bg-info/10 text-info" : "border-border bg-card text-muted-foreground hover:bg-muted")}
        >
          <UserRound className="w-3.5 h-3.5" /> Só minhas
        </button>
        {temFiltro && (
          <button onClick={() => { setEquipeId(""); setTipoId(""); setPrioridade(""); setMinhas(false); setBusca(""); }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <X className="w-3 h-3" /> Limpar
          </button>
        )}

        <div className="ml-auto order-last flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={abrirPrevia} disabled={gerando} className="gap-1.5">{gerando && !previa ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Gerar preventivas…</Button>
          <Button size="sm" onClick={abrirNova} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova OS</Button>
        </div>
      </div>

      {msgGerar && (
        <div className="px-6 pt-3 shrink-0">
          <p className="text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2 flex items-start gap-2"><span className="flex-1">{msgGerar}</span><button onClick={() => setMsgGerar("")} className="hover:text-foreground"><X className="w-4 h-4" /></button></p>
        </div>
      )}

      {/* ── Visão ativa ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {visao === "lista" ? (
          <OSListaView ordens={visiveis} loading={loading} situacao={situacao} onSituacao={setSituacao} onAbrir={abrirOS} />
        ) : loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visao === "calendario" ? (
          <OSCalendarioView ordens={visiveis} onAbrir={abrirOS} />
        ) : (
          <OSKanbanView ordens={visiveis} podeValidar={podeValidar} onAbrir={abrirOS} onAtualizarLocal={atualizarLocal} onRecarregar={recarregarSilencioso} onAviso={setAviso} />
        )}
      </div>

      {/* ── Cartão da OS (?os=) ─────────────────────────────────────────────── */}
      {osAberta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) fecharOS(); }}>
          <EscClose onClose={escFecharOS} />
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-6xl my-6">
            <OrdemServicoDetalhe key={osAberta} id={osAberta} modo="overlay" onFechar={fecharOS} onMudou={recarregarSilencioso} />
          </div>
        </div>
      )}

      {/* ── Aviso flutuante ─────────────────────────────────────────────────── */}
      {aviso && (
        <div className="fixed bottom-4 right-4 z-[60] max-w-md bg-card border border-danger/40 shadow-xl rounded-lg px-3 py-2.5 text-sm text-foreground flex items-start gap-2" role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-danger" />
          <span className="flex-1 whitespace-pre-line">{aviso}</span>
          <button onClick={() => setAviso("")} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

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
      <Dialog open={!!previa} onOpenChange={(v) => !v && setPrevia(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>Preventivas a gerar</DialogTitle></DialogHeader>
          {previa && (previa.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma preventiva vencendo agora (considerando a antecedência de cada plano).</p> : (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                <label className="flex items-center gap-1.5"><input type="checkbox" className="rounded" checked={previa.filter((p) => !p.bloqueio).every((p) => selPrev.has(p.planoAtivoId))} onChange={(e) => setSelPrev(e.target.checked ? new Set(previa.filter((p) => !p.bloqueio).map((p) => p.planoAtivoId)) : new Set())} /> Marcar todas</label>
                <span>{selPrev.size} selecionada(s) · {previa.filter((p) => p.bloqueio).length} fora (já têm OS)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="w-6" /><th className="text-left py-1">Ativo</th><th className="text-left py-1">Plano</th><th className="text-left py-1">Vencimento</th><th className="text-left py-1">Inclui</th></tr></thead>
                <tbody>{previa.map((p) => (
                  <tr key={p.planoAtivoId} className={cn("border-t border-border/60 align-top", p.bloqueio && "opacity-50")}>
                    <td className="py-1.5"><input type="checkbox" className="rounded" disabled={!!p.bloqueio} checked={selPrev.has(p.planoAtivoId)} onChange={(e) => { const n = new Set(selPrev); if (e.target.checked) n.add(p.planoAtivoId); else n.delete(p.planoAtivoId); setSelPrev(n); }} /></td>
                    <td className="py-1.5">{p.ativo}</td>
                    <td className="py-1.5 text-xs"><span className="text-muted-foreground">{p.planoCodigo}</span> {p.plano}</td>
                    <td className={cn("py-1.5 text-xs whitespace-nowrap", p.atrasada ? "text-danger font-medium" : "text-muted-foreground")}>
                      {p.gatilho === "CALENDARIO" ? fmtData(p.vencimento) : `${p.medida?.atual} / ${p.medida?.alvo} ${p.medida?.unidade}`}{p.atrasada && " · atrasada"}
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {p.bloqueio ? <>{p.bloqueio}{p.osAberta && <> — <button type="button" onClick={() => { const id = p.osAberta!.id; setPrevia(null); abrirOS(id); }} className="text-info hover:underline">{p.osAberta.numero}</button></>}</> : `${p.checklist} itens de checklist${p.kit ? ` · kit ${p.kit}` : ""}`}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          <DialogFooter><Button variant="outline" onClick={() => setPrevia(null)}>Cancelar</Button><Button onClick={gerar} disabled={gerando || selPrev.size === 0}>{gerando ? "Gerando…" : `Gerar ${selPrev.size} OS`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
