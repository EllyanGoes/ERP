"use client";

import { useMemo } from "react";
import { formatBRL, formatDate } from "@/lib/utils";
import { PackageSearch } from "lucide-react";
import type { MaterialComSaldo } from "@/lib/saldo-materiais";

const numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/**
 * Lista de blocos "Saldo por Material" no formato da planilha:
 * um bloco por material (DESCRIÇÃO + CÓDIGO) com as colunas
 * DATA · PED · CLIENTE · QNT · VALOR · TOTAL e um rodapé de total por material.
 *
 * Componente puro de apresentação: o filtro de busca é controlado pelo `query`
 * que vem da tela que o usa (tela nova OU alternância na "Saldo por Cliente").
 */
export default function MateriaisGrid({
  materiais,
  query,
}: {
  materiais: MaterialComSaldo[];
  query: string;
}) {
  // Filtra por material (descrição/código) ou, dentro do material, por
  // cliente / nº do pedido / nº do orçamento.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materiais;
    return materiais
      .map((m) => {
        if (`${m.descricao} ${m.codigo}`.toLowerCase().includes(q)) return m;
        const rows = m.rows.filter(
          (r) =>
            r.clienteNome.toLowerCase().includes(q) ||
            r.numero.toLowerCase().includes(q) ||
            (r.numeroOrcamento ?? "").toLowerCase().includes(q),
        );
        if (!rows.length) return null;
        return {
          ...m,
          rows,
          totalQuantidade: rows.reduce((s, r) => s + r.quantidade, 0),
          totalValor: rows.reduce((s, r) => s + r.valorTotal, 0),
        };
      })
      .filter((m): m is MaterialComSaldo => m !== null);
  }, [materiais, query]);

  const totals = useMemo(() => {
    const nMateriais = filtered.length;
    const nLinhas = filtered.reduce((s, m) => s + m.rows.length, 0);
    const valorTotal = filtered.reduce((s, m) => s + m.totalValor, 0);
    return { nMateriais, nLinhas, valorTotal };
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
          <PackageSearch className="w-7 h-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-foreground">Nenhum saldo pendente</p>
        <p className="text-xs text-muted-foreground mt-1">
          {query
            ? "Nenhum material corresponde à busca."
            : "Todos os pedidos confirmados já foram totalmente entregues."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Contadores */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-1 font-medium">
          {totals.nMateriais} {totals.nMateriais === 1 ? "material" : "materiais"}
        </span>
        <span className="inline-flex items-center rounded-full bg-info/10 text-info px-2.5 py-1 font-medium">
          {totals.nLinhas} {totals.nLinhas === 1 ? "linha" : "linhas"}
        </span>
        <span className="inline-flex items-center rounded-full bg-success/10 text-success px-2.5 py-1 font-semibold">
          {formatBRL(totals.valorTotal)} a entregar
        </span>
      </div>

      {filtered.map((m) => (
        <div
          key={m.id}
          className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
        >
          {/* Cabeçalho do material */}
          <div className="flex items-center gap-3 px-5 py-3 bg-muted border-b border-border">
            <span className="font-semibold text-foreground flex-1 truncate">
              {m.descricao}{" "}
              <span className="text-muted-foreground font-normal">{m.codigo}</span>
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {numberFmt.format(m.totalQuantidade)} {m.unidade}
            </span>
            <span className="text-sm font-semibold text-success">
              {formatBRL(m.totalValor)}
            </span>
          </div>

          {/* Tabela (rola na horizontal em telas estreitas) */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-28">Data</th>
                  <th className="text-left font-medium px-3 py-2 w-24">Ped.</th>
                  <th className="text-left font-medium px-3 py-2">Cliente</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Qnt.</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Valor</th>
                  <th className="text-right font-medium px-3 py-2 w-32">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {m.rows.map((r, i) => (
                  <tr key={`${r.pedidoId}-${i}`}>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatDate(r.dataEmissao)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-foreground">{r.numero}</span>
                      {r.numeroOrcamento && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          Orç. {r.numeroOrcamento}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground truncate max-w-[260px]">
                      {r.clienteNome}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-info whitespace-nowrap">
                      {numberFmt.format(r.quantidade)} {m.unidade}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatBRL(r.valorUnitario)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                      {formatBRL(r.valorTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted border-t border-border">
                <tr>
                  <td
                    className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    colSpan={3}
                  >
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-foreground whitespace-nowrap">
                    {numberFmt.format(m.totalQuantidade)} {m.unidade}
                  </td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-success whitespace-nowrap">
                    {formatBRL(m.totalValor)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
