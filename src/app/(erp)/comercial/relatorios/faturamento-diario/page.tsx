"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL } from "@/lib/utils";
import { Loader2, FileText, Wallet, CreditCard } from "lucide-react";

type ItemRow = { codigo: string; descricao: string; unidade: string; quantidade: number; valor: number };
type Row = {
  id: string;
  numero: string;
  data: string | null;
  clienteNome: string;
  valorTotal: number;
  formaPagamento: string;
  contas: string[];
  itens: ItemRow[];
};

function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function diaLabel(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function qtd(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export default function FaturamentoDiarioPage() {
  useTabTitle("Resumo Diário");
  const router = useRouter();

  const [range, setRange] = useState<DateRange>(() => ({ from: hojeISO(), to: hojeISO() }));
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!from || !to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/comercial/relatorios/faturamento-diario?from=${from}&to=${to}`);
      const json = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (range.from && range.to) load(); }, [range.from, range.to, load]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Resumo de Faturamento Diário"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Relatórios" }, { label: "Resumo Diário" }]}
      />

      <div className="px-8 pb-8 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <span className="text-xs text-gray-400">
            Pedidos faturados (concluídos) no período, com itens, forma de pagamento e conta de recebimento.
          </span>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <FileText className="w-4 h-4" /> Pedidos
            </div>
            <div className="mt-1.5 text-xl font-bold text-gray-900 tabular-nums">{rows.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-1 sm:col-span-2">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <Wallet className="w-4 h-4" /> Total faturado
            </div>
            <div className="mt-1.5 text-xl font-bold text-emerald-700 tabular-nums">{formatBRL(total)}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum pedido faturado no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Pedido</th>
                    <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                    <th className="text-left px-5 py-3 font-semibold">Itens do Pedido</th>
                    <th className="text-right px-5 py-3 font-semibold">Valor Total</th>
                    <th className="text-left px-5 py-3 font-semibold">Forma de Pagamento</th>
                    <th className="text-left px-5 py-3 font-semibold">Conta de Recebimento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors align-top"
                      onClick={() => router.push(`/pedidos-venda/${r.id}`)}
                      title="Abrir pedido de venda"
                    >
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-blue-600">{r.numero}</span>
                        <div className="text-[11px] text-gray-400 mt-0.5">{diaLabel(r.data)}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-800">{r.clienteNome}</td>
                      <td className="px-5 py-3 text-gray-600">
                        <ul className="space-y-0.5">
                          {r.itens.map((it, i) => (
                            <li key={i} className="text-xs">
                              <span className="text-gray-400 tabular-nums">{qtd(it.quantidade)}{it.unidade ? ` ${it.unidade}` : ""}</span>
                              {" · "}{it.descricao}
                            </li>
                          ))}
                          {r.itens.length === 0 && <li className="text-xs text-gray-300">—</li>}
                        </ul>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatBRL(r.valorTotal)}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                          {r.formaPagamento}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {r.contas.length > 0 ? r.contas.join(", ") : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Total</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">{formatBRL(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
