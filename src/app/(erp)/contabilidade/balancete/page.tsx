"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatDate } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, fmtColuna, saldoAnormal, type NaturezaConta } from "@/lib/formato-contabil";
import { useSession } from "@/lib/session-context";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import { useCachedData } from "@/lib/use-cached-data";
import { Loader2, Scale, Check, X, ChevronRight, ChevronDown, FileDown } from "lucide-react";

type Linha = {
  id: string; codigo: string; nome: string; tipo: "SINTETICA" | "ANALITICA"; natureza: NaturezaConta; nivel: number;
  saldoAnterior: number; debito: number; credito: number; saldoFinal: number;
};

const COLLAPSE_KEY = "contabilidade:balancete:collapsed";

function defaultRange(): DateRange {
  const h = new Date();
  return { from: new Date(h.getFullYear(), 0, 1).toISOString().slice(0, 10), to: h.toISOString().slice(0, 10) };
}

export default function BalancetePage() {
  useTabTitle("Balancete");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [soComMov, setSoComMov] = useState(true);
  const [modo, setModo] = useFormatoContabil();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { const raw = localStorage.getItem(COLLAPSE_KEY); if (raw) setCollapsed(new Set(JSON.parse(raw) as string[])); } catch { /* ignore */ }
  }, []);
  const persist = useCallback((next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((codigo: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo); else next.add(codigo);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Cache stale-while-revalidate por período — reabrir não recarrega.
  const { data: resp, loading } = useCachedData<{ linhas: Linha[]; totalDebito: number; totalCredito: number; confere: boolean }>(
    range.from && range.to ? `balancete:${range.from}:${range.to}` : null,
    () => fetch(`/api/contabilidade/balancete?from=${range.from}&to=${range.to}`).then((r) => r.json()),
  );
  const linhas = useMemo(() => resp?.linhas ?? [], [resp]);
  const resumo = { totalDebito: resp?.totalDebito ?? 0, totalCredito: resp?.totalCredito ?? 0, confere: resp?.confere ?? true };

  const comMov = useMemo(
    () => soComMov ? linhas.filter((l) => l.debito !== 0 || l.credito !== 0 || l.saldoAnterior !== 0 || l.saldoFinal !== 0) : linhas,
    [linhas, soComMov],
  );
  const temFilhos = useCallback((l: Linha) => comMov.some((x) => x.codigo.startsWith(l.codigo + ".")), [comMov]);
  const visiveis = useMemo(
    () => comMov.filter((l) => !Array.from(collapsed).some((c) => l.codigo.startsWith(c + "."))),
    [comMov, collapsed],
  );

  const recolherTudo = useCallback(() => persist(new Set(comMov.filter((l) => temFilhos(l)).map((l) => l.codigo))), [comMov, temFilhos, persist]);
  const expandirTudo = useCallback(() => persist(new Set()), [persist]);

  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? null;

  function baixarPdf() {
    const linhas: LinhaPdf[] = visiveis.map((l) => ({
      estilo: l.tipo === "SINTETICA" ? "secao" : "normal",
      celulas: [
        l.codigo,
        `${"   ".repeat(Math.max(0, l.nivel - 1))}${l.nome}`,
        fmtSaldo(l.saldoAnterior, modo, l.natureza),
        fmtColuna(l.debito, modo) || "—",
        fmtColuna(l.credito, modo) || "—",
        fmtSaldo(l.saldoFinal, modo, l.natureza),
      ],
    }));
    linhas.push({ estilo: "total", celulas: ["", "Totais do período", "", fmtColuna(resumo.totalDebito, modo), fmtColuna(resumo.totalCredito, modo), ""] });
    gerarPdfContabil({
      titulo: "Balancete de Verificação",
      empresa: empresaNome,
      subinfo: [
        `Período: ${formatDate(range.from)} a ${formatDate(range.to)}`,
        `Formato: ${modo === "contabil" ? "Contábil" : "Real"} · ${resumo.confere ? "Confere (Σ débito = Σ crédito)" : "Não fecha!"}`,
      ],
      head: ["Código", "Conta", "Saldo Ant.", "Débito", "Crédito", "Saldo Atual"],
      linhas,
      alinharDireitaDe: 2,
      arquivo: `balancete-${range.from}-a-${range.to}.pdf`,
    });
  }

  return (
    <div>
      <PageHeader title="Balancete de Verificação" breadcrumbs={[{ label: "Contabilidade" }, { label: "Balancete" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap no-print">
          <DateRangePicker value={range} onChange={setRange} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={soComMov} onChange={(e) => setSoComMov(e.target.checked)} className="w-4 h-4 rounded border-border text-info" />
            Só contas com movimento/saldo
          </label>
          <button type="button" onClick={recolherTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">Recolher tudo</button>
          <button type="button" onClick={expandirTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">Expandir tudo</button>
          <FormatoToggle modo={modo} onChange={setModo} />
          <button type="button" onClick={baixarPdf}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted">
            <FileDown className="w-4 h-4" /> Baixar PDF
          </button>
          <span className={cn("ml-auto inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg",
            resumo.confere ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
            {resumo.confere ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {resumo.confere ? "Confere (Σ débito = Σ crédito)" : "Não fecha!"}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl print-area">
            <div className="grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-2.5 border-b border-border bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 z-10">
              <span>Conta</span>
              <span className="text-right">Saldo Ant.</span>
              <span className="text-right">Débito</span>
              <span className="text-right">Crédito</span>
              <span className="text-right">Saldo Atual</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
            ) : visiveis.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm"><Scale className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />Sem movimento no período</div>
            ) : (
              <>
                {visiveis.map((l) => {
                  const filhos = temFilhos(l);
                  const recolhido = collapsed.has(l.codigo);
                  return (
                    <div key={l.id} className={cn(
                      "grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-1.5 border-b border-gray-50 text-sm tabular-nums",
                      l.tipo === "SINTETICA" ? "bg-muted/40 font-semibold text-foreground" : "text-foreground",
                    )}>
                      <span className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }}>
                        {filhos ? (
                          <button type="button" onClick={() => toggle(l.codigo)} className="text-muted-foreground hover:text-foreground shrink-0" title={recolhido ? "Expandir" : "Recolher"}>
                            {recolhido ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        ) : <span className="w-4 shrink-0" />}
                        <Link href={`/contabilidade/razao/${l.id}?from=${range.from}&to=${range.to}`} className="flex items-center gap-2 min-w-0 hover:text-info" title="Abrir razão em nova aba">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">{l.codigo}</span>
                          <span className="truncate">{l.nome}</span>
                        </Link>
                      </span>
                      <span className={cn("text-right", saldoAnormal(l.saldoAnterior) && "text-danger font-medium")}>{fmtSaldo(l.saldoAnterior, modo, l.natureza)}</span>
                      <span className="text-right text-info">{fmtColuna(l.debito, modo) || <span className="text-muted-foreground/60">—</span>}</span>
                      <span className="text-right text-warning">{fmtColuna(l.credito, modo) || <span className="text-muted-foreground/60">—</span>}</span>
                      <span className={cn("text-right font-medium", saldoAnormal(l.saldoFinal) ? "text-danger" : "text-foreground")}>{fmtSaldo(l.saldoFinal, modo, l.natureza)}</span>
                    </div>
                  );
                })}
                <div className="grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-2.5 border-t-2 border-border bg-muted text-sm font-bold tabular-nums sticky bottom-0">
                  <span>Totais do período</span>
                  <span />
                  <span className="text-right text-info">{fmtColuna(resumo.totalDebito, modo)}</span>
                  <span className="text-right text-warning">{fmtColuna(resumo.totalCredito, modo)}</span>
                  <span />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
