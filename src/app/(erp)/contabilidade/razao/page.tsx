"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { linkOrigemLancamento } from "@/lib/origem-link";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { formatDate, cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, fmtColuna, saldoAnormal, type NaturezaConta } from "@/lib/formato-contabil";
import { Loader2, BookOpen } from "lucide-react";

type FlatConta = { id: string; codigo: string; nome: string };
type Mov = {
  data: string; historico: string; origemTipo: string; origemId: string | null;
  contaCodigo: string; contaNome: string;
  contrapartidas: { id: string; codigo: string; nome: string }[];
  debito: number; credito: number; saldo: number;
};

const CONTA_KEY = "contabilidade:razao:contaId";
type Razao = {
  conta: { codigo: string; nome: string; natureza: string; tipo: string };
  saldoInicial: number; movimentos: Mov[]; saldoFinal: number;
};

function defaultRange(): DateRange {
  // Ano corrente (1º jan → hoje) — para a atividade das analíticas aparecer.
  const h = new Date();
  return { from: new Date(h.getFullYear(), 0, 1).toISOString().slice(0, 10), to: h.toISOString().slice(0, 10) };
}

export default function RazaoPage() {
  useTabTitle("Razão");
  const [contas, setContas] = useState<FlatConta[]>([]);
  const [contaId, setContaId] = useState("");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [razao, setRazao] = useState<Razao | null>(null);
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useFormatoContabil();
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  useEffect(() => {
    fetch("/api/contabilidade/plano-contas").then((r) => r.json()).then((j) => setContas(j.flat ?? []));
  }, []);

  // Click-through (?contaId=&from=&to=) tem prioridade; senão, restaura a última
  // conta selecionada (persistida ao trocar de página).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cId = sp.get("contaId");
    const from = sp.get("from");
    const to = sp.get("to");
    if (cId) setContaId(cId);
    else { try { const saved = localStorage.getItem(CONTA_KEY); if (saved) setContaId(saved); } catch { /* ignore */ } }
    if (from || to) setRange((r) => ({ from: from || r.from, to: to || r.to }));
  }, []);

  // Persiste a conta selecionada (sobrevive à navegação entre páginas).
  useEffect(() => {
    try { if (contaId) localStorage.setItem(CONTA_KEY, contaId); } catch { /* ignore */ }
  }, [contaId]);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!contaId || !from || !to) { setRazao(null); return; }
    setLoading(true);
    try {
      const j = await fetch(`/api/contabilidade/razao?contaId=${contaId}&from=${from}&to=${to}`).then((r) => r.json());
      setRazao(j.error ? null : j);
    } finally { setLoading(false); }
  }, [contaId]);

  useEffect(() => { load(); }, [contaId, range.from, range.to, load]);

  return (
    <div>
      <PageHeader title="Razão" breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "Razão" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-[28rem] max-w-full">
            <ComboboxWithCreate
              value={contaId}
              onChange={setContaId}
              placeholder="Selecione a conta..."
              triggerClassName="h-10 rounded-lg"
              options={contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
            />
          </div>
          <DateRangePicker value={range} onChange={setRange} />
          <div className="ml-auto"><FormatoToggle modo={modo} onChange={setModo} /></div>
        </div>

        {!contaId ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium">Selecione uma conta para ver o razão</p>
            <p className="text-xs mt-1">Contas sintéticas agregam as analíticas (razão auxiliar).</p>
          </div>
        ) : loading || !razao ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                <span className="font-mono text-xs text-gray-500 mr-2">{razao.conta.codigo}</span>{razao.conta.nome}
                <span className="ml-2 text-xs text-gray-400">({razao.conta.natureza === "DEVEDORA" ? "Devedora" : "Credora"})</span>
              </span>
              <span className="text-sm text-gray-500">Saldo anterior: <b className="text-gray-800 tabular-nums">{fmtSaldo(razao.saldoInicial, modo, razao.conta.natureza as NaturezaConta)}</b></span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold w-24">Data</th>
                  <th className="text-left px-4 py-2 font-semibold">Histórico</th>
                  <th className="text-left px-4 py-2 font-semibold w-56">Contrapartida</th>
                  <th className="text-right px-4 py-2 font-semibold w-28">Débito</th>
                  <th className="text-right px-4 py-2 font-semibold w-28">Crédito</th>
                  <th className="text-right px-4 py-2 font-semibold w-32">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {razao.movimentos.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Sem movimentos no período</td></tr>
                ) : razao.movimentos.map((m, i) => {
                  const href = linkOrigemLancamento(m.origemTipo, m.origemId);
                  return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatDate(m.data)}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {href ? (
                        <Link href={href} className="inline-flex items-center gap-1 text-blue-600 hover:underline" title="Abrir processo de origem">
                          {m.historico}<ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                      ) : m.historico}
                      {razao.conta.tipo === "SINTETICA" && <span className="ml-1.5 font-mono text-[11px] text-gray-400">[{m.contaCodigo}]</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {m.contrapartidas.length === 0 ? <span className="text-gray-300">—</span> : (
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {m.contrapartidas.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setContaId(c.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              title={`Abrir razão de ${c.codigo} ${c.nome}`}
                            >
                              <span className="font-mono text-[11px] text-gray-400">{c.codigo}</span> {c.nome}
                            </button>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-blue-700">{fmtColuna(m.debito, modo)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-700">{fmtColuna(m.credito, modo)}</td>
                    <td className={cn("px-4 py-2 text-right tabular-nums font-medium", saldoAnormal(m.saldo) ? "text-red-600" : "text-gray-900")}>{fmtSaldo(m.saldo, modo, razao.conta.natureza as NaturezaConta)}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr className="font-bold text-gray-900 tabular-nums">
                  <td className="px-4 py-2.5" colSpan={3}>Saldo final</td>
                  <td className="px-4 py-2.5 text-right text-blue-700">{fmtColuna(razao.movimentos.reduce((s, m) => s + m.debito, 0), modo)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{fmtColuna(razao.movimentos.reduce((s, m) => s + m.credito, 0), modo)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtSaldo(razao.saldoFinal, modo, razao.conta.natureza as NaturezaConta)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
