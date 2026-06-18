"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, Search, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import InventarioCreateForm from "@/components/suprimentos/InventarioCreateForm";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

type Inv = {
  id: string;
  numero: string;
  tipo: string;
  status: string;
  data: string;
  localEstoque: { id: string; nome: string } | null;
  colaborador:  { id: string; nome: string } | null;
  _count: { itens: number };
};

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO:    "bg-muted text-muted-foreground",
  EM_ANDAMENTO: "bg-info/15 text-info",
  CONCLUIDO:   "bg-success/15 text-success",
  CANCELADO:   "bg-danger/15 text-danger",
};
const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho", EM_ANDAMENTO: "Em Andamento", CONCLUIDO: "Concluído", CANCELADO: "Cancelado",
};
const TIPO_LABEL: Record<string, string> = { TOTAL: "Total", PARCIAL: "Parcial", CICLICO: "Cíclico" };

export default function InventariosMaterialPage() {
  useTabTitle("Inventário de Materiais");
  const router = useRouter();
  const [items, setItems]     = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [novoAberto, setNovoAberto] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/suprimentos/inventarios-materiais?${params}`);
    const json = await res.json();
    setItems(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.numero.toLowerCase().includes(q) || r.localEstoque?.nome.toLowerCase().includes(q);
  });

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
            <ClipboardCheck className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inventário de Materiais</h1>
            <p className="text-xs text-muted-foreground">Contagens e conferências de estoque do almoxarifado</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setNovoAberto(true)}>
          <Plus className="w-4 h-4 mr-1" />Novo Inventário
        </Button>
      </div>

      <CreateDrawer
        open={novoAberto}
        onOpenChange={setNovoAberto}
        title="Novo Inventário de Materiais"
        width="xl"
        onCreated={load}
      >
        <InventarioCreateForm />
      </CreateDrawer>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número ou almoxarifado..." className="pl-8 h-8 text-sm" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 px-2 text-sm border border-border rounded-md bg-card">
          <option value="">Todos os status</option>
          <option value="RASCUNHO">Rascunho</option>
          <option value="EM_ANDAMENTO">Em Andamento</option>
          <option value="CONCLUIDO">Concluído</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
          <p className="font-medium text-muted-foreground">Nenhum inventário encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">Crie um novo inventário de materiais.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b-2 border-border">
              <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Número</th>
                <th className="text-left px-4 py-3 font-semibold">Local de Estoque</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Funcionário</th>
                <th className="text-left px-4 py-3 font-semibold">Data</th>
                <th className="text-center px-4 py-3 font-semibold">Itens</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/suprimentos/inventarios-materiais/${r.id}`)}
                  className="hover:bg-indigo-50/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs font-bold text-indigo-700">{r.numero}</td>
                  <td className="px-4 py-3.5 text-foreground font-medium">{r.localEstoque?.nome ?? "—"}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs font-medium">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                  <td className="px-4 py-3.5 text-foreground">{r.colaborador?.nome ?? "—"}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs">{new Date(r.data).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3.5 text-center text-foreground font-medium">{r._count.itens}</td>
                  <td className="px-4 py-3.5 text-center">
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
