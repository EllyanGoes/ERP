"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
import SelectMenu from "@/components/shared/SelectMenu";
import { Button } from "@/components/ui/button";
import AtivoFormDialog, { type AtivoFicha, type Lookups } from "./AtivoFormDialog";
import AtivoPainel, { StatusAtivoBadge } from "./AtivoPainel";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Layers,
  Cpu,
  Search,
  RefreshCw,
  AlertTriangle,
  PackageSearch,
  Plus,
  MapPin,
  Truck,
  Puzzle,
  GripVertical,
  Undo2,
} from "lucide-react";
import type { AtivoNode } from "@/app/api/pcm/ativos/route";

type Crit = "A" | "B" | "C";
type Filtro = "all" | Crit | "none";

// ── Helpers de árvore ────────────────────────────────────────────────────────
function updateCrit(nodes: AtivoNode[], codApl: number, v: Crit | null): AtivoNode[] {
  return nodes.map((n) => {
    if (n.codApl === codApl) return { ...n, criticidade: v };
    if (n.children.length) return { ...n, children: updateCrit(n.children, codApl, v) };
    return n;
  });
}

function updateRegime(nodes: AtivoNode[], codApl: number, v: number | null): AtivoNode[] {
  return nodes.map((n) => {
    if (n.codApl === codApl) return { ...n, regimeHorasDia: v };
    if (n.children.length) return { ...n, children: updateRegime(n.children, codApl, v) };
    return n;
  });
}

function computeResumo(nodes: AtivoNode[]) {
  const r = { A: 0, B: 0, C: 0, none: 0, total: 0 };
  const walk = (ns: AtivoNode[]) => {
    for (const n of ns) {
      r.total++;
      if (n.criticidade === "A") r.A++;
      else if (n.criticidade === "B") r.B++;
      else if (n.criticidade === "C") r.C++;
      else r.none++;
      walk(n.children);
    }
  };
  walk(nodes);
  return r;
}

function allGroupTaggrus(nodes: AtivoNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: AtivoNode[]) => {
    for (const n of ns) {
      if (n.children.length) {
        out.push(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

// Filtra por busca (tag/descrição) E por criticidade, mantendo os ancestrais
// dos nós que casam (para dar contexto na árvore).
function filterTree(
  nodes: AtivoNode[],
  q: string,
  filtro: Filtro,
): AtivoNode[] {
  const matchCrit = (n: AtivoNode) =>
    filtro === "all" ||
    (filtro === "none" ? n.criticidade === null : n.criticidade === filtro);
  const matchBusca = (n: AtivoNode) =>
    !q ||
    n.descricao.toLowerCase().includes(q) ||
    n.tag.toLowerCase().includes(q) ||
    (n.localizacao ?? "").toLowerCase().includes(q);

  const rec = (ns: AtivoNode[]): AtivoNode[] =>
    ns.flatMap((n) => {
      const filhos = rec(n.children);
      if ((matchBusca(n) && matchCrit(n)) || filhos.length > 0) {
        return [{ ...n, children: filhos }];
      }
      return [];
    });
  return rec(nodes);
}

// ── Seletor de criticidade (inline por linha) ────────────────────────────────
const OPCOES: { v: Crit; on: string; off: string }[] = [
  { v: "A", on: "bg-red-600 text-white border-red-600", off: "text-danger border-danger/30 hover:bg-danger/10" },
  { v: "B", on: "bg-amber-500 text-white border-amber-500", off: "text-warning border-warning/30 hover:bg-warning/10" },
  { v: "C", on: "bg-emerald-600 text-white border-emerald-600", off: "text-success border-success/30 hover:bg-success/10" },
];

function CritSelector({
  value,
  saving,
  onPick,
}: {
  value: Crit | null;
  saving: boolean;
  onPick: (v: Crit | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      {OPCOES.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={saving}
          // Clicar no valor atual remove a classificação (toggle).
          onClick={() => onPick(value === o.v ? null : o.v)}
          title={`Criticidade ${o.v}`}
          className={cn(
            "w-6 h-6 rounded border text-xs font-bold transition-colors disabled:opacity-40",
            value === o.v ? o.on : `bg-card ${o.off}`,
          )}
        >
          {o.v}
        </button>
      ))}
      {saving && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />}
    </div>
  );
}

// ── Seletor de regime de operação (horas/dia) ────────────────────────────────
const REGIMES = [8, 12, 16, 24];

function RegimeSelector({
  value,
  saving,
  onPick,
}: {
  value: number | null;
  saving: boolean;
  onPick: (v: number | null) => void;
}) {
  return (
    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <SelectMenu
        value={value == null ? "" : String(value)}
        disabled={saving}
        onChange={(v) => onPick(v === "" ? null : Number(v))}
        title="Regime de operação (horas/dia) — base do tempo de funcionamento no MTBF"
        className="w-[92px]"
        triggerClassName="h-7 text-xs px-2"
        options={[{ value: "", label: "— 24h" }, ...REGIMES.map((h) => ({ value: String(h), label: `${h}h/dia` }))]}
      />
    </div>
  );
}

// ── Linha da árvore ──────────────────────────────────────────────────────────
const ICONE_TIPO: Record<string, typeof Cpu> = { LOCAL: MapPin, EQUIPAMENTO: Cpu, COMPONENTE: Puzzle, VEICULO: Truck };

// ── Arrastar e soltar (mover o ativo para baixo de outro) ─────────────────────
type DragCtxValue = {
  arrastando: AtivoNode | null;
  invalidos: Set<string>; // o próprio ativo arrastado e seus descendentes
  alvo: string | null; // id do nó sob o cursor (ou "__raiz__")
  iniciar: (n: AtivoNode) => void;
  setAlvo: (id: string | null) => void;
  soltar: (destino: AtivoNode | null) => void;
  terminar: () => void;
  abrir: (id: string) => void;
};
const DragCtx = createContext<DragCtxValue | null>(null);

function idsDaSubarvore(n: AtivoNode): Set<string> {
  const out = new Set<string>();
  const walk = (x: AtivoNode) => { out.add(x.id); x.children.forEach(walk); };
  walk(n);
  return out;
}
function paiDe(nodes: AtivoNode[], id: string, pai: AtivoNode | null = null): AtivoNode | null | undefined {
  for (const n of nodes) {
    if (n.id === id) return pai;
    const r = paiDe(n.children, id, n);
    if (r !== undefined) return r;
  }
  return undefined;
}

function AtivoRow({
  node,
  depth,
  expanded,
  toggle,
  forceOpen,
  savingCodApl,
  selecionado,
  onSelect,
  onClassify,
  onRegime,
}: {
  node: AtivoNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  forceOpen: boolean;
  savingCodApl: number | null;
  selecionado: number | null;
  onSelect: (node: AtivoNode) => void;
  onClassify: (node: AtivoNode, v: Crit | null) => void;
  onRegime: (node: AtivoNode, v: number | null) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = forceOpen || expanded.has(node.id);
  const indent = 8 + depth * 18;
  const Icon = hasChildren && node.tipo !== "VEICULO" ? Layers : ICONE_TIPO[node.tipo] ?? Cpu;
  const dnd = useContext(DragCtx);
  const podeReceber = !!dnd?.arrastando && !dnd.invalidos.has(node.id) && dnd.arrastando.id !== node.id;
  const sobre = podeReceber && dnd?.alvo === node.id;
  // Parar sobre um grupo fechado por ~0,6 s abre o grupo (para soltar lá dentro).
  const timerAbrir = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div>
      <div
        draggable={!!dnd}
        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", node.id); dnd?.iniciar(node); }}
        onDragEnd={() => dnd?.terminar()}
        onDragOver={(e) => {
          if (!podeReceber) return;
          e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move";
          if (dnd!.alvo !== node.id) {
            dnd!.setAlvo(node.id);
            if (timerAbrir.current) clearTimeout(timerAbrir.current);
            if (hasChildren && !isOpen) timerAbrir.current = setTimeout(() => dnd!.abrir(node.id), 600);
          }
        }}
        onDragLeave={() => { if (timerAbrir.current) clearTimeout(timerAbrir.current); }}
        onDrop={(e) => { if (!podeReceber) return; e.preventDefault(); e.stopPropagation(); if (timerAbrir.current) clearTimeout(timerAbrir.current); dnd!.soltar(node); }}
        className={cn(
          "group flex items-center gap-2 pr-3 py-1.5 border-b border-border/40 hover:bg-muted cursor-pointer",
          selecionado === node.codApl && "bg-info/10 hover:bg-info/15",
          !node.ativo && "opacity-60",
          dnd?.arrastando?.id === node.id && "opacity-40",
          sobre && "bg-info/15 ring-2 ring-inset ring-info",
        )}
        style={{ paddingLeft: indent }}
        onClick={() => onSelect(node)}
        title={dnd ? "Arraste para mover para baixo de outro ativo" : undefined}
      >
        <GripVertical className="w-3.5 h-3.5 -ml-1 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 cursor-grab" />
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Icon
          className={cn("w-4 h-4 shrink-0", hasChildren ? "text-indigo-400" : "text-muted-foreground")}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn("text-sm truncate", hasChildren ? "font-medium text-foreground" : "text-foreground")}
            title={node.descricao}
          >
            {node.descricao}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            {node.tag}
            {node.localizacao && <span className="font-sans"> · {node.localizacao}</span>}
          </p>
        </div>
        {(node.status === "PARADO" || !node.ativo) && <StatusAtivoBadge status={node.status} ativo={node.ativo} />}
        <RegimeSelector
          value={node.regimeHorasDia}
          saving={savingCodApl === node.codApl}
          onPick={(v) => onRegime(node, v)}
        />
        <CritSelector
          value={node.criticidade}
          saving={savingCodApl === node.codApl}
          onPick={(v) => onClassify(node, v)}
        />
      </div>
      {isOpen &&
        node.children.map((c) => (
          <AtivoRow
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            forceOpen={forceOpen}
            savingCodApl={savingCodApl}
            selecionado={selecionado}
            onSelect={onSelect}
            onClassify={onClassify}
            onRegime={onRegime}
          />
        ))}
    </div>
  );
}

// ── Chip de resumo/filtro ─────────────────────────────────────────────────────
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-card text-muted-foreground border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function AtivosPage() {
  useTabTitle("Ativos");

  const [tree, setTree] = useState<AtivoNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busca, setBusca] = usePersistedState("pcm:ativos:busca", "");
  const [filtro, setFiltro] = usePersistedState<Filtro>("pcm:ativos:filtro", "all");
  const [savingCodApl, setSavingCodApl] = useState<number | null>(null);
  const [inativos, setInativos] = usePersistedState("pcm:ativos:inativos", false);

  // Painel do ativo selecionado (?ativo=<codApl> abre direto — links da Qualidade).
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const cod = Number(new URLSearchParams(window.location.search).get("ativo"));
    if (Number.isInteger(cod) && cod > 0) setSelecionado(cod);
  }, []);

  // Formulário (criar/editar)
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<AtivoFicha | null>(null);
  const [paiInicial, setPaiInicial] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  useEffect(() => {
    if (!formAberto || lookups) return;
    fetch("/api/pcm/ativos/lookups")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setLookups(j.data))
      .catch(() => {});
  }, [formAberto, lookups]);

  const load = useCallback(async () => {
    setLoading(true);
    setErroCarga(null);
    try {
      const res = await fetch(`/api/pcm/ativos${inativos ? "?inativos=1" : ""}`);
      if (!res.ok) {
        setErroCarga("Não foi possível carregar os ativos.");
        setTree([]);
        return;
      }
      const j = await res.json();
      setTree(j.tree ?? []);
    } catch {
      setErroCarga("Erro de conexão ao carregar os ativos.");
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [inativos]);

  useEffect(() => {
    load();
  }, [load]);

  function novoAtivo(paiId: string | null = null) {
    setEditando(null);
    setPaiInicial(paiId);
    setFormAberto(true);
  }
  function aposSalvar(codApl: number) {
    setSelecionado(codApl);
    setVersao((v) => v + 1);
    load();
  }

  const resumo = useMemo(() => computeResumo(tree), [tree]);

  const filtering = busca.trim() !== "" || filtro !== "all";
  const visible = useMemo(
    () => (filtering ? filterTree(tree, busca.trim().toLowerCase(), filtro) : tree),
    [tree, busca, filtro, filtering],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  function expandirTodos() {
    setExpanded(new Set(allGroupTaggrus(tree)));
  }
  function recolherTodos() {
    setExpanded(new Set());
  }

  // Arrastar e soltar
  const [arrastando, setArrastando] = useState<AtivoNode | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [movido, setMovido] = useState<{ node: AtivoNode; paiAnteriorId: string | null; texto: string } | null>(null);
  const moverPara = useCallback(async (node: AtivoNode, paiId: string | null) => {
    setErroSalvar("");
    const res = await fetch(`/api/pcm/ativos/${node.codApl}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paiId }),
    }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => ({}));
      setErroSalvar(j?.error || `Não foi possível mover "${node.tag}".`);
      return false;
    }
    if (paiId) setExpanded((prev) => new Set(prev).add(paiId));
    await load();
    if (selecionado === node.codApl) setVersao((v) => v + 1);
    return true;
  }, [load, selecionado]);
  const dnd = useMemo<DragCtxValue | null>(() => {
    if (filtering) return null; // com busca/filtro a árvore está recortada — mover só na árvore completa
    return {
      arrastando, alvo, setAlvo,
      invalidos: arrastando ? idsDaSubarvore(arrastando) : new Set(),
      iniciar: (n) => { setArrastando(n); setMovido(null); },
      terminar: () => { setArrastando(null); setAlvo(null); },
      abrir: (id) => setExpanded((prev) => new Set(prev).add(id)),
      soltar: async (destino) => {
        const n = arrastando;
        setArrastando(null); setAlvo(null);
        if (!n) return;
        const anterior = paiDe(tree, n.id) ?? null;
        if ((anterior?.id ?? null) === (destino?.id ?? null)) return;
        if (await moverPara(n, destino?.id ?? null)) {
          setMovido({ node: n, paiAnteriorId: anterior?.id ?? null, texto: `${n.tag} movido para ${destino ? `${destino.tag} — ${destino.descricao}` : "a raiz"}.` });
        }
      },
    };
  }, [filtering, arrastando, alvo, tree, moverPara]);

  const onClassify = useCallback(
    async (node: AtivoNode, v: Crit | null) => {
      const anterior = node.criticidade;
      setSavingCodApl(node.codApl);
      setErroSalvar("");
      setTree((t) => updateCrit(t, node.codApl, v)); // otimista
      try {
        const res = await fetch(`/api/pcm/ativos/${node.codApl}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ criticidade: v }),
        });
        if (!res.ok) throw new Error();
        if (selecionado === node.codApl) setVersao((x) => x + 1);
      } catch {
        setTree((t) => updateCrit(t, node.codApl, anterior)); // reverte
        setErroSalvar(`Não foi possível salvar a criticidade de "${node.tag}". Tente novamente.`);
      } finally {
        setSavingCodApl(null);
      }
    },
    [selecionado],
  );

  const onRegime = useCallback(async (node: AtivoNode, v: number | null) => {
    const anterior = node.regimeHorasDia;
    setSavingCodApl(node.codApl);
    setErroSalvar("");
    setTree((t) => updateRegime(t, node.codApl, v)); // otimista
    try {
      const res = await fetch(`/api/pcm/ativos/${node.codApl}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regimeHorasDia: v }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTree((t) => updateRegime(t, node.codApl, anterior)); // reverte
      setErroSalvar(`Não foi possível salvar o regime de "${node.tag}". Tente novamente.`);
    } finally {
      setSavingCodApl(null);
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Ativos"
        subtitle="Árvore de ativos da empresa. Cadastre, organize e classifique a criticidade (A, B ou C) de cada ativo."
        breadcrumbs={[{ label: "Manutenção" }, { label: "Ativos" }]}
        action={
          <Button onClick={() => novoAtivo()} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
            <Plus className="w-4 h-4" /> Novo ativo
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por TAG, nome ou localização…"
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={expandirTodos}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <ChevronsUpDown className="w-4 h-4" /> Expandir
          </button>
          <button
            type="button"
            onClick={recolherTodos}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <ChevronsDownUp className="w-4 h-4" /> Recolher
          </button>
        </div>
      </div>

      {/* Resumo + filtro por criticidade */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-2">
        <Chip active={filtro === "all"} onClick={() => setFiltro("all")}>
          Todos <span className="opacity-70">{resumo.total}</span>
        </Chip>
        <Chip active={filtro === "A"} onClick={() => setFiltro(filtro === "A" ? "all" : "A")}>
          <CriticidadeBadge value="A" /> {resumo.A}
        </Chip>
        <Chip active={filtro === "B"} onClick={() => setFiltro(filtro === "B" ? "all" : "B")}>
          <CriticidadeBadge value="B" /> {resumo.B}
        </Chip>
        <Chip active={filtro === "C"} onClick={() => setFiltro(filtro === "C" ? "all" : "C")}>
          <CriticidadeBadge value="C" /> {resumo.C}
        </Chip>
        <Chip active={filtro === "none"} onClick={() => setFiltro(filtro === "none" ? "all" : "none")}>
          Não classificado <span className="opacity-70">{resumo.none}</span>
        </Chip>
      </div>

      {erroSalvar && (
        <div className="mx-8 mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erroSalvar}
        </div>
      )}

      {/* Conteúdo: árvore + painel do ativo */}
      <div className="flex-1 min-h-0 flex gap-4 px-8 pb-8">
      <div className="flex-1 min-w-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando ativos…
          </div>
        ) : erroCarga ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-warning/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-foreground">{erroCarga}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <PackageSearch className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum ativo encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filtering ? "Ajuste a busca ou o filtro de criticidade." : "Cadastre o primeiro ativo em \"Novo ativo\"."}
            </p>
          </div>
        ) : (
          <DragCtx.Provider value={dnd}>
          {movido && (
            <div className="mb-2 flex items-center gap-2 text-xs bg-info/10 border border-info/30 rounded-lg px-3 py-2">
              <span className="flex-1">{movido.texto}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-info hover:underline"
                onClick={async () => { const m = movido; setMovido(null); await moverPara(m.node, m.paiAnteriorId); }}
              >
                <Undo2 className="w-3.5 h-3.5" /> Desfazer
              </button>
            </div>
          )}
          {arrastando && (
            <div
              onDragOver={(e) => { e.preventDefault(); setAlvo("__raiz__"); }}
              onDrop={(e) => { e.preventDefault(); dnd?.soltar(null); }}
              className={cn(
                "mb-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs text-center",
                alvo === "__raiz__" ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground",
              )}
            >
              Solte aqui para deixar <b>{arrastando.tag}</b> na raiz (sem pai)
            </div>
          )}
          {!dnd && !loading && filtering && (
            <p className="mb-2 text-[11px] text-muted-foreground">Limpe a busca e o filtro para mover ativos arrastando.</p>
          )}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {visible.map((node) => (
              <AtivoRow
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                forceOpen={filtering}
                savingCodApl={savingCodApl}
                selecionado={selecionado}
                onSelect={(n) => setSelecionado(n.codApl)}
                onClassify={onClassify}
                onRegime={onRegime}
              />
            ))}
          </div>
          </DragCtx.Provider>
        )}
      </div>
      {selecionado != null && (
        <aside className="w-full max-w-[440px] shrink-0 overflow-y-auto bg-card rounded-xl border border-border shadow-sm">
          <AtivoPainel
            codApl={selecionado}
            versao={versao}
            onFechar={() => setSelecionado(null)}
            onEditar={(a) => { setEditando(a); setPaiInicial(null); setFormAberto(true); }}
            onNovoFilho={(paiId) => novoAtivo(paiId)}
            onAlterado={load}
          />
        </aside>
      )}
      </div>

      <AtivoFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        editando={editando}
        paiInicial={paiInicial}
        tree={tree}
        lookups={lookups}
        onSalvo={aposSalvar}
      />
    </div>
  );
}
