"use client";

import { useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Search } from "lucide-react";
import MateriaisGrid from "@/components/comercial/MateriaisGrid";
import type { MaterialComSaldo } from "@/lib/saldo-materiais";

export default function SaldoMateriaisView({
  materiais,
}: {
  materiais: MaterialComSaldo[];
}) {
  useTabTitle("Saldo por Material");
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Saldo por Material"
        subtitle="O que ainda falta entregar de cada material, somando todos os pedidos confirmados. Considera só minutas já ENTREGUES."
        breadcrumbs={[{ label: "Faturamento" }, { label: "Saldo por Material" }]}
      />

      {/* Toolbar: busca */}
      <div className="px-8 pb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar material, pedido ou cliente…"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <MateriaisGrid materiais={materiais} query={query} />
      </div>
    </div>
  );
}
