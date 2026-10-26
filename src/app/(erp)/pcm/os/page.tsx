"use client";

// Ordens de Serviço no formato de CMMS (modelo Tractian): 1ª linha com título,
// visões como abas com ícone (Painel → /pcm, Tabela, Calendário, Kanban), busca
// larga, preventivas e "+ Adicionar"; 2ª linha com os filtros-chip (Filtros, Eu,
// Executante, Equipe, Data, Ativo/Local, Prioridade, Limpar) — persistidos por
// usuário. A OS abre POR CIMA (?os=<id>) sem sair do quadro. Kanban por status
// com arrastar = ação do motor da OS.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DateRangePicker from "@/components/shared/DateRangePicker";
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
  AlertTriangle, BookmarkCheck, Calendar as CalendarIcon, CalendarClock, Check, ChevronDown, Flag, HardHat, Kanban, LayoutDashboard,
  Loader2, MapPin, Plus, Search, SlidersHorizontal, Table2, UserRound, Users, X,
} from "lucide-react";
import {
  AtivoCombobox, DataHora, OPCOES_PRIORIDADE, api, fmtData, useManutLookups,
} from "@/components/manutencao/comum";
import { dataReferenciaOS, type OSResumo } from "@/components/manutencao/os-quadro";
import { SITUACOES_OS } from "@/components/manutencao/OSListaView";
import OSKanbanView from "@/components/manutencao/OSKanbanView";
import OSListaView from "@/components/manutencao/OSListaView";
import OSCalendarioView from "@/components/manutencao/OSCalendarioView";
import OrdemServicoDetalhe from "@/components/manutencao/OrdemServicoDetalhe";

type Visao = "kanban" | "lista" | "calendario";

const VISOES: { key: Visao; label: string; icon: typeof Kanban }[] = [
  { key: "lista", label: "Tabela", icon: Table2 },
  { key: "calendario", label: "Calendário", icon: CalendarIcon },
  { key: "kanban", label: "Kanban", icon: Kanban },
];

// Modais (dialogs do detalhe), popovers ou o menu ⋮ abertos: o ESC é deles, não do cartão.
const SELETOR_CAMADA_ABERTA = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper], [role="menu"]';

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

  // Filtros (persistidos por usuário). Situação vale só na Lista; Quadro e
  // Calendário mostram as abertas + a validar + concluídas dos últimos 30 dias.
  const [situacao, setSituacao] = usePersistedState<string>("pcm:os:situacao", "abertas");
  const [equipeId, setEquipeId] = usePersistedState<string>("pcm:os:equipe", "");
  const [tipoId, setTipoId] = usePersistedState<string>("pcm:os:tipo", "");
  const [prioridade, setPrioridade] = usePersistedState<string>("pcm:os:prioridade", "");
  const [minhas, setMinhas] = usePersistedState<boolean>("pcm:os:minhas", false);
  const [executanteId, setExecutanteId] = usePersistedState<string>("pcm:os:executante", "");
  const [ativoFiltro, setAtivoFiltro] = usePersistedState<string>("pcm:os:ativo", "");
  const [periodo, setPeriodo] = usePersistedState<{ from: string; to: string }>("pcm:os:periodo", { from: "", to: "" });
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
    const qs = new URLSearchParams({ situacao: fonte, ...(equipeId ? { equipeId } : {}), ...(tipoId ? { tipoId } : {}), ...(minhas ? { minhas: "1" } : {}), ...(executanteId ? { executanteId } : {}) });
    const j = await fetch(`/api/pcm/os?${qs}`).then((r) => r.json()).catch(() => ({}));
    if (seq !== reqSeq.current) return;
    setLista(j.data ?? []); setPodeValidar(!!j.podeValidar); setLoading(false);
  }, [fonte, equipeId, tipoId, minhas, executanteId]);
  useEffect(() => { load(); }, [load]);

  // Recarrega ao voltar o foco (colaboração sem websocket, como em Projetos).
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Ativo/Local: o escolhido e tudo abaixo dele na árvore.
  const ativosDoFiltro = useMemo(() => {
    if (!ativoFiltro) return null;
    const filhos = new Map<string, string[]>();
    for (const a of lk.ativos) if (a.paiId) filhos.set(a.paiId, [...(filhos.get(a.paiId) ?? []), a.id]);
    const out = new Set<string>([ativoFiltro]);
    const fila = [ativoFiltro];
    while (fila.length) for (const f of filhos.get(fila.shift()!) ?? []) if (!out.has(f)) { out.add(f); fila.push(f); }
    return out;
  }, [ativoFiltro, lk.ativos]);
  const caminhos = useMemo(() => new Map(lk.ativos.map((a) => [a.id, a.caminho])), [lk.ativos]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((o) => {
      if (prioridade && o.prioridade !== prioridade) return false;
      if (ativosDoFiltro && !(o.ativo && ativosDoFiltro.has(o.ativo.id))) return false;
      // Data: programação (ou vencimento) dentro do período
      if (periodo.from || periodo.to) {
        const ref = dataReferenciaOS(o);
        if (!ref) return false;
        const d = new Date(ref);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (periodo.from && dia < periodo.from) return false;
        if (periodo.to && dia > periodo.to) return false;
      }
      if (q && !`${o.numero} ${o.descricao} ${o.ativo?.tag ?? ""} ${o.ativo?.nome ?? ""} ${o.localTexto ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lista, busca, prioridade, ativosDoFiltro, periodo]);

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
  type Previa = { planoAtivoId: string; plano: string; planoCodigo: string; ativo: string; gatilho: string; vencimento: string | null; medida: { alvo: number; atual: number; unidade: string } | null; atrasada: boolean; checklist: number; kit: number; rota?: string | null; bloqueio: string | null; osAberta: { id: string; numero: string } | null };
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

  const nFiltros = [equipeId, tipoId, prioridade, minhas, executanteId, ativoFiltro, periodo.from || periodo.to].filter(Boolean).length + (visao === "lista" && situacao !== "abertas" ? 1 : 0);
  const temFiltro = nFiltros > 0 || !!busca;
  function limparFiltros() {
    setEquipeId(""); setTipoId(""); setPrioridade(""); setMinhas(false); setExecutanteId(""); setAtivoFiltro(""); setPeriodo({ from: "", to: "" }); setBusca("");
  }
  const nomeDe = <T extends { id: string }>(l: T[], id: string, f: (x: T) => string) => { const x = l.find((y) => y.id === id); return x ? f(x) : null; };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Linha 1: título, visões (abas com ícone), busca larga e ações ── */}
      <div className="px-6 pt-3 pb-2 shrink-0 flex items-center gap-3 flex-wrap">
        <h1 className="font-bold text-lg text-foreground whitespace-nowrap">Ordens de Serviço</h1>
        <nav className="flex items-center gap-0.5 border-b border-transparent">
          <Link href="/pcm" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Painel da Manutenção">
            <LayoutDashboard className="w-4 h-4" /> Painel
          </Link>
          {VISOES.map((v) => (
            <button key={v.key} onClick={() => setVisao(v.key)}
              className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md transition-colors", visao === v.key ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <v.icon className="w-4 h-4" /> {v.label}
            </button>
          ))}
        </nav>
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar Ordem de Serviço (nº, descrição, ativo…)" className="h-9 w-full pl-9 pr-3 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-info/50" />
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={abrirPrevia} disabled={gerando} title="Gerar preventivas (com prévia)" aria-label="Gerar preventivas" className="h-9 w-9 p-0">{gerando && !previa ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}</Button>
          <Button size="sm" onClick={abrirNova} className="h-9 gap-1.5"><Plus className="w-4 h-4" /> Adicionar</Button>
        </div>
      </div>

      {/* ── Linha 2: filtros-chip ── */}
      <div className="px-6 pb-2.5 border-b border-border shrink-0 flex items-center gap-1.5 flex-wrap">
        <ChipMenu icon={SlidersHorizontal} label={`Filtros${nFiltros ? ` (${nFiltros})` : ""}`} ativo={nFiltros > 0} largura="w-72">
          {() => (
            <div className="space-y-3 p-1">
              <div><Label className="text-xs">Categoria (tipo)</Label><SelectMenu value={tipoId} onChange={setTipoId} options={[{ value: "", label: "Todas" }, ...lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))]} /></div>
              {visao === "lista" && <div><Label className="text-xs">Situação (Tabela)</Label><SelectMenu value={situacao} onChange={setSituacao} options={SITUACOES_OS} /></div>}
              <p className="text-[11px] text-muted-foreground">Kanban e Calendário mostram as abertas, as a validar e as concluídas nos últimos 30 dias.</p>
            </div>
          )}
        </ChipMenu>
        <button onClick={() => setMinhas(!minhas)} title="Só minhas — OS em que sou o responsável ou tenho apontamento" className={chipCls(minhas)}>
          <UserRound className="w-3.5 h-3.5" /> Eu
        </button>
        <ChipLista icon={HardHat} label="Executante" valor={nomeDe(lk.colaboradores, executanteId, (c) => c.nome)} onLimpar={() => setExecutanteId("")}
          opcoes={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} onEscolher={setExecutanteId} selecionado={executanteId} />
        <ChipLista icon={Users} label="Equipe" valor={nomeDe(lk.equipes, equipeId, (e) => e.nome)} onLimpar={() => setEquipeId("")}
          opcoes={lk.equipes.map((e) => ({ value: e.id, label: e.nome }))} onEscolher={setEquipeId} selecionado={equipeId} />
        <div className="shrink-0" title="Data (programação ou vencimento)">
          <DateRangePicker value={periodo} onChange={setPeriodo} placeholder="Data" triggerClassName={cn(chipCls(!!(periodo.from || periodo.to)), "w-auto")} />
        </div>
        <ChipLista icon={MapPin} label="Ativo/Local" valor={nomeDe(lk.ativos, ativoFiltro, (a) => `${a.tag} ${a.nome}`)} onLimpar={() => setAtivoFiltro("")} largura="w-96"
          opcoes={lk.ativos.map((a) => ({ value: a.id, label: `${a.tag} — ${a.nome}`, sub: a.caminho }))} onEscolher={setAtivoFiltro} selecionado={ativoFiltro} />
        <ChipLista icon={Flag} label="Prioridade" valor={OPCOES_PRIORIDADE.find((p) => p.value === prioridade)?.label ?? null} onLimpar={() => setPrioridade("")}
          opcoes={OPCOES_PRIORIDADE} onEscolher={setPrioridade} selecionado={prioridade} semBusca />
        {temFiltro && <button onClick={limparFiltros} className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Limpar</button>}
        <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1" title="Os filtros e a visão ficam salvos para o seu usuário neste navegador">
          <BookmarkCheck className="w-3.5 h-3.5" /> Filtros salvos{!loading && <> · {visiveis.length} OS</>}
        </span>
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
          <OSKanbanView ordens={visiveis} caminhos={caminhos} podeValidar={podeValidar} onAbrir={abrirOS} onAtualizarLocal={atualizarLocal} onRecarregar={recarregarSilencioso} onAviso={setAviso} />
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
                      {p.bloqueio ? <>{p.bloqueio}{p.osAberta && <> — <button type="button" onClick={() => { const id = p.osAberta!.id; setPrevia(null); abrirOS(id); }} className="text-info hover:underline">{p.osAberta.numero}</button></>}</> : `${p.checklist} itens de checklist${p.kit ? ` · kit ${p.kit}` : ""}${p.rota ? ` · rota ${p.rota} (sai numa OS só com os pontos da rota)` : ""}`}
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

/** Classe do chip de filtro (ativo = destacado). */
function chipCls(ativo: boolean) {
  return cn(
    "shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs transition-colors",
    ativo ? "border-info/50 bg-info/10 text-info" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

/** Chip com popover artesanal (fecha clicando fora ou ESC). */
function ChipMenu({ icon: Icon, label, ativo, largura = "w-64", children, onLimpar }: {
  icon: typeof Users; label: string; ativo: boolean; largura?: string; children: (fechar: () => void) => React.ReactNode; onLimpar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const fechar = () => setAberto(false);
  return (
    <div className="relative shrink-0">
      <button onClick={() => setAberto((v) => !v)} className={chipCls(ativo)}>
        <Icon className="w-3.5 h-3.5" /> <span className="max-w-[12rem] truncate">{label}</span>
        {ativo && onLimpar ? (
          <span role="button" tabIndex={-1} aria-label="Limpar" onClick={(e) => { e.stopPropagation(); onLimpar(); }} className="hover:text-foreground"><X className="w-3 h-3" /></span>
        ) : <ChevronDown className="w-3 h-3 opacity-70" />}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={fechar} />
          <div className={cn("absolute left-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl shadow-xl p-1.5", largura)}>
            <EscClose onClose={fechar} />
            {children(fechar)}
          </div>
        </>
      )}
    </div>
  );
}

/** Chip com lista de opções pesquisável (Executante, Equipe, Ativo/Local, Prioridade). */
function ChipLista({ icon, label, valor, opcoes, selecionado, onEscolher, onLimpar, largura, semBusca }: {
  icon: typeof Users; label: string; valor: string | null; opcoes: { value: string; label: string; sub?: string }[];
  selecionado: string; onEscolher: (v: string) => void; onLimpar: () => void; largura?: string; semBusca?: boolean;
}) {
  const [q, setQ] = useState("");
  const termo = q.trim().toLowerCase();
  const filtradas = termo ? opcoes.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(termo)) : opcoes;
  return (
    <ChipMenu icon={icon} label={valor ? `${label}: ${valor}` : label} ativo={!!valor} largura={largura} onLimpar={onLimpar}>
      {(fechar) => (
        <div>
          {!semBusca && (
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-8 w-full pl-8 pr-2 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-info/50" />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto">
            {selecionado && <button onClick={() => { onLimpar(); fechar(); }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Todos</button>}
            {filtradas.slice(0, 300).map((o) => (
              <button key={o.value} onClick={() => { onEscolher(o.value); fechar(); }}
                className={cn("w-full flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left", selecionado === o.value ? "bg-info/10 text-info" : "text-foreground hover:bg-muted")}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="block text-[11px] text-muted-foreground truncate">{o.sub}</span>}
                </span>
                {selecionado === o.value && <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              </button>
            ))}
            {filtradas.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">Nada encontrado.</p>}
          </div>
        </div>
      )}
    </ChipMenu>
  );
}
