"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
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
        out.push(n.taggru);
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
    !q || n.descricao.toLowerCase().includes(q) || n.tag.toLowerCase().includes(q);

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
  { v: "A", on: "bg-red-600 text-white border-red-600", off: "text-red-600 border-red-200 hover:bg-red-50" },
  { v: "B", on: "bg-amber-500 text-white border-amber-500", off: "text-amber-600 border-amber-200 hover:bg-amber-50" },
  { v: "C", on: "bg-emerald-600 text-white border-emerald-600", off: "text-emerald-600 border-emerald-200 hover:bg-emerald-50" },
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
            value === o.v ? o.on : `bg-white ${o.off}`,
          )}
        >
          {o.v}
        </button>
      ))}
      {saving && <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />}
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
    <select
      value={value ?? ""}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onPick(e.target.value === "" ? null : Number(e.target.value))}
      title="Regime de operação (horas/dia) — base do tempo de funcionamento no MTBF"
      className="shrink-0 rounded border border-gray-200 bg-white text-xs text-gray-600 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
    >
      <option value="">— 24h</option>
      {REGIMES.map((h) => (
        <option key={h} value={h}>
          {h}h/dia
        </option>
      ))}
    </select>
  );
}

// ── Linha da árvore ──────────────────────────────────────────────────────────
function AtivoRow({
  node,
  depth,
  expanded,
  toggle,
  forceOpen,
  savingCodApl,
  onClassify,
  onRegime,
}: {
  node: AtivoNode;
  depth: number;
  expanded: Set<string>;
  toggle: (taggru: string) => void;
  forceOpen: boolean;
  savingCodApl: number | null;
  onClassify: (node: AtivoNode, v: Crit | null) => void;
  onRegime: (node: AtivoNode, v: number | null) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = forceOpen || expanded.has(node.taggru);
  const indent = 8 + depth * 18;
  const Icon = hasChildren ? Layers : Cpu;

  return (
    <div>
      <div
        className="flex items-center gap-2 pr-3 py-1.5 border-b border-gray-50 hover:bg-gray-50"
        style={{ paddingLeft: indent }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.taggru)}
            className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Icon
          className={cn("w-4 h-4 shrink-0", hasChildren ? "text-indigo-400" : "text-gray-400")}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn("text-sm truncate", hasChildren ? "font-medium text-gray-800" : "text-gray-700")}
            title={node.descricao}
          >
            {node.descricao}
          </p>
          <p className="text-[11px] text-gray-400 font-mono truncate">{node.tag}</p>
        </div>
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
            key={c.taggru}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            forceOpen={forceOpen}
            savingCodApl={savingCodApl}
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
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
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
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [savingCodApl, setSavingCodApl] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErroCarga(null);
    try {
      const res = await fetch("/api/pcm/ativos");
      if (res.status === 503) {
        setErroCarga("Engeman indisponível no momento. Tente novamente.");
        setTree([]);
        return;
      }
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resumo = useMemo(() => computeResumo(tree), [tree]);

  const filtering = busca.trim() !== "" || filtro !== "all";
  const visible = useMemo(
    () => (filtering ? filterTree(tree, busca.trim().toLowerCase(), filtro) : tree),
    [tree, busca, filtro, filtering],
  );

  const toggle = useCallback((taggru: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(taggru)) n.delete(taggru);
      else n.add(taggru);
      return n;
    });
  }, []);

  function expandirTodos() {
    setExpanded(new Set(allGroupTaggrus(tree)));
  }
  function recolherTodos() {
    setExpanded(new Set());
  }

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
          body: JSON.stringify({ criticidade: v, tag: node.tag, descricao: node.descricao }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setTree((t) => updateCrit(t, node.codApl, anterior)); // reverte
        setErroSalvar(`Não foi possível salvar a criticidade de "${node.tag}". Tente novamente.`);
      } finally {
        setSavingCodApl(null);
      }
    },
    [],
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
        subtitle="Árvore de ativos da empresa (Engeman). Classifique a criticidade de cada ativo em A, B ou C."
        breadcrumbs={[{ label: "PCM" }, { label: "Ativos" }]}
      />

      {/* Toolbar */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por TAG ou descrição…"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={expandirTodos}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <ChevronsUpDown className="w-4 h-4" /> Expandir
          </button>
          <button
            type="button"
            onClick={recolherTodos}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
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
        <div className="mx-8 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erroSalvar}
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando ativos…
          </div>
        ) : erroCarga ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">{erroCarga}</p>
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
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <PackageSearch className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">Nenhum ativo encontrado</p>
            <p className="text-xs text-gray-400 mt-1">
              {filtering ? "Ajuste a busca ou o filtro de criticidade." : "Nenhum ativo ativo no Engeman."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
            {visible.map((node) => (
              <AtivoRow
                key={node.taggru}
                node={node}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                forceOpen={filtering}
                savingCodApl={savingCodApl}
                onClassify={onClassify}
                onRegime={onRegime}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
