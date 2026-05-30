"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  PackageSearch,
  ChevronDown,
  ChevronRight,
  Truck,
  Search,
  CalendarClock,
} from "lucide-react";

// ── Types (compartilhados com a página server) ─────────────────────────────────
export type ItemPendente = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  pedida: number;
  minutado: number;
  pendente: number;
};

export type PedidoComSaldo = {
  id: string;
  numero: string;
  numeroOrcamento: string | null;
  status: string;
  dataEmissao: string;
  dataEntrega: string | null;
  itens: ItemPendente[];
  totalPendente: number;
};

export type ClienteComSaldo = {
  id: string;
  nome: string;
  pedidos: PedidoComSaldo[];
  totalItensPendentes: number;
};

const numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    CONFIRMADO: { label: "Confirmado", cls: "bg-blue-50 text-blue-700" },
    EM_AGENDAMENTO: { label: "Em agendamento", cls: "bg-violet-50 text-violet-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function SaldoClientesView({ clientes }: { clientes: ClienteComSaldo[] }) {
  useTabTitle("Saldo por Cliente");

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Filtra por nome do cliente, número do pedido ou número do orçamento.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes;
    return clientes
      .map((c) => {
        if (c.nome.toLowerCase().includes(q)) return c;
        const pedidos = c.pedidos.filter(
          (p) =>
            p.numero.toLowerCase().includes(q) ||
            (p.numeroOrcamento ?? "").toLowerCase().includes(q),
        );
        return pedidos.length ? { ...c, pedidos } : null;
      })
      .filter((c): c is ClienteComSaldo => c !== null);
  }, [clientes, query]);

  const totals = useMemo(() => {
    const nClientes = filtered.length;
    const nPedidos = filtered.reduce((s, c) => s + c.pedidos.length, 0);
    const nItens = filtered.reduce(
      (s, c) => s + c.pedidos.reduce((ss, p) => ss + p.itens.length, 0),
      0,
    );
    return { nClientes, nPedidos, nItens };
  }, [filtered]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Saldo por Cliente"
        subtitle="O que ainda falta entregar de cada pedido confirmado. Agende a entrega criando uma minuta."
        breadcrumbs={[{ label: "Comercial" }, { label: "Saldo por Cliente" }]}
      />

      {/* Toolbar: busca + contadores */}
      <div className="px-8 pb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, pedido ou orçamento…"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-1 font-medium">
            {totals.nClientes} {totals.nClientes === 1 ? "cliente" : "clientes"}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-1 font-medium">
            {totals.nPedidos} {totals.nPedidos === 1 ? "pedido" : "pedidos"}
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 font-medium">
            {totals.nItens} {totals.nItens === 1 ? "item pendente" : "itens pendentes"}
          </span>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <PackageSearch className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">Nenhum saldo pendente</p>
            <p className="text-xs text-gray-400 mt-1">
              {query
                ? "Nenhum cliente corresponde à busca."
                : "Todos os pedidos confirmados já foram totalmente minutados."}
            </p>
          </div>
        ) : (
          filtered.map((cli) => {
            const isCollapsed = collapsed.has(cli.id);
            return (
              <div
                key={cli.id}
                className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden"
              >
                {/* Cabeçalho do cliente */}
                <button
                  onClick={() => toggle(cli.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className="font-semibold text-gray-900 flex-1 truncate">{cli.nome}</span>
                  <span className="text-xs text-gray-400">
                    {cli.pedidos.length} {cli.pedidos.length === 1 ? "pedido" : "pedidos"}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {cli.pedidos.map((p) => (
                      <div key={p.id} className="px-5 py-4">
                        {/* Cabeçalho do pedido + ação */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
                          <span className="font-medium text-gray-900 text-sm">{p.numero}</span>
                          {p.numeroOrcamento && (
                            <span className="text-xs text-gray-400">Orç. {p.numeroOrcamento}</span>
                          )}
                          <StatusBadge status={p.status} />
                          {p.dataEntrega && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <CalendarClock className="w-3.5 h-3.5" /> Entrega {formatDate(p.dataEntrega)}
                            </span>
                          )}
                          <div className="ml-auto">
                            <Button asChild size="sm">
                              <Link href={`/comercial/minutas/nova?pedidoVendaId=${p.id}`}>
                                <Truck className="w-4 h-4" /> Agendar entrega
                              </Link>
                            </Button>
                          </div>
                        </div>

                        {/* Itens pendentes */}
                        <div className="rounded-lg border border-gray-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                              <tr>
                                <th className="text-left font-medium px-3 py-2">Produto</th>
                                <th className="text-right font-medium px-3 py-2 w-28">Pedida</th>
                                <th className="text-right font-medium px-3 py-2 w-28">Em minuta</th>
                                <th className="text-right font-medium px-3 py-2 w-32">Falta entregar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {p.itens.map((it) => (
                                <tr key={it.id}>
                                  <td className="px-3 py-2">
                                    <span className="text-gray-400 mr-1.5">{it.codigo}</span>
                                    <span className="text-gray-800">{it.descricao}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                    {numberFmt.format(it.pedida)} {it.unidade}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                    {numberFmt.format(it.minutado)} {it.unidade}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">
                                    {numberFmt.format(it.pendente)} {it.unidade}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
