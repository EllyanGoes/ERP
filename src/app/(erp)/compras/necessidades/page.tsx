"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import Link from "next/link";
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, ChevronRight, Building2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Necessidade = {
  id: string;
  numero: string;
  status: string;
  solicitante: string | null;
  dataNecessidade: string | null;
  filial: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  _count: { itens: number };
};

export default function NecessidadesPage() {
  const router = useRouter();
  const [necessidades, setNecessidades] = useState<Necessidade[]>([]);
  const [loading,      setLoading]      = useState(true);

  const [deleteItem,    setDeleteItem]    = useState<Necessidade | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/suprimentos/necessidades");
    const json = await res.json();
    setNecessidades(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/suprimentos/necessidades/${deleteItem.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteError((await res.json()).error || "Não foi possível excluir");
      setDeleteLoading(false); return;
    }
    setDeleteItem(null);
    await load();
    setDeleteLoading(false);
  }

  // Group by filial
  type Group = { filialId: string | null; filialLabel: string; items: Necessidade[] };
  const groups: Group[] = [];
  for (const n of necessidades) {
    const key   = n.filial?.id ?? "__sem_filial__";
    const label = n.filial ? (n.filial.nomeFantasia || n.filial.razaoSocial) : "Sem Filial";
    let g = groups.find((g) => g.filialId === key);
    if (!g) { g = { filialId: key, filialLabel: label, items: [] }; groups.push(g); }
    g.items.push(n);
  }

  return (
    <div>
      <PageHeader
        title="Solicitações de Compras"
        breadcrumbs={[{ label: "Compras" }, { label: "Solicitações" }]}
        action={
          <Button asChild>
            <Link href="/compras/necessidades/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Solicitação
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : necessidades.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="text-lg font-medium">Nenhuma solicitação registrada</p>
            <p className="text-sm mt-1">Clique em &quot;Nova Solicitação&quot; para começar.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.filialId ?? "sem"}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-blue-500">{group.filialLabel}</span>
                <span className="text-xs text-gray-400">({group.items.length})</span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitante</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Data Necessidade</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Itens</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.items.map((n) => (
                      <tr
                        key={n.id}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                        onClick={() => router.push(`/compras/necessidades/${n.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                          <span className="flex items-center gap-1">
                            {n.numero}
                            <ChevronRight className="w-3 h-3 text-gray-300" />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{n.solicitante || "—"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={n.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(n.dataNecessidade)}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{n._count.itens}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/compras/necessidades/${n.id}/editar`)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setDeleteItem(n); setDeleteError(""); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete confirm */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir solicitação?</p>
                <p className="text-sm text-gray-500 mt-0.5">{deleteItem.numero}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
