"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Search, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import RequisicaoCreateForm from "@/components/suprimentos/RequisicaoCreateForm";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

type Req = {
  id: string;
  numero: string;
  tipo: "REQUISICAO" | "DEVOLUCAO";
  status: string;
  data: string;
  localEstoque: { id: string; nome: string } | null;
  colaborador:  { id: string; nome: string } | null;
  setor:        { id: string; nome: string } | null;
  _count: { itens: number };
};

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO:  "Rascunho",
  ABERTA:    "Aberta",
  ATENDIDA:  "Atendida",
  CANCELADA: "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO:  "bg-muted text-muted-foreground",
  ABERTA:    "bg-info/15 text-info",
  ATENDIDA:  "bg-success/15 text-success",
  CANCELADA: "bg-danger/15 text-danger",
};

export default function RequisicoesMaterialPage() {
  useTabTitle("Req/Dev de Materiais");
  const router = useRouter();
  const [items, setItems]       = useState<Req[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTipo, setFilterTipo]     = useState("");

  const [novaAberta, setNovaAberta] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterTipo)   params.set("tipo",   filterTipo);
    const res = await fetch(`/api/suprimentos/requisicoes-materiais?${params}`);
    const json = await res.json();
    setItems(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, [filterStatus, filterTipo]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.numero.toLowerCase().includes(q) ||
      r.localEstoque?.nome.toLowerCase().includes(q) ||
      r.colaborador?.nome.toLowerCase().includes(q)
    );
  });

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-500/25 flex items-center justify-center">
            <ClipboardList className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Req/Dev de Materiais</h1>
            <p className="text-xs text-muted-foreground">Requisições e devoluções de materiais do almoxarifado</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setNovaAberta(true)}>
          <Plus className="w-4 h-4 mr-1" />Nova Requisição
        </Button>
      </div>

      <CreateDrawer
        open={novaAberta}
        onOpenChange={setNovaAberta}
        title="Nova Req/Dev de Materiais"
        width="xl"
        onCreated={load}
      >
        <RequisicaoCreateForm />
      </CreateDrawer>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, almoxarifado..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="h-8 px-2 text-sm border border-border rounded-md bg-card"
        >
          <option value="">Todos os tipos</option>
          <option value="REQUISICAO">Requisição</option>
          <option value="DEVOLUCAO">Devolução</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 px-2 text-sm border border-border rounded-md bg-card"
        >
          <option value="">Todos os status</option>
          <option value="RASCUNHO">Rascunho</option>
          <option value="ABERTA">Aberta</option>
          <option value="ATENDIDA">Atendida</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
          <p className="font-medium text-muted-foreground">Nenhuma requisição encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Crie uma nova requisição ou devolução de materiais.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Número</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Almoxarifado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Solicitante</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/suprimentos/requisicoes-materiais/${r.id}`)}
                  className="hover:bg-info/10 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold text-info">{r.numero}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold",
                      r.tipo === "REQUISICAO" ? "bg-info/15 text-info" : "bg-warning/15 text-warning"
                    )}>
                      {r.tipo === "REQUISICAO" ? "Requisição" : "Devolução"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground font-medium">{r.localEstoque?.nome ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-foreground">{r.colaborador?.nome ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-medium">
                    {formatDate(r.data)}
                  </td>
                  <td className="px-4 py-3 text-center text-foreground font-medium">{r._count.itens}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", STATUS_COLOR[r.status] ?? "bg-muted text-muted-foreground")}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
