"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  UserCheck, Plus, Search, Loader2, Phone, ListChecks,
} from "lucide-react";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type UsuarioMin = { id: string; nome: string; email: string };

type Classif = "MOD" | "MOI" | "ADMIN";
type Tipo = "FUNCIONARIO" | "PRESTADOR";
type Colaborador = {
  id:       string;
  nome:     string;
  cpf:      string | null;
  cargo:    string | null;
  setor:    { id: string; nome: string } | null;
  classificacaoCusto: Classif | null;
  tipoColaborador: Tipo;
  telefone: string | null;
  ativo:    boolean;
  filiais:  Filial[];
  usuario:  UsuarioMin | null;
};

// Classificação de custo (rateio da folha): MOD→PEP-MOD, MOI→CIF, ADMIN→Despesa.
const CLASSIF_BADGE: Record<Classif, { label: string; cls: string }> = {
  MOD:   { label: "MOD",   cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  MOI:   { label: "MOI",   cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  ADMIN: { label: "Admin", cls: "bg-muted text-muted-foreground" },
};

// Tipo de vínculo: funcionário (folha de pagamento) × prestador (diaristas).
const TIPO_BADGE: Record<Tipo, { label: string; cls: string }> = {
  FUNCIONARIO: { label: "Funcionário", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  PRESTADOR:   { label: "Prestador",   cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<Colaborador>[] = [
  {
    id: "nome",
    label: "Nome",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 font-medium text-foreground",
    render: (c) => c.nome,
  },
  {
    id: "cpf",
    label: "CPF",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground w-32",
    tdClass: "px-4 py-3 font-mono text-xs text-muted-foreground",
    render: (c) => c.cpf || <span className="text-muted-foreground/60">—</span>,
  },
  {
    id: "cargo",
    label: "Cargo",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-muted-foreground",
    render: (c) => c.cargo || <span className="text-muted-foreground/60">—</span>,
  },
  {
    id: "setor",
    label: "Setor",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-muted-foreground",
    render: (c) => c.setor?.nome || <span className="text-muted-foreground/60">—</span>,
  },
  {
    id: "classificacao",
    label: "Classif. custo",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground w-28",
    tdClass: "px-4 py-3",
    render: (c) =>
      c.classificacaoCusto ? (
        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", CLASSIF_BADGE[c.classificacaoCusto].cls)}>
          {CLASSIF_BADGE[c.classificacaoCusto].label}
        </span>
      ) : (
        <span className="text-muted-foreground/60 text-xs">— sem —</span>
      ),
  },
  {
    id: "tipo",
    label: "Tipo",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground w-28",
    tdClass: "px-4 py-3",
    render: (c) => (
      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", TIPO_BADGE[c.tipoColaborador].cls)}>
        {TIPO_BADGE[c.tipoColaborador].label}
      </span>
    ),
  },
  {
    id: "filial",
    label: "Filial",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-muted-foreground",
    render: (c) =>
      c.filiais.length > 0
        ? c.filiais.map((f) => f.nomeFantasia || f.razaoSocial).join(", ")
        : <span className="text-muted-foreground/60">—</span>,
  },
  {
    id: "usuario",
    label: "Usuário",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3",
    render: (c) =>
      c.usuario ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-info/15 text-info">
          {c.usuario.nome}
        </span>
      ) : (
        <span className="text-muted-foreground/60 text-xs">—</span>
      ),
  },
  {
    id: "telefone",
    label: "WhatsApp",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground w-32",
    tdClass: "px-4 py-3",
    render: (c) =>
      c.telefone ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
          {c.telefone}
        </span>
      ) : (
        <span className="text-muted-foreground/60 text-xs">—</span>
      ),
  },
  {
    id: "ativo",
    label: "Ativo",
    thClass: "text-center px-4 py-3 font-medium text-muted-foreground w-20",
    tdClass: "px-4 py-3 text-center",
    render: (c) => (
      <span className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        c.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
      )}>
        {c.ativo ? "Ativo" : "Inativo"}
      </span>
    ),
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const router = useRouter();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"" | "true" | "false">("");
  // Modo de seleção em massa: os checkboxes só aparecem depois do botão
  // "Classificar em massa" — fora dele a tabela fica limpa.
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [classificando, setClassificando] = useState(false);

  const sairDaSelecao = () => { setSelecionando(false); setSel(new Set()); };

  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const classificar = useCallback(async (cl: Classif | null) => {
    const ids = Array.from(sel);
    if (!ids.length) return;
    setClassificando(true);
    try {
      await fetch("/api/empresa/colaboradores/classificar", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, classificacaoCusto: cl }),
      });
      setSel(new Set());
      await load();
    } finally { setClassificando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const classificarTipo = useCallback(async (tipo: Tipo) => {
    const ids = Array.from(sel);
    if (!ids.length) return;
    setClassificando(true);
    try {
      await fetch("/api/empresa/colaboradores/classificar", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, tipoColaborador: tipo }),
      });
      setSel(new Set());
      await load();
    } finally { setClassificando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)      params.set("search", search);
      if (filtroAtivo) params.set("ativo",  filtroAtivo);
      const res  = await fetch(`/api/empresa/colaboradores?${params}`);
      const text = await res.text();
      if (!text) { setLoading(false); return; }
      const json = JSON.parse(text);
      setColaboradores(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error("[colaboradores load]", e);
    } finally {
      setLoading(false);
    }
  }, [search, filtroAtivo]);

  useEffect(() => { load(); }, [load]);

  const ativos   = colaboradores.filter((c) => c.ativo).length;
  const inativos = colaboradores.filter((c) => !c.ativo).length;
  const semClassif = colaboradores.filter((c) => !c.classificacaoCusto).length;
  const todosSelecionados = colaboradores.length > 0 && colaboradores.every((c) => sel.has(c.id));
  const toggleTodos = () => setSel(todosSelecionados ? new Set() : new Set(colaboradores.map((c) => c.id)));

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("colaboradores", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("colaboradores", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<Colaborador> => c !== undefined && colVis[c.id] !== false);

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        breadcrumbs={[{ label: "Empresa" }, { label: "Colaboradores" }]}
        action={
          <Button asChild>
            <Link href="/empresa/colaboradores/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Colaborador
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Summary */}
        <div className="flex items-center gap-4">
          <div className="rounded-xl px-5 py-3 bg-info/10 text-info flex items-center gap-3">
            <UserCheck className="w-5 h-5 opacity-60" />
            <div>
              <p className="text-xs font-medium opacity-70">Total</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{colaboradores.length}</p>
            </div>
          </div>
          <div className="rounded-xl px-5 py-3 bg-success/10 text-success flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <p className="text-xs font-medium opacity-70">Ativos</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{ativos}</p>
            </div>
          </div>
          {inativos > 0 && (
            <div className="rounded-xl px-5 py-3 bg-muted text-muted-foreground flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <div>
                <p className="text-xs font-medium opacity-70">Inativos</p>
                <p className="text-2xl font-bold leading-none mt-0.5">{inativos}</p>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, CPF, cargo, setor..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as "" | "true" | "false")}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 text-foreground"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
          <Button
            variant={selecionando ? "default" : "outline"}
            onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
          >
            <ListChecks className="w-4 h-4 mr-2" />
            {selecionando ? "Concluir seleção" : "Classificar em massa"}
          </Button>
          {semClassif > 0 && sel.size === 0 && (
            <span className="ml-auto text-xs text-warning bg-warning/10 px-2.5 py-1.5 rounded-lg">
              {semClassif} sem classificação de custo
            </span>
          )}
        </div>

        {/* Barra de classificação em massa (MOD/MOI/ADMIN) → rateio da folha */}
        {sel.size > 0 && (
          <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 rounded-xl border border-info/30 bg-info/5">
            <span className="text-sm font-medium text-foreground">{sel.size} selecionado(s) — classificar como:</span>
            {classificando ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => classificar("MOD")} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25">MOD <span className="opacity-60">(PEP)</span></button>
                <button onClick={() => classificar("MOI")} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 hover:bg-violet-500/25">MOI <span className="opacity-60">(CIF)</span></button>
                <button onClick={() => classificar("ADMIN")} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70">Admin <span className="opacity-60">(despesa)</span></button>
                <button onClick={() => classificar(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">Limpar</button>
                <span className="mx-1 h-5 w-px bg-border" />
                <span className="text-xs text-muted-foreground">Tipo:</span>
                <button onClick={() => classificarTipo("FUNCIONARIO")} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25">Funcionário <span className="opacity-60">(folha)</span></button>
                <button onClick={() => classificarTipo("PRESTADOR")} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25">Prestador <span className="opacity-60">(diaristas)</span></button>
                <button onClick={sairDaSelecao} className="text-xs text-muted-foreground hover:text-foreground ml-1">Cancelar</button>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : colaboradores.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum colaborador encontrado</p>
            <p className="text-sm mt-1">Clique em &quot;Novo Colaborador&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {selecionando && (
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                        className="w-4 h-4 rounded border-border align-middle" title="Selecionar todos" />
                    </th>
                  )}
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {colaboradores.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => (selecionando ? toggleSel(c.id) : router.push(`/empresa/colaboradores/${c.id}`))}
                    className={cn("hover:bg-muted/60 cursor-pointer transition-colors", sel.has(c.id) && "bg-info/5")}
                  >
                    {selecionando && (
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggleSel(c.id)}
                          className="w-4 h-4 rounded border-border align-middle" />
                      </td>
                    )}
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
