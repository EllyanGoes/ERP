"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import MateriaisGrid from "@/components/comercial/MateriaisGrid";
import type { MaterialComSaldo } from "@/lib/saldo-materiais";
import {
  PackageSearch,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Truck,
  Search,
  Calendar,
  CalendarClock,
  Users,
  Package,
  BadgeDollarSign,
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
  valorPendente: number;
};

export type PedidoComSaldo = {
  id: string;
  numero: string;
  numeroOrcamento: string | null;
  status: string;
  pago?: boolean;
  dataEmissao: string;
  dataEntrega: string | null;
  itens: ItemPendente[];
  totalPendente: number;
  valorPendente: number;
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
    CONFIRMADO: { label: "Confirmado", cls: "bg-info/10 text-info" },
    EM_AGENDAMENTO: { label: "Em agendamento", cls: "bg-violet-50 text-violet-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function SaldoClientesView({
  clientes,
  materiais,
}: {
  clientes: ClienteComSaldo[];
  materiais: MaterialComSaldo[];
}) {
  useTabTitle("Saldos");

  const [mode, setMode] = useState<"cliente" | "material">("cliente");
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
    // Valor total a entregar (soma dos pedidos visíveis — respeita o filtro).
    const valorTotal = filtered.reduce(
      (s, c) => s + c.pedidos.reduce((ss, p) => ss + p.valorPendente, 0),
      0,
    );
    return { nClientes, nPedidos, nItens, valorTotal };
  }, [filtered]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Todos recolhidos? (considera apenas os clientes visíveis no filtro atual)
  const allCollapsed =
    filtered.length > 0 && filtered.every((c) => collapsed.has(c.id));

  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(clientes.map((c) => c.id)));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Saldos"
        subtitle="O que ainda falta entregar de cada pedido confirmado. Pedidos com selo Pago já foram recebidos e só aguardam entrega. Agende a entrega criando uma minuta."
        breadcrumbs={[{ label: "Faturamento" }, { label: "Saldos" }]}
      />

      {/* Toolbar: alternância de visão + busca + contadores */}
      <div className="px-8 pb-4 flex flex-wrap items-center gap-3">
        {/* Alternar entre agrupar por Cliente ou por Material */}
        <div className="inline-flex rounded-lg border border-border overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setMode("cliente")}
            className={`px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${
              mode === "cliente"
                ? "bg-blue-600 text-white"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <Users className="w-4 h-4" /> Cliente
          </button>
          <button
            type="button"
            onClick={() => setMode("material")}
            className={`px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 border-l border-border ${
              mode === "material"
                ? "bg-blue-600 text-white"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <Package className="w-4 h-4" /> Material
          </button>
        </div>
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "cliente"
                ? "Buscar cliente, pedido ou orçamento…"
                : "Buscar material, pedido ou cliente…"
            }
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        {mode === "cliente" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-1 font-medium">
              {totals.nClientes} {totals.nClientes === 1 ? "cliente" : "clientes"}
            </span>
            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-1 font-medium">
              {totals.nPedidos} {totals.nPedidos === 1 ? "pedido" : "pedidos"}
            </span>
            <span className="inline-flex items-center rounded-full bg-info/10 text-info px-2.5 py-1 font-medium">
              {totals.nItens} {totals.nItens === 1 ? "item pendente" : "itens pendentes"}
            </span>
            <span className="inline-flex items-center rounded-full bg-success/10 text-success px-2.5 py-1 font-semibold">
              {formatBRL(totals.valorTotal)} a entregar
            </span>
          </div>
        )}
        {mode === "cliente" && filtered.length > 1 && (
          <Button variant="outline" size="sm" onClick={toggleAll} className="ml-auto">
            {allCollapsed ? (
              <ChevronsUpDown className="w-4 h-4" />
            ) : (
              <ChevronsDownUp className="w-4 h-4" />
            )}
            {allCollapsed ? "Expandir todos" : "Recolher todos"}
          </Button>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4">
        {mode === "material" ? (
          <MateriaisGrid materiais={materiais} query={query} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <PackageSearch className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum saldo pendente</p>
            <p className="text-xs text-muted-foreground mt-1">
              {query
                ? "Nenhum cliente corresponde à busca."
                : "Todos os pedidos confirmados já foram totalmente minutados."}
            </p>
          </div>
        ) : (
          filtered.map((cli) => {
            const isCollapsed = collapsed.has(cli.id);
            const clienteValor = cli.pedidos.reduce((s, p) => s + p.valorPendente, 0);
            return (
              <div
                key={cli.id}
                className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
              >
                {/* Cabeçalho do cliente */}
                <button
                  onClick={() => toggle(cli.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-semibold text-foreground flex-1 truncate">{cli.nome}</span>
                  <span className="text-sm font-semibold text-success">{formatBRL(clienteValor)}</span>
                  <span className="text-xs text-muted-foreground">
                    {cli.pedidos.length} {cli.pedidos.length === 1 ? "pedido" : "pedidos"}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border divide-y divide-border">
                    {cli.pedidos.map((p) => (
                      <div key={p.id} className="px-5 py-4">
                        {/* Cabeçalho do pedido + ação */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
                          <span className="font-medium text-foreground text-sm">{p.numero}</span>
                          {p.numeroOrcamento && (
                            <span className="text-xs text-muted-foreground">Orç. {p.numeroOrcamento}</span>
                          )}
                          <StatusBadge status={p.status} />
                          {p.pago && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-[11px] font-semibold">
                              <BadgeDollarSign className="w-3.5 h-3.5" /> Pago
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" /> Emissão {formatDate(p.dataEmissao)}
                          </span>
                          {p.dataEntrega && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                              <tr>
                                <th className="text-left font-medium px-3 py-2">Produto</th>
                                <th className="text-right font-medium px-3 py-2 w-24">Pedida</th>
                                <th className="text-right font-medium px-3 py-2 w-24">Em minuta</th>
                                <th className="text-right font-medium px-3 py-2 w-28">Falta entregar</th>
                                <th className="text-right font-medium px-3 py-2 w-36">Valor a entregar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {p.itens.map((it) => (
                                <tr key={it.id}>
                                  <td className="px-3 py-2">
                                    <span className="text-muted-foreground mr-1.5">{it.codigo}</span>
                                    <span className="text-foreground">{it.descricao}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {numberFmt.format(it.pedida)} {it.unidade}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {numberFmt.format(it.minutado)} {it.unidade}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-info">
                                    {numberFmt.format(it.pendente)} {it.unidade}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                                    {formatBRL(it.valorPendente)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-muted border-t border-border">
                              <tr>
                                <td
                                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                  colSpan={4}
                                >
                                  Total a entregar
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold text-success">
                                  {formatBRL(p.valorPendente)}
                                </td>
                              </tr>
                            </tfoot>
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
