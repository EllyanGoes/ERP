"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  UserCheck, Plus, Search, Loader2, Phone,
} from "lucide-react";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type UsuarioMin = { id: string; nome: string; email: string };

type Colaborador = {
  id:       string;
  nome:     string;
  cpf:      string | null;
  cargo:    string | null;
  setor:    { id: string; nome: string } | null;
  telefone: string | null;
  ativo:    boolean;
  filiais:  Filial[];
  usuario:  UsuarioMin | null;
};

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<Colaborador>[] = [
  {
    id: "nome",
    label: "Nome",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-medium text-gray-900",
    render: (c) => c.nome,
  },
  {
    id: "cpf",
    label: "CPF",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-32",
    tdClass: "px-4 py-3 font-mono text-xs text-gray-600",
    render: (c) => c.cpf || <span className="text-gray-300">—</span>,
  },
  {
    id: "cargo",
    label: "Cargo",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500",
    render: (c) => c.cargo || <span className="text-gray-300">—</span>,
  },
  {
    id: "setor",
    label: "Setor",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500",
    render: (c) => c.setor?.nome || <span className="text-gray-300">—</span>,
  },
  {
    id: "filial",
    label: "Filial",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500",
    render: (c) =>
      c.filiais.length > 0
        ? c.filiais.map((f) => f.nomeFantasia || f.razaoSocial).join(", ")
        : <span className="text-gray-300">—</span>,
  },
  {
    id: "usuario",
    label: "Usuário",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (c) =>
      c.usuario ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {c.usuario.nome}
        </span>
      ) : (
        <span className="text-gray-300 text-xs">—</span>
      ),
  },
  {
    id: "telefone",
    label: "WhatsApp",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-32",
    tdClass: "px-4 py-3",
    render: (c) =>
      c.telefone ? (
        <span className="flex items-center gap-1.5 text-xs text-gray-600 font-mono">
          <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
          {c.telefone}
        </span>
      ) : (
        <span className="text-gray-300 text-xs">—</span>
      ),
  },
  {
    id: "ativo",
    label: "Ativo",
    thClass: "text-center px-4 py-3 font-medium text-gray-600 w-20",
    tdClass: "px-4 py-3 text-center",
    render: (c) => (
      <span className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        c.ativo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
      )}>
        {c.ativo ? "Ativo" : "Inativo"}
      </span>
    ),
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"" | "true" | "false">("");

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
          <div className="rounded-xl px-5 py-3 bg-blue-50 text-blue-700 flex items-center gap-3">
            <UserCheck className="w-5 h-5 opacity-60" />
            <div>
              <p className="text-xs font-medium opacity-70">Total</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{colaboradores.length}</p>
            </div>
          </div>
          <div className="rounded-xl px-5 py-3 bg-emerald-50 text-emerald-700 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <p className="text-xs font-medium opacity-70">Ativos</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{ativos}</p>
            </div>
          </div>
          {inativos > 0 && (
            <div className="rounded-xl px-5 py-3 bg-gray-50 text-gray-500 flex items-center gap-3">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, CPF, cargo, setor..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as "" | "true" | "false")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : colaboradores.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum colaborador encontrado</p>
            <p className="text-sm mt-1">Clique em &quot;Novo Colaborador&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {colaboradores.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => window.location.href = `/empresa/colaboradores/${c.id}`}
                    className="hover:bg-gray-50/60 cursor-pointer transition-colors"
                  >
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
