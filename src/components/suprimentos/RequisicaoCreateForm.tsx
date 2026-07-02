"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, Loader2, Save, ChevronDown, X, UserPlus, Warehouse } from "lucide-react";
import { CATEGORIA_ESTOQUE_ICONS, CATEGORIA_ESTOQUE_CORES } from "@/lib/categoria-estoque-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { cn } from "@/lib/utils";
import { rotearDestinoRequisicao } from "@/lib/pcp/rotear-requisicao";
import { LOCAL_EMBALAGEM_PRODUCAO_NOME } from "@/lib/locais-producao";

const DESTINOS = [
  { value: "", label: "Automático" },
  { value: "PEP_MD", label: "PEP-MD (material direto)" },
  { value: "CIF", label: "CIF (indireto fabril)" },
  { value: "IMOBILIZADO", label: "Imobilizado" },
  { value: "DESPESA", label: "Despesa" },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

type LocalEstoqueOpt = { id: string; nome: string; categoriasAceitas?: string[] };

// Ícone do almoxarifado: usa o ícone da categoria que ele aceita (1ª da lista);
// sem categoria definida → ícone genérico de almoxarifado.
function iconeLocal(l: LocalEstoqueOpt): ReactNode {
  const cat = l.categoriasAceitas?.[0] as keyof typeof CATEGORIA_ESTOQUE_ICONS | undefined;
  if (cat && CATEGORIA_ESTOQUE_ICONS[cat]) {
    const Icon = CATEGORIA_ESTOQUE_ICONS[cat];
    return <Icon className={cn("w-4 h-4", CATEGORIA_ESTOQUE_CORES[cat])} />;
  }
  return <Warehouse className="w-4 h-4 text-muted-foreground" />;
}
type ColaboradorOpt  = { id: string; nome: string; setorId: string | null };
type SetorOpt        = { id: string; nome: string };
type CentroCustoOpt  = { id: string; codigo: string; nome: string; fabril?: boolean; grupoCentroCusto?: { id: string; nome: string } | null };
type TesOpt          = { id: string; codigo: string; nome: string; sentido: string; estocavel: boolean; compoeCusto: boolean; permiteCapitalizar: boolean; centroCustoSugeridoId: string | null; ativo: boolean };
type ItemOpt         = { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null; fabril?: boolean; capitaliza?: boolean; categoriaEstoque?: string | null; compoeCusto?: boolean; naturezaPadraoId?: string | null };

type ItemRow = {
  _key:         string;
  itemId:       string;
  quantidade:   string;
  unidade:      string;
  unidadeId:    string; // unidade escolhida (das cadastradas no produto)
  localizacao:  string;
  centroCustoId: string;
  naturezaFinanceiraId: string;
  destinoManual: string; // escape explícito (PEP_MD/IMOBILIZADO/CIF/DESPESA) ou "" = auto
  tesId:        string; // TES (preset de comportamento) escolhido na linha; preenche as flags
  compoeCusto:  boolean | null; // preenchido pelo TES (null = herda item.compoeCusto)
  capitaliza:   boolean; // marcado = capex nesta linha (vence item); exige o bem
  imobilizadoId: string; // bem que recebe o valor (obrigatório quando capitaliza)
  componenteSubstituidoId: string; // peça velha a dar baixa numa troca (opcional)
  os:           string;
  requisicaoRef: string;
};

// Unidade cadastrada do produto. `fator` = quantas unidades-base equivalem a 1
// desta unidade (principal = 1). Ex.: 1 CX = 12 UN → fator 12.
type UnidadeOpt = { unidadeId: string; sigla: string; nome: string; isPrincipal: boolean; fator: number };

function emptyRow(): ItemRow {
  return {
    _key:         Math.random().toString(36).slice(2),
    itemId:       "",
    quantidade:   "",
    unidade:      "",
    unidadeId:    "",
    localizacao:  "",
    centroCustoId: "",
    naturezaFinanceiraId: "",
    destinoManual: "",
    tesId:        "",
    compoeCusto:  null,
    capitaliza:   false,
    imobilizadoId: "",
    componenteSubstituidoId: "",
    os:           "",
    requisicaoRef: "",
  };
}

// ── Portal Select (Searchable) ────────────────────────────────────────────────

function PortalSelect<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, error, getIcon,
}: {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  getLabel: (item: T) => string;
  error?: boolean;
  getIcon?: (item: T) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = query.trim()
    ? options.filter((o) => getLabel(o).toLowerCase().includes(query.toLowerCase()))
    : options;

  function calcPos() {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  function openDrop() { calcPos(); setQuery(""); setOpen(true); }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div className={cn(
        "flex items-center rounded-lg border bg-card transition-colors",
        open ? "border-blue-400 ring-1 ring-blue-200"
          : error && !value ? "border-red-400 ring-1 ring-red-100"
          : "border-border hover:border-border"
      )}>
        {getIcon && selected && !open && <span className="pl-3 shrink-0 flex items-center">{getIcon(selected)}</span>}
        <input
          type="text"
          value={open ? query : (selected ? getLabel(selected) : "")}
          onChange={(e) => { setQuery(e.target.value); if (!open) openDrop(); }}
          onFocus={openDrop}
          placeholder={placeholder}
          className={cn("flex-1 py-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground", getIcon && selected && !open ? "pl-2" : "pl-3")}
        />
        {value && !open && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); setOpen(false); }} className="px-1.5 text-muted-foreground/60 hover:text-muted-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 mr-2 transition-transform", open && "rotate-180")} />
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-auto max-h-56"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {filtered.length > 0 ? filtered.map((o) => (
            <button key={o.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setOpen(false); setQuery(""); }}
              className={cn("w-full px-3 py-2 text-sm text-left hover:bg-info/10 hover:text-info transition-colors flex items-center gap-2",
                o.id === value && "bg-info/10 text-info font-medium")}>
              {getIcon && <span className="shrink-0 flex items-center">{getIcon(o)}</span>}
              <span className="truncate">{getLabel(o)}</span>
            </button>
          )) : (
            <p className="px-3 py-2.5 text-sm text-muted-foreground italic">
              {query ? `Nenhum resultado para "${query}"` : "Nenhuma opção"}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Natureza Select (agrupado por grupo + busca) ──────────────────────────────

type NaturezaOpt = { id: string; nome: string; cif?: boolean; grupo?: string; destinoSugerido?: string | null };

const GRUPO_NAT_LABEL: Record<string, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_OPERACIONAL:   "Custos operacionais",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  INVESTIMENTO:        "Atividades de investimento",
  FINANCIAMENTO:       "Atividades de financiamento",
};
const GRUPO_NAT_ORDER: Record<string, number> = {
  RECEITA_OPERACIONAL: 0, CUSTO_OPERACIONAL: 1, DESPESA_OPERACIONAL: 2, INVESTIMENTO: 3, FINANCIAMENTO: 4,
};

// Opção genérica de um seletor AGRUPADO + busca. `group` é o rótulo da seção;
// `order` ordena as seções (menor primeiro); `badge` é um sufixo opcional (ex.: CIF).
type GroupedOpt = { id: string; label: string; badge?: string | null; group: string; order?: number };

function GroupedSelect({
  options, value, onChange, placeholder, error, compact, vazio = "Nenhuma opção",
}: {
  options: GroupedOpt[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: boolean;
  compact?: boolean;
  vazio?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Agrupa por seção; ordena pela `order` (menor da seção) e depois pelo nome.
  const grupos = (() => {
    const m = new Map<string, { opts: GroupedOpt[]; order: number }>();
    for (const o of filtered) {
      const cur = m.get(o.group) ?? { opts: [], order: o.order ?? 99 };
      cur.opts.push(o);
      cur.order = Math.min(cur.order, o.order ?? 99);
      m.set(o.group, cur);
    }
    return Array.from(m.entries()).sort((a, b) => (a[1].order - b[1].order) || a[0].localeCompare(b[0]));
  })();

  function calcPos() {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    // Painel mais largo que a célula (os rótulos "código — nome" são longos),
    // travado dentro da viewport para não vazar pela direita.
    const width = Math.max(r.width, compact ? 340 : 280);
    const maxLeft = window.innerWidth - width - 8;
    const left = Math.min(r.left, Math.max(8, maxLeft));
    setPos({ top: r.bottom + 4, left, width });
  }
  function openDrop() { calcPos(); setQuery(""); setOpen(true); }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div className={cn(
        "flex items-center rounded-md border bg-card transition-colors",
        compact ? "rounded-md" : "rounded-lg",
        open ? "border-blue-400 ring-1 ring-blue-200"
          : error && !value ? "border-red-400 ring-1 ring-red-100"
          : "border-border hover:border-border"
      )}>
        <input
          type="text"
          value={open ? query : (selected ? `${selected.label}${selected.badge ? ` ${selected.badge}` : ""}` : "")}
          onChange={(e) => { setQuery(e.target.value); if (!open) openDrop(); }}
          onFocus={openDrop}
          placeholder={placeholder}
          className={cn(
            "flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-foreground min-w-0",
            compact ? "px-2 py-1.5 text-xs h-8" : "px-3 py-2 text-sm",
          )}
        />
        {value && !open && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); setOpen(false); }} className="px-1.5 text-muted-foreground/60 hover:text-muted-foreground">
            <X className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
          </button>
        )}
        <ChevronDown className={cn("text-muted-foreground shrink-0 mr-2 transition-transform", compact ? "w-3.5 h-3.5" : "w-4 h-4", open && "rotate-180")} />
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-auto max-h-80"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {grupos.length > 0 ? grupos.map(([g, { opts }]) => (
            <div key={g}>
              <div className="px-3 py-1.5 bg-muted text-[10px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 z-10 border-b border-border shadow-sm">
                {g}
              </div>
              {opts.map((o) => (
                <button key={o.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setOpen(false); setQuery(""); }}
                  className={cn("w-full px-3 py-2 text-sm text-left hover:bg-info/10 hover:text-info transition-colors flex items-center gap-1.5",
                    o.id === value && "bg-info/10 text-info font-medium")}>
                  <span className="truncate">{o.label}</span>
                  {o.badge && <span className="text-[10px] text-violet-600 dark:text-violet-400 shrink-0">{o.badge}</span>}
                </button>
              ))}
            </div>
          )) : (
            <p className="px-3 py-2.5 text-sm text-muted-foreground italic">
              {query ? `Nenhum resultado para "${query}"` : vazio}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// Constrói as opções agrupadas de NATUREZA (por grupo do fluxo de caixa).
function naturezaOpts(naturezas: NaturezaOpt[]): GroupedOpt[] {
  return naturezas.map((n) => ({
    id: n.id, label: n.nome, badge: n.cif ? "· CIF" : null,
    group: GRUPO_NAT_LABEL[n.grupo ?? ""] ?? "Outros",
    order: GRUPO_NAT_ORDER[n.grupo ?? ""] ?? 99,
  }));
}

// Constrói as opções agrupadas de CENTRO DE CUSTO (por grupo de centro de custo).
function centroOpts(centros: CentroCustoOpt[]): GroupedOpt[] {
  return centros.map((c) => ({
    id: c.id, label: `${c.codigo} — ${c.nome}`,
    group: c.grupoCentroCusto?.nome ?? "Sem grupo",
    order: c.grupoCentroCusto ? 0 : 1, // "Sem grupo" por último
  }));
}

// ── Item search dropdown (portal) ─────────────────────────────────────────────

function ItemSearchCell({
  row, itensCat, onSelect, localSelecionado, onBlocked, saldoDe,
}: {
  row: ItemRow;
  itensCat: ItemOpt[];
  onSelect: (key: string, itemId: string, sigla: string) => void;
  localSelecionado: boolean;
  onBlocked: () => void;
  saldoDe?: (itemId: string) => number | null;
}) {
  const fmtSaldo = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const selected = row.itemId ? itensCat.find((i) => i.id === row.itemId) : null;

  function calcPos() {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 360) });
  }

  const filtered = (query.trim()
    ? itensCat.filter((i) =>
        i.codigo.toLowerCase().includes(query.toLowerCase()) ||
        i.descricao.toLowerCase().includes(query.toLowerCase())
      )
    : itensCat
  ).slice(0, 50);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest(".item-search-wrap")?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", calcPos, true);
    return () => { document.removeEventListener("mousedown", handler); window.removeEventListener("scroll", calcPos, true); };
  }, [open]);

  return (
    <div className="item-search-wrap relative">
      <div className={cn(
        "flex items-center rounded-md border transition-colors bg-card",
        open ? "border-blue-400 ring-1 ring-blue-200" : "border-border hover:border-border"
      )}>
        <input
          ref={inputRef}
          value={open ? query : (selected ? `${selected.codigo} — ${selected.descricao}` : "")}
          onChange={(e) => {
            if (!localSelecionado) { onBlocked(); return; }
            setQuery(e.target.value);
            if (row.itemId && e.target.value !== `${selected?.codigo} — ${selected?.descricao}`) {
              onSelect(row._key, "", "");
            }
            calcPos();
            setOpen(true);
          }}
          onFocus={() => { if (!localSelecionado) { onBlocked(); inputRef.current?.blur(); return; } setQuery(""); calcPos(); setOpen(true); }}
          placeholder={localSelecionado ? "Buscar produto por código ou descrição..." : "Selecione o almoxarifado primeiro..."}
          className="flex-1 px-2 py-1.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground text-foreground h-8"
        />
        {row.itemId && !open && (
          <button
            type="button"
            onClick={() => { onSelect(row._key, "", ""); setQuery(""); }}
            className="px-1.5 text-muted-foreground/60 hover:text-muted-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {/* Header */}
          <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Cadastro de Produtos
            </span>
            <span className="text-[10px] text-muted-foreground">{filtered.length} encontrado{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-auto max-h-48">
            {filtered.length > 0 ? filtered.map((it) => (
              <button key={it.id} type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(row._key, it.id, it.unidade?.sigla ?? it.unidadeMedida ?? "");
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-info/10 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0",
                  it.id === row.itemId && "bg-info/10"
                )}>
                <span className="font-mono text-[11px] font-semibold text-info shrink-0 w-[72px] truncate">{it.codigo}</span>
                <span className="text-xs text-foreground font-medium truncate flex-1">{it.descricao}</span>
                {(() => {
                  const saldo = saldoDe?.(it.id);
                  if (saldo == null) return null;
                  const zerado = saldo <= 0;
                  return (
                    <span className={cn("text-[10px] shrink-0 font-medium px-1.5 py-0.5 rounded tabular-nums",
                      zerado ? "bg-danger/15 text-danger" : "bg-success/15 text-success")}
                      title={zerado ? "Estoque zerado — não é possível lançar" : "Saldo disponível no local"}>
                      {fmtSaldo(saldo)} {it.unidade?.sigla || it.unidadeMedida}
                    </span>
                  );
                })()}
                {saldoDe == null && (it.unidade?.sigla || it.unidadeMedida) && (
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{it.unidade?.sigla || it.unidadeMedida}</span>
                )}
              </button>
            )) : (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground italic mb-2">
                  {query ? `Nenhum produto encontrado para "${query}"` : "Nenhum produto cadastrado"}
                </p>
                <a
                  href="/suprimentos/produtos/novo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-info hover:text-info font-medium"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Plus className="w-3 h-3" /> Cadastrar novo produto
                </a>
              </div>
            )}
          </div>
          {/* Footer link */}
          <div className="px-3 py-2 bg-muted border-t border-border">
            <a
              href="/suprimentos/produtos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-info transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
            >
              Ver todos os produtos →
            </a>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Colaborador Quick-Create Modal ────────────────────────────────────────────

function ColaboradorQuickModal({
  initialValue,
  setores,
  onCreated,
  onClose,
}: {
  initialValue: string;
  setores: SetorOpt[];
  onCreated: (id: string, label: string) => void;
  onClose: () => void;
}) {
  const [nome,    setNome]    = useState(initialValue);
  const [cargo,   setCargo]   = useState("");
  const [setorId, setSetorId] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  async function handleSave() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/empresa/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome:    nome.trim(),
          cargo:   cargo.trim()   || null,
          setorId: setorId        || null,
          ativo:   true,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Erro ao criar colaborador");
        setSaving(false);
        return;
      }
      const colaborador = await res.json();
      onCreated(colaborador.id, colaborador.nome);
    } catch {
      setError("Erro inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal card */}
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-info/10 rounded-lg">
              <UserPlus className="w-4 h-4 text-info" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">Novo Colaborador</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Nome <span className="text-red-500">*</span></Label>
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Nome completo"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cargo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Ex.: Técnico de Manutenção"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Setor <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <ComboboxWithCreate
              value={setorId}
              onChange={setSetorId}
              placeholder="— Selecionar setor —"
              noneLabel="Selecionar setor"
              triggerClassName="h-9 rounded-md"
              options={setores.map((s) => ({ value: s.id, label: s.nome }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !nome.trim()}>
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
              : <><Plus className="w-3.5 h-3.5 mr-1.5" />Criar Colaborador</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RequisicaoCreateForm() {
  const voltar       = useVoltarCriacao("/suprimentos/requisicoes-materiais");
  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "requisição",
    gender: "f",
    onNew: () => { window.location.href = "/suprimentos/requisicoes-materiais/nova"; },
    viewHref: (id) => `/suprimentos/requisicoes-materiais/${id}`,
  });
  const searchParams = useSearchParams();

  const [tipo,           setTipo]           = useState<"REQUISICAO" | "DEVOLUCAO">("REQUISICAO");
  const [localEstoqueId, setLocalEstoqueId] = useState(searchParams.get("localEstoqueId") ?? "");
  // Local de DESTINO (opcional): preenchido = liberação/transferência p/ outro local
  // (ex.: embalagem do almoxarifado p/ a produção). Sem destino = consumo normal.
  const [localDestinoId, setLocalDestinoId] = useState(searchParams.get("localDestinoId") ?? "");
  const [colaboradorId,  setColaboradorId]  = useState("");
  const [setorId,        setSetorId]        = useState("");
  const [almoxarifeId,   setAlmoxarifeId]   = useState("");
  // Data de hoje no fuso do USUÁRIO (toISOString seria UTC: depois das ~21h
  // no Brasil já viraria o dia seguinte e o formulário nasceria com data errada)
  const [data,           setData]           = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [os,             setOs]             = useState("");
  const [centroCustoId,  setCentroCustoId]  = useState("");
  const [naturezaFinanceiraId, setNaturezaFinanceiraId] = useState("");
  const [observacoes,    setObservacoes]    = useState("");
  const [rows,           setRows]           = useState<ItemRow[]>([emptyRow()]);

  const [locais,        setLocais]        = useState<LocalEstoqueOpt[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [setores,       setSetores]       = useState<SetorOpt[]>([]);
  const [centros,       setCentros]       = useState<CentroCustoOpt[]>([]);
  const [naturezas,     setNaturezas]     = useState<NaturezaOpt[]>([]);
  const [itensCat,      setItensCat]      = useState<ItemOpt[]>([]);
  const [imobilizados,  setImobilizados]  = useState<{ id: string; descricao: string }[]>([]);
  const [tesList,       setTesList]       = useState<TesOpt[]>([]);
  // Unidades cadastradas por produto (para limitar o seletor e converter à base).
  const [itemUnidades,  setItemUnidades]  = useState<Map<string, UnidadeOpt[]>>(new Map());
  // Itens do local selecionado → saldo atual (inclui saldo zero). Requisição só
  // lista o que está cadastrado no local; saldo 0 aparece mas não pode lançar.
  // null = ainda não carregado / sem restrição (devolução).
  const [itensNoLocal,  setItensNoLocal]  = useState<Map<string, number> | null>(null);
  const [avisoLocal,    setAvisoLocal]    = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadOptions = useCallback(async () => {
    // fetch each independently so one failure doesn't block the others
    async function safeFetch(url: string) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    }

    const [lData, cData, sData, ccData, itData, nData] = await Promise.all([
      safeFetch("/api/suprimentos/locais-estoque?ativo=true"),
      safeFetch("/api/empresa/colaboradores?ativo=true"),
      safeFetch("/api/empresa/setores?ativo=true"),
      safeFetch("/api/empresa/centros-custo?ativo=true"),
      safeFetch("/api/suprimentos/produtos"),
      safeFetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1&requisitaveis=1"),
    ]);
    const imData = await safeFetch("/api/contabilidade/imobilizado");
    if (imData != null) setImobilizados(Array.isArray(imData) ? imData : imData.data ?? []);
    const tData = await safeFetch("/api/suprimentos/tipos-operacao");
    if (tData != null) setTesList((Array.isArray(tData) ? tData : tData.data ?? []).filter((t: TesOpt) => t.ativo !== false));

    if (lData  != null) setLocais(       Array.isArray(lData)  ? lData  : lData.data  ?? []);
    if (cData  != null) setColaboradores(Array.isArray(cData)  ? cData  : cData.data  ?? []);
    if (sData  != null) setSetores(      Array.isArray(sData)  ? sData  : sData.data  ?? []);
    if (ccData != null) setCentros(      Array.isArray(ccData) ? ccData : ccData.data ?? []);
    if (itData != null) setItensCat(     Array.isArray(itData) ? itData : itData.data ?? []);
    if (nData  != null) setNaturezas(    Array.isArray(nData)  ? nData  : nData.data  ?? []);
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Ao escolher o almoxarifado (requisição): carrega os itens do local (com saldo)
  // e limpa linhas cujo produto não exista no novo local. Devolução não restringe.
  useEffect(() => {
    if (tipo !== "REQUISICAO" || !localEstoqueId) { setItensNoLocal(null); return; }
    let cancel = false;
    fetch(`/api/suprimentos/locais-estoque/${localEstoqueId}/itens`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const map = new Map<string, number>();
        for (const it of (Array.isArray(j?.itens) ? j.itens : [])) map.set(it.itemId, Number(it.saldo) || 0);
        setItensNoLocal(map);
        setRows((prev) => prev.map((r) => (r.itemId && !map.has(r.itemId)) ? { ...r, itemId: "", unidade: "", unidadeId: "" } : r));
      })
      .catch(() => { if (!cancel) setItensNoLocal(new Map()); });
    return () => { cancel = true; };
  }, [localEstoqueId, tipo]);

  // Itens oferecidos na busca: requisição → todos os do local (com saldo); devolução → catálogo todo.
  const itensDisponiveis = tipo !== "REQUISICAO"
    ? itensCat
    : (localEstoqueId ? (itensNoLocal ? itensCat.filter((i) => itensNoLocal.has(i.id)) : []) : []);
  const saldoDoItem = (itemId: string): number | null => itensNoLocal?.get(itemId) ?? null;

  function avisarLocal() {
    setAvisoLocal("Selecione primeiro o almoxarifado para escolher os produtos.");
    setTimeout(() => setAvisoLocal(""), 4000);
  }

  function handleColaboradorChange(id: string) {
    setColaboradorId(id);
    const col = colaboradores.find((c) => c.id === id);
    if (col?.setorId) setSetorId(col.setorId);
    else if (!id) setSetorId("");
  }

  // Busca (e cacheia) as unidades cadastradas do produto.
  const fetchUnidades = useCallback(async (itemId: string): Promise<UnidadeOpt[]> => {
    if (itemUnidades.has(itemId)) return itemUnidades.get(itemId)!;
    try {
      const res = await fetch(`/api/suprimentos/produtos/${itemId}/unidades`);
      const json = await res.json();
      const list: UnidadeOpt[] = Array.isArray(json)
        ? json.map((u: { unidade: { id: string; sigla: string; nome: string }; isPrincipal: boolean; fatorConversao: unknown }) => ({
            unidadeId: u.unidade.id, sigla: u.unidade.sigla, nome: u.unidade.nome,
            isPrincipal: u.isPrincipal, fator: u.isPrincipal ? 1 : (Number(u.fatorConversao) || 1),
          }))
        : [];
      setItemUnidades((prev) => new Map(prev).set(itemId, list));
      return list;
    } catch { return []; }
  }, [itemUnidades]);

  function handleItemSelect(key: string, itemId: string, _sigla: string) {
    // Zera a unidade ao trocar de produto; carrega as unidades do cadastro e
    // assume a principal por padrão (a conversão usa o fator de cada unidade).
    // Natureza por precedência: (a) override da linha › (b) natureza-padrão do item
    // › (c) cabeçalho "aplica a todos".
    const it = itensCat.find((i) => i.id === itemId);
    setRows((prev) => prev.map((r) => r._key === key
      ? { ...r, itemId, unidade: "", unidadeId: "",
          naturezaFinanceiraId: r.naturezaFinanceiraId || it?.naturezaPadraoId || naturezaFinanceiraId || "" }
      : r));
    if (!itemId) return;
    fetchUnidades(itemId).then((list) => {
      const principal = list.find((u) => u.isPrincipal) ?? list[0];
      if (!principal) return;
      setRows((prev) => prev.map((r) => (r._key === key && r.itemId === itemId)
        ? { ...r, unidade: principal.sigla, unidadeId: principal.unidadeId } : r));
    });
  }

  function updateRowUnidade(key: string, u: UnidadeOpt) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, unidade: u.sigla, unidadeId: u.unidadeId } : r));
  }

  function updateRow(key: string, field: keyof ItemRow, value: string | boolean) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, [field]: value } : r));
  }
  // Escolher o TES preenche as flags da linha a partir do preset (ainda editáveis).
  // O TES NÃO decide destino — só alimenta a precedência (centro, compoeCusto,
  // habilita capitaliza). permiteCapitalizar=false bloqueia o degrau capitaliza.
  function applyTes(key: string, tesId: string) {
    const tes = tesList.find((t) => t.id === tesId);
    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const next: ItemRow = { ...r, tesId };
      if (tes) {
        next.compoeCusto = tes.compoeCusto;
        if (tes.centroCustoSugeridoId) next.centroCustoId = tes.centroCustoSugeridoId;
        if (!tes.permiteCapitalizar) { next.capitaliza = false; next.imobilizadoId = ""; next.componenteSubstituidoId = ""; }
      } else {
        next.compoeCusto = null;
      }
      return next;
    }));
  }

  async function handleSave(statusFinal: "RASCUNHO" | "ABERTA") {
    setSubmitted(true);
    if (!localEstoqueId) { setSaveError("Almoxarifado é obrigatório"); return; }
    const validRows = rows.filter((r) => r.itemId && r.quantidade);
    if (validRows.length === 0) { setSaveError("Adicione pelo menos um item"); return; }
    // Natureza é obrigatória POR ITEM (o cabeçalho "aplica a todos" preenche as linhas).
    // Liberação/transferência (com destino) não consome → dispensa natureza/centro.
    if (tipo === "REQUISICAO" && !localDestinoId) {
      const semNat = validRows.filter((r) => !(r.naturezaFinanceiraId || naturezaFinanceiraId));
      if (semNat.length > 0) {
        const cods = semNat.map((r) => itensCat.find((i) => i.id === r.itemId)?.codigo ?? r.itemId).join(", ");
        setSaveError(`Natureza financeira é obrigatória em cada item: ${cods}. Informe no cabeçalho (aplica a todos) ou na linha.`);
        return;
      }
    }
    // Centro de custo obrigatório por item (cabeçalho "aplica a todos" preenche as linhas).
    if (tipo === "REQUISICAO" && !localDestinoId) {
      const semCentro = validRows.filter((r) => !(r.centroCustoId || centroCustoId));
      if (semCentro.length > 0) {
        const cods = semCentro.map((r) => itensCat.find((i) => i.id === r.itemId)?.codigo ?? r.itemId).join(", ");
        setSaveError(`Centro de custo é obrigatório em cada item: ${cods}. Informe no cabeçalho (aplica a todos) ou na linha.`);
        return;
      }
    }
    // Capex: linha que capitaliza exige o bem (imobilizado_id). Não posta sem o bem.
    const semBem = validRows.filter((r) => r.capitaliza && !r.imobilizadoId);
    if (semBem.length > 0) {
      const cods = semBem.map((r) => itensCat.find((i) => i.id === r.itemId)?.codigo ?? r.itemId).join(", ");
      setSaveError(`Item que capitaliza exige o bem (imobilizado): ${cods}.`);
      return;
    }
    // Saída só de itens COM saldo: estoque zerado/negativo não pode ser lançado.
    if (tipo === "REQUISICAO" && itensNoLocal) {
      const zerados = validRows.filter((r) => (saldoDoItem(r.itemId) ?? 0) <= 0);
      if (zerados.length > 0) {
        const cods = zerados.map((r) => itensCat.find((i) => i.id === r.itemId)?.codigo ?? r.itemId).join(", ");
        setSaveError(`Não é possível lançar — estoque zerado em: ${cods}. Faça a entrada/ajuste do saldo antes de requisitar.`);
        return;
      }
    }
    setSaving(true); setSaveError("");
    try {
      const res = await fetch("/api/suprimentos/requisicoes-materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, localEstoqueId,
          localDestinoId: localDestinoId || null,
          colaboradorId:  colaboradorId  || null,
          setorId:        setorId        || null,
          almoxarifeId:   almoxarifeId   || null,
          os:             os             || null,
          centroCustoId:  centroCustoId  || null,
          naturezaFinanceiraId: naturezaFinanceiraId || null,
          data, observacoes: observacoes || null,
          itens: validRows.map((r) => {
            // Converte a quantidade para a unidade-BASE do produto (estoque/custo
            // são sempre na base). Ex.: 2 CX × fator 12 = 24 UN.
            const list = itemUnidades.get(r.itemId) ?? [];
            const sel  = list.find((u) => u.unidadeId === r.unidadeId);
            const base = list.find((u) => u.isPrincipal) ?? list[0];
            const fator = sel?.fator ?? 1;
            return {
              itemId: r.itemId,
              quantidade: parseFloat(r.quantidade) * fator,
              unidade: (base?.sigla ?? r.unidade) || null,
              localizacao: r.localizacao || null,
              centroCustoId: r.centroCustoId || null,
              naturezaFinanceiraId: r.naturezaFinanceiraId || null,
              destinoManual: r.destinoManual || null,
              tesId: r.tesId || null,
              compoeCusto: r.compoeCusto,
              capitaliza: r.capitaliza ? true : null,
              imobilizadoId: r.capitaliza ? (r.imobilizadoId || null) : null,
              componenteSubstituidoId: r.capitaliza ? (r.componenteSubstituidoId || null) : null,
              os: r.os || null, requisicaoRef: r.requisicaoRef || null,
            };
          }),
        }),
      });
      if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
      const { data: created } = await res.json();
      if (statusFinal === "ABERTA") {
        await fetch(`/api/suprimentos/requisicoes-materiais/${created.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ABERTA" }),
        });
      }
      confirmCreated(created.id);
    } catch (e) { setSaveError(String(e)); setSaving(false); }
  }

  return (
    <div>
      <div className="space-y-5 max-w-5xl">

        {saveError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{saveError}</div>
        )}
        {avisoLocal && (
          <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg text-sm">{avisoLocal}</div>
        )}

        {/* Type toggle */}
        <div className="flex items-center gap-2">
          {(["REQUISICAO", "DEVOLUCAO"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                tipo === t ? "bg-blue-600 text-white border-blue-600" : "bg-card text-muted-foreground border-border hover:border-border"
              )}>
              {t === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais"}
            </button>
          ))}
        </div>

        {/* Header card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {tipo === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="grid grid-cols-3 gap-4">
              {/* Almoxarifado */}
              <div className="space-y-1.5">
                <Label>Almoxarifado <span className="text-red-500">*</span></Label>
                <PortalSelect
                  options={locais}
                  value={localEstoqueId}
                  onChange={setLocalEstoqueId}
                  placeholder="Selecionar almoxarifado..."
                  getLabel={(l) => l.nome}
                  getIcon={iconeLocal}
                  error={submitted}
                />
                {submitted && !localEstoqueId && <p className="text-xs text-red-500">Almoxarifado é obrigatório</p>}
              </div>

              {/* Liberar para (transferência) — opcional. Preenchido = atender MOVE os
                  itens p/ este local (ex.: embalagem → produção), não dá baixa/consumo. */}
              {tipo === "REQUISICAO" && (
                <div className="space-y-1.5">
                  <Label>Liberar para <span className="text-muted-foreground font-normal text-xs">(transferência)</span></Label>
                  {/* Único destino de transferência válido é a embalagem da produção;
                      qualquer outro local é consumo (não liberação). */}
                  <PortalSelect
                    options={locais.filter((l) => l.nome === LOCAL_EMBALAGEM_PRODUCAO_NOME && l.id !== localEstoqueId)}
                    value={localDestinoId}
                    onChange={setLocalDestinoId}
                    placeholder="Consumo (sem liberação)"
                    getLabel={(l) => l.nome}
                    getIcon={iconeLocal}
                  />
                </div>
              )}

              {/* Solicitante */}
              <div className="space-y-1.5">
                <Label>Solicitante</Label>
                <ComboboxWithCreate
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))}
                  value={colaboradorId}
                  onChange={handleColaboradorChange}
                  placeholder="Buscar colaborador..."
                  allowNone
                  createLabel="colaborador"
                  renderCreateModal={({ initialValue, onCreated, onClose }) => (
                    <ColaboradorQuickModal
                      initialValue={initialValue}
                      setores={setores}
                      onCreated={(id, label) => {
                        // Add to local list so Almoxarife dropdown also shows the new person
                        setColaboradores((prev) => [...prev, { id, nome: label, setorId: null }]);
                        onCreated(id, label);
                      }}
                      onClose={onClose}
                    />
                  )}
                />
              </div>

              {/* Setor */}
              <div className="space-y-1.5">
                <Label>Setor</Label>
                <PortalSelect
                  options={setores}
                  value={setorId}
                  onChange={setSetorId}
                  placeholder="Selecionar setor..."
                  getLabel={(s) => s.nome}
                />
              </div>

              {/* Almoxarife */}
              <div className="space-y-1.5">
                <Label>Almoxarife</Label>
                <PortalSelect
                  options={colaboradores}
                  value={almoxarifeId}
                  onChange={setAlmoxarifeId}
                  placeholder="Selecionar almoxarife..."
                  getLabel={(c) => c.nome}
                />
              </div>

              {/* Data */}
              <div className="space-y-1.5">
                <Label>Data <span className="text-red-500">*</span></Label>
                <DatePicker value={data} onChange={(v) => setData(v)} />
              </div>

              {/* O.S. (Requisição only) */}
              {tipo === "REQUISICAO" && (
                <div className="space-y-1.5">
                  <Label>O.S.</Label>
                  <Input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Ordem de serviço" />
                </div>
              )}
            </div>

            {/* Centro de Custo + Natureza — atalho que APLICA A TODOS os itens (o
                valor gravado é por item; pode ajustar linha a linha na tabela).
                Transferência (liberação) não consome → some. */}
            {tipo === "REQUISICAO" && !localDestinoId && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Centro de Custo <span className="text-muted-foreground font-normal text-xs">(aplica a todos os itens)</span></Label>
                  <GroupedSelect
                    options={centroOpts(centros)}
                    value={centroCustoId}
                    onChange={(v) => { setCentroCustoId(v); setRows((prev) => prev.map((r) => ({ ...r, centroCustoId: v }))); }}
                    placeholder="Selecionar centro de custo..."
                    vazio="Nenhum centro de custo"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Natureza financeira <span className="text-muted-foreground font-normal text-xs">(aplica a todos os itens)</span></Label>
                  <GroupedSelect
                    options={naturezaOpts(naturezas)}
                    value={naturezaFinanceiraId}
                    onChange={(v) => { setNaturezaFinanceiraId(v); setRows((prev) => prev.map((r) => ({ ...r, naturezaFinanceiraId: v }))); }}
                    placeholder="Selecionar natureza..."
                    vazio="Nenhuma natureza"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-muted-foreground"
                placeholder="Informações adicionais..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Items table */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Produtos</CardTitle>
              {tipo === "REQUISICAO" && !localEstoqueId && (
                <span className="text-xs text-muted-foreground">Selecione o almoxarifado para listar os produtos disponíveis.</span>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((p) => [...p, emptyRow()])}>
              <Plus className="w-4 h-4 mr-1" />Adicionar
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    <th className="text-left px-3 py-2.5 min-w-[240px]">Produto</th>
                    <th className="text-left px-3 py-2.5 w-16">Un.</th>
                    <th className="text-left px-3 py-2.5 w-28">Qtde</th>
                    {tipo === "REQUISICAO" && <>
                      <th className="text-left px-3 py-2.5 min-w-[130px]" title="TES: preset de comportamento que preenche as flags da linha. Não decide destino.">TES</th>
                      <th className="text-left px-3 py-2.5 min-w-[140px]">Centro de Custo <span className="text-red-500">*</span></th>
                      <th className="text-left px-3 py-2.5 min-w-[150px]">Natureza <span className="text-red-500">*</span></th>
                      <th className="text-left px-3 py-2.5 w-32">Destino</th>
                      <th className="text-left px-3 py-2.5 w-40" title="Capitaliza (imobilizado): marca esta linha como capex e exige o bem. Vence o cadastro do item.">Capex</th>
                      <th className="text-left px-3 py-2.5 w-24">O.S.</th>
                      <th className="text-left px-3 py-2.5 w-24">Requisição</th>
                    </>}
                    <th className="text-left px-3 py-2.5 w-28">Localização</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row._key} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <ItemSearchCell
                          row={row}
                          itensCat={itensDisponiveis}
                          onSelect={handleItemSelect}
                          localSelecionado={!!localEstoqueId}
                          onBlocked={avisarLocal}
                          saldoDe={tipo === "REQUISICAO" ? saldoDoItem : undefined}
                        />
                        {tipo === "REQUISICAO" && row.itemId && (saldoDoItem(row.itemId) ?? 0) <= 0 && (
                          <p className="text-[10px] text-danger mt-0.5">Estoque zerado — não é possível lançar.</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const list = itemUnidades.get(row.itemId) ?? [];
                          if (!row.itemId) return <span className="text-xs text-muted-foreground/50">—</span>;
                          if (list.length <= 1) {
                            return <span className="inline-flex items-center h-8 px-2 text-xs font-mono text-muted-foreground">{row.unidade || list[0]?.sigla || "—"}</span>;
                          }
                          return (
                            <select
                              value={row.unidadeId}
                              onChange={(e) => { const u = list.find((x) => x.unidadeId === e.target.value); if (u) updateRowUnidade(row._key, u); }}
                              className="h-8 text-xs w-20 rounded-md border border-border bg-card px-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                              {list.map((u) => (
                                <option key={u.unidadeId} value={u.unidadeId}>
                                  {u.sigla}{u.isPrincipal ? "" : ` (×${u.fator})`}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" step="0.001" min="0" value={row.quantidade}
                          onChange={(e) => updateRow(row._key, "quantidade", e.target.value)} className="h-8 text-xs w-24" />
                        {(() => {
                          const list = itemUnidades.get(row.itemId) ?? [];
                          const sel  = list.find((u) => u.unidadeId === row.unidadeId);
                          const base = list.find((u) => u.isPrincipal);
                          if (!sel || sel.isPrincipal || !row.quantidade) return null;
                          const q = parseFloat(row.quantidade);
                          if (!Number.isFinite(q)) return null;
                          return <p className="text-[10px] text-muted-foreground mt-0.5">= {(q * sel.fator).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {base?.sigla}</p>;
                        })()}
                      </td>
                      {tipo === "REQUISICAO" && <>
                        <td className="px-3 py-2">
                          <select value={row.tesId} onChange={(e) => applyTes(row._key, e.target.value)}
                            className="h-8 text-xs w-full rounded-md border border-border bg-card px-1" title="Tipo de operação (preset)">
                            <option value="">— TES —</option>
                            {tesList.map((t) => <option key={t.id} value={t.id}>{t.codigo} {t.nome}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <GroupedSelect
                            options={centroOpts(centros)}
                            value={row.centroCustoId}
                            onChange={(v) => updateRow(row._key, "centroCustoId", v)}
                            placeholder="—"
                            compact
                            vazio="Nenhum centro de custo"
                            error={submitted && !!row.itemId && !(row.centroCustoId || centroCustoId)}
                          />
                          {submitted && row.itemId && !(row.centroCustoId || centroCustoId) && (
                            <p className="text-[10px] text-red-500 mt-0.5">centro obrigatório</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <GroupedSelect
                            options={naturezaOpts(naturezas)}
                            value={row.naturezaFinanceiraId}
                            onChange={(v) => updateRow(row._key, "naturezaFinanceiraId", v)}
                            placeholder="—"
                            compact
                            vazio="Nenhuma natureza"
                            error={submitted && !!row.itemId && !(row.naturezaFinanceiraId || naturezaFinanceiraId)}
                          />
                          {submitted && row.itemId && !(row.naturezaFinanceiraId || naturezaFinanceiraId) && (
                            <p className="text-[10px] text-red-500 mt-0.5">natureza obrigatória</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.destinoManual} onChange={(e) => updateRow(row._key, "destinoManual", e.target.value)}
                            className="h-8 text-xs w-full rounded-md border border-border bg-card px-1">
                            {DESTINOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                          {(() => {
                            // Alerta de coerência: o destino REAL (flags + centro + manual) vs o que
                            // a natureza escolhida implicaria. Avisa, não bloqueia.
                            const it = itensCat.find((i) => i.id === row.itemId);
                            if (!it) return null;
                            const centro = centros.find((c) => c.id === (row.centroCustoId || centroCustoId));
                            const destino = rotearDestinoRequisicao({
                              item: { categoriaEstoque: it.categoriaEstoque ?? null, compoeCusto: row.compoeCusto ?? (it.compoeCusto ?? false), fabril: it.fabril ?? false, capitaliza: row.capitaliza || (it.capitaliza ?? false) },
                              destinoManual: (row.destinoManual || null) as never,
                              centroFabril: centro ? !!centro.fabril : null,
                            });
                            const nat = naturezas.find((n) => n.id === (row.naturezaFinanceiraId || naturezaFinanceiraId));
                            if (!nat?.destinoSugerido || destino === "INDEFINIDO" || nat.destinoSugerido === destino) return null;
                            return <p className="text-[10px] text-amber-600 mt-0.5">⚠ natureza sugere {nat.destinoSugerido}, mas o destino é {destino}</p>;
                          })()}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {(() => {
                            const tesRow = tesList.find((t) => t.id === row.tesId);
                            const capexBloqueado = !!tesRow && !tesRow.permiteCapitalizar;
                            return (
                              <label className={cn("flex items-center gap-1.5 text-xs", capexBloqueado ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}
                                title={capexBloqueado ? "O TES desta linha não permite capitalizar" : undefined}>
                                <input type="checkbox" checked={row.capitaliza} disabled={capexBloqueado}
                                  onChange={(e) => updateRow(row._key, "capitaliza", e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-border" />
                                <span className="text-muted-foreground">Capitaliza</span>
                              </label>
                            );
                          })()}
                          {row.capitaliza && (
                            <div className="mt-1 space-y-1">
                              <select value={row.imobilizadoId} onChange={(e) => updateRow(row._key, "imobilizadoId", e.target.value)}
                                className={cn("h-8 text-xs w-full rounded-md border bg-card px-1", submitted && !row.imobilizadoId ? "border-red-400 bg-danger/10" : "border-border")}>
                                <option value="">— Bem (obrigatório) —</option>
                                {imobilizados.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                              </select>
                              {submitted && !row.imobilizadoId && <p className="text-[10px] text-red-500">bem obrigatório</p>}
                              <select value={row.componenteSubstituidoId} onChange={(e) => updateRow(row._key, "componenteSubstituidoId", e.target.value)}
                                className="h-8 text-xs w-full rounded-md border border-border bg-card px-1" title="Componente velho a dar baixa (troca, CPC 27)">
                                <option value="">— Troca? componente velho —</option>
                                {imobilizados.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input value={row.os} onChange={(e) => updateRow(row._key, "os", e.target.value)} className="h-8 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={row.requisicaoRef} onChange={(e) => updateRow(row._key, "requisicaoRef", e.target.value)} className="h-8 text-xs" />
                        </td>
                      </>}
                      <td className="px-3 py-2">
                        <Input value={row.localizacao} onChange={(e) => updateRow(row._key, "localizacao", e.target.value)} className="h-8 text-xs" placeholder="A1-01" />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => setRows((p) => p.filter((r) => r._key !== row._key))} className="text-muted-foreground hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={() => handleSave("ABERTA")} disabled={saving || !localEstoqueId}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {tipo === "REQUISICAO" ? "Emitir Requisição" : "Emitir Devolução"}
          </Button>
          <Button variant="outline" onClick={() => handleSave("RASCUNHO")} disabled={saving}>
            Salvar Rascunho
          </Button>
          <Button variant="ghost" onClick={voltar} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
      {createdDialog}
    </div>
  );
}
