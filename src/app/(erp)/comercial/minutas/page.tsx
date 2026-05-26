"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";

type Minuta = {
  id: string;
  numero: string;
  status: "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: string | null;
  placa: string | null;
  pedidoVenda: {
    id: string;
    numero: string;
    cliente: { razaoSocial: string; nomeFantasia: string | null };
  };
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string }[];
};

const STATUS_LABEL: Record<Minuta["status"], string> = {
  PENDENTE:          "Pendente",
  SAIU_PARA_ENTREGA: "Saiu p/ Entrega",
  ENTREGUE:          "Entregue",
  CANCELADA:         "Cancelada",
};

const STATUS_COLOR: Record<Minuta["status"], string> = {
  PENDENTE:          "bg-amber-100 text-amber-700 border border-amber-200",
  SAIU_PARA_ENTREGA: "bg-blue-100 text-blue-700 border border-blue-200",
  ENTREGUE:          "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELADA:         "bg-gray-100 text-gray-500 border border-gray-200",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function MinutasPage() {
  useTabTitle("Minutas");
  const router = useRouter();
  const [minutas, setMinutas] = useState<Minuta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | Minuta["status"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/comercial/minutas");
      const json = await res.json();
      setMinutas(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = minutas.filter((m) => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const cliente = m.pedidoVenda.cliente;
      const nome = (cliente.nomeFantasia || cliente.razaoSocial).toLowerCase();
      if (
        !m.numero.toLowerCase().includes(q) &&
        !m.pedidoVenda.numero.toLowerCase().includes(q) &&
        !nome.includes(q) &&
        !(m.motorista ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const counts = minutas.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="px-8 pb-8 space-y-6">
      <PageHeader
        title="Minutas"
        action={
          <Button size="sm" onClick={() => router.push("/comercial/minutas/nova")} className="gap-1.5 font-semibold">
            <Plus className="w-4 h-4" /> Nova Minuta
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="inline-flex items-stretch rounded-xl border border-gray-200 bg-white shadow-sm divide-x divide-gray-200 overflow-hidden">
        {(["PENDENTE", "SAIU_PARA_ENTREGA", "ENTREGUE", "CANCELADA"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(prev => prev === s ? "all" : s)}
            className={cn(
              "px-5 py-3 text-center transition-colors hover:bg-gray-50",
              filterStatus === s && "bg-gray-100"
            )}
          >
            <div className="text-xl font-bold text-gray-800">{counts[s] ?? 0}</div>
            <div className="text-xs text-gray-500 font-medium whitespace-nowrap">{STATUS_LABEL[s]}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por número, pedido, cliente..."
          className="pl-9 h-9 border-gray-300 text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Minuta</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Pedido</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Cliente</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Emissão</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Entrega</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Motorista / Placa</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Itens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Nenhuma minuta encontrada</td></tr>
            ) : filtered.map((m) => (
              <tr
                key={m.id}
                onClick={() => router.push(`/comercial/minutas/${m.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-mono font-semibold text-gray-800">{m.numero}</td>
                <td className="px-4 py-3 font-mono text-gray-600">{m.pedidoVenda.numero}</td>
                <td className="px-4 py-3 text-gray-700">
                  {m.pedidoVenda.cliente.nomeFantasia || m.pedidoVenda.cliente.razaoSocial}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", STATUS_COLOR[m.status])}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(m.dataEmissao)}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(m.dataEntrega)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {m.motorista ? (
                    <span>{m.motorista}{m.placa ? <span className="text-gray-400"> · {m.placa}</span> : null}</span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{m.itens.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
