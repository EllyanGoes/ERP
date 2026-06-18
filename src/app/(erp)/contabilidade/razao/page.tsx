"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { linkOrigemLancamento } from "@/lib/origem-link";
import PrintButton from "@/components/shared/PrintButton";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { formatDate, cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, fmtColuna, saldoAnormal, type NaturezaConta } from "@/lib/formato-contabil";
import { Loader2, BookOpen } from "lucide-react";

type FlatConta = { id: string; codigo: string; nome: string };
type Mov = {
  data: string; historico: string; origemTipo: string; origemId: string | null; criadoPor: string | null;
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
          <div className="ml-auto flex items-center gap-2"><FormatoToggle modo={modo} onChange={setModo} /><PrintButton /></div>
        </div>

        {!contaId ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <BookOpen className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-medium">Selecione uma conta para ver o razão</p>
            <p className="text-xs mt-1">Contas sintéticas agregam as analíticas (razão auxiliar).</p>
          </div>
        ) : loading || !razao ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between">
              <span className="font-semibold text-foreground">
                <span className="font-mono text-xs text-muted-foreground mr-2">{razao.conta.codigo}</span>{razao.conta.nome}
                <span className="ml-2 text-xs text-muted-foreground">({razao.conta.natureza === "DEVEDORA" ? "Devedora" : "Credora"})</span>
              </span>
              <span className="text-sm text-muted-foreground">Saldo anterior: <b className="text-foreground tabular-nums">{fmtSaldo(razao.saldoInicial, modo, razao.conta.natureza as NaturezaConta)}</b></span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
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
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Sem movimentos no período</td></tr>
                ) : razao.movimentos.map((m, i) => {
                  const href = linkOrigemLancamento(m.origemTipo, m.origemId);
                  return (
                  <tr key={i} className="hover:bg-muted">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatDate(m.data)}</td>
                    <td className="px-4 py-2 text-foreground">
                      {href ? (
                        <Link href={href} className="inline-flex items-center gap-1 text-info hover:underline" title="Abrir processo de origem">
                          {m.historico}<ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                      ) : m.historico}
                      {razao.conta.tipo === "SINTETICA" && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">[{m.contaCodigo}]</span>}
                      {m.origemTipo === "MANUAL" ? (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-500/15 text-purple-500" title={m.criadoPor ? `Manual — ${m.criadoPor}` : "Manual"}>
                          manual{m.criadoPor ? ` · ${m.criadoPor}` : ""}
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title="Lançamento automático">auto</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {m.contrapartidas.length === 0 ? <span className="text-muted-foreground/60">—</span> : (
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {m.contrapartidas.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setContaId(c.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                              className="inline-flex items-center gap-1 text-info hover:underline"
                              title={`Abrir razão de ${c.codigo} ${c.nome}`}
                            >
                              <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span> {c.nome}
                            </button>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-info">{fmtColuna(m.debito, modo)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-warning">{fmtColuna(m.credito, modo)}</td>
                    <td className={cn("px-4 py-2 text-right tabular-nums font-medium", saldoAnormal(m.saldo) ? "text-danger" : "text-foreground")}>{fmtSaldo(m.saldo, modo, razao.conta.natureza as NaturezaConta)}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted">
                <tr className="font-bold text-foreground tabular-nums">
                  <td className="px-4 py-2.5" colSpan={3}>Saldo final</td>
                  <td className="px-4 py-2.5 text-right text-info">{fmtColuna(razao.movimentos.reduce((s, m) => s + m.debito, 0), modo)}</td>
                  <td className="px-4 py-2.5 text-right text-warning">{fmtColuna(razao.movimentos.reduce((s, m) => s + m.credito, 0), modo)}</td>
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
