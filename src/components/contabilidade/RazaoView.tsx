"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { linkOrigemLancamento } from "@/lib/origem-link";
import { useSession } from "@/lib/session-context";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import ContaContabilCombobox from "@/components/contabilidade/ContaContabilCombobox";
import RazaoLauncher from "@/components/contabilidade/RazaoLauncher";
import BackfillConsistencia from "@/components/contabilidade/BackfillConsistencia";
import { useCachedData } from "@/lib/use-cached-data";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useTabTitle } from "@/lib/tabs-context";
import { formatDate, cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, fmtColuna, saldoAnormal, type NaturezaConta } from "@/lib/formato-contabil";
import { Loader2, FileDown } from "lucide-react";

type FlatConta = { id: string; codigo: string; nome: string; paiId: string | null };
type Mov = {
  lancamentoId: string; numero: string | null; data: string; historico: string; origemTipo: string; origemId: string | null; criadoPor: string | null;
  contaCodigo: string; contaNome: string;
  contrapartidas: { id: string; codigo: string; nome: string }[];
  debito: number; credito: number; saldo: number;
};
type Razao = {
  conta: { codigo: string; nome: string; natureza: string; tipo: string };
  saldoInicial: number; movimentos: Mov[]; saldoFinal: number;
};

function defaultRange(): DateRange {
  const h = new Date();
  return { from: new Date(h.getFullYear(), 0, 1).toISOString().slice(0, 10), to: h.toISOString().slice(0, 10) };
}

// Razão de UMA conta. Roteável por conta (/contabilidade/razao/[contaId]) — assim
// cada conta abre numa ABA própria do sistema; o seletor e as contrapartidas
// abrem outras abas (navegando para outra rota).
export default function RazaoView({ contaId: contaIdProp }: { contaId?: string | null }) {
  const router = useRouter();
  const [contas, setContas] = useState<FlatConta[]>([]);
  // Compat: links antigos chegam como /contabilidade/razao?contaId=&from=&to=
  const [urlContaId, setUrlContaId] = useState<string | null>(null);
  const contaId = contaIdProp ?? urlContaId;

  // Filtro de período persistido (mesmo padrão do Balancete): lido no 1º render.
  const [range, setRange] = usePersistedState<DateRange>("contabilidade:razao:range", defaultRange);
  const [modo, setModo] = useFormatoContabil();
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  useEffect(() => {
    fetch("/api/contabilidade/plano-contas").then((r) => r.json()).then((j) => setContas(j.flat ?? []));
  }, []);

  // Período da URL (click-through) tem prioridade sobre o filtro salvo — que já
  // foi lido no 1º render pelo usePersistedState.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cId = sp.get("contaId");
    const from = sp.get("from");
    const to = sp.get("to");
    if (cId && !contaIdProp) setUrlContaId(cId);
    if (from || to) setRange((r) => ({ from: from || r.from, to: to || r.to }));
  }, [contaIdProp]);

  // Caminho da conta: "Pai › Conta" (ex.: "Clientes a Receber › Cimento e Mix").
  const byId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const tituloDaConta = useCallback((id: string) => {
    const c = byId.get(id);
    if (!c) return null;
    const pai = c.paiId ? byId.get(c.paiId) : undefined;
    return pai ? `${pai.nome} › ${c.nome}` : c.nome;
  }, [byId]);
  // Cache stale-while-revalidate: reabrir uma conta já vista mostra na hora, sem
  // recarregar (revalida em segundo plano).
  const razaoKey = contaId && range.from && range.to ? `razao:${contaId}:${range.from}:${range.to}` : null;
  const { data: razao, loading, refetch } = useCachedData<Razao>(razaoKey, async () => {
    const j = await fetch(`/api/contabilidade/razao?contaId=${contaId}&from=${range.from}&to=${range.to}`).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return j;
  }, { ttlMs: 60_000 }); // não revalida a cada reabertura de aba dentro de 1 min (evita "recarregar" os títulos)

  const titulo = (contaId && tituloDaConta(contaId)) || (razao ? razao.conta.nome : null);
  useTabTitle(titulo ? `Razão · ${titulo}` : "Razão");

  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? null;

  // Abre a conta em OUTRA aba (rota por conta). Carrega o período no link.
  function abrir(id: string) {
    if (!id) return;
    const { from, to } = rangeRef.current;
    router.push(`/contabilidade/razao/${id}?from=${from}&to=${to}`);
  }

  function baixarPdf() {
    if (!razao) return;
    const nat = razao.conta.natureza as NaturezaConta;
    const sintetica = razao.conta.tipo === "SINTETICA";
    const linhas: LinhaPdf[] = [
      { estilo: "secao", celulas: ["", "", "Saldo anterior", "", "", "", fmtSaldo(razao.saldoInicial, modo, nat)] },
    ];
    for (const m of razao.movimentos) {
      const contrap = m.contrapartidas.map((c) => `${c.codigo} ${c.nome}`).join("; ") || "—";
      linhas.push({
        celulas: [
          formatDate(m.data), m.numero ?? "—",
          `${m.historico}${sintetica ? ` [${m.contaCodigo}]` : ""}`, contrap,
          fmtColuna(m.debito, modo), fmtColuna(m.credito, modo), fmtSaldo(m.saldo, modo, nat),
        ],
      });
    }
    linhas.push({
      estilo: "total",
      celulas: ["", "", "Saldo final", "",
        fmtColuna(razao.movimentos.reduce((s, m) => s + m.debito, 0), modo),
        fmtColuna(razao.movimentos.reduce((s, m) => s + m.credito, 0), modo),
        fmtSaldo(razao.saldoFinal, modo, nat)],
    });
    gerarPdfContabil({
      titulo: "Razão",
      empresa: empresaNome,
      subinfo: [
        `Conta: ${razao.conta.codigo} — ${titulo ?? razao.conta.nome} (${nat === "DEVEDORA" ? "Devedora" : "Credora"})`,
        `Período: ${formatDate(range.from)} a ${formatDate(range.to)} · Formato: ${modo === "contabil" ? "Contábil" : "Real"}`,
      ],
      head: ["Data", "Lançamento", "Descrição", "Contrapartida", "Débito", "Crédito", "Saldo"],
      linhas, alinharDireitaDe: 4,
      arquivo: `razao-${razao.conta.codigo}-${range.from}-a-${range.to}.pdf`,
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sem PageHeader (título/breadcrumb): o razão ganha a tela inteira — os
          controles moram numa única barra, como na tela de Ordens do PCP. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-4 pb-8 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* O seletor de cima só aparece na aba de uma conta — na tela de
              abertura o lançador abaixo já tem busca. */}
          {contaId && (
            <div className="w-[30rem] max-w-full">
              <ContaContabilCombobox
                value={contaId}
                onChange={(id) => abrir(id)}
                contas={contas}
              />
            </div>
          )}
          <DateRangePicker value={range} onChange={setRange} />
          <div className="ml-auto flex items-center gap-2">
            <FormatoToggle modo={modo} onChange={setModo} />
            <button type="button" onClick={baixarPdf} disabled={!razao}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
              <FileDown className="w-4 h-4" /> Baixar PDF
            </button>
            <BackfillConsistencia compact onDone={refetch} />
          </div>
        </div>

        {!contaId ? (
          <RazaoLauncher contas={contas} range={range} />
        ) : loading || !razao ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between gap-3">
              <span className="font-semibold text-foreground min-w-0 truncate">
                <span className="font-mono text-xs text-muted-foreground mr-2">{razao.conta.codigo}</span>
                {titulo ?? razao.conta.nome}
                <span className="ml-2 text-xs text-muted-foreground">({razao.conta.natureza === "DEVEDORA" ? "Devedora" : "Credora"})</span>
              </span>
              <span className="text-sm text-muted-foreground shrink-0">Saldo anterior: <b className="text-foreground tabular-nums">{fmtSaldo(razao.saldoInicial, modo, razao.conta.natureza as NaturezaConta)}</b></span>
            </div>
            <div className="overflow-auto max-h-[calc(100vh-215px)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border text-xs text-muted-foreground uppercase tracking-wide [&>tr>th]:bg-muted">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold w-24">Data</th>
                    <th className="text-left px-4 py-2 font-semibold w-28">Lançamento</th>
                    <th className="text-left px-4 py-2 font-semibold">Descrição</th>
                    <th className="text-left px-4 py-2 font-semibold w-56">Contrapartida</th>
                    <th className="text-right px-4 py-2 font-semibold w-28">Débito</th>
                    <th className="text-right px-4 py-2 font-semibold w-28">Crédito</th>
                    <th className="text-right px-4 py-2 font-semibold w-32">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {razao.movimentos.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Sem movimentos no período</td></tr>
                  ) : razao.movimentos.map((m, i) => {
                    const href = linkOrigemLancamento(m.origemTipo, m.origemId);
                    return (
                    <tr key={i} className="hover:bg-muted">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link href={`/contabilidade/lancamentos?focus=${m.lancamentoId}`} className="text-muted-foreground hover:text-info hover:underline" title="Ver lançamento no Diário">
                          {formatDate(m.data)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{m.numero ?? "—"}</td>
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
                                onClick={() => abrir(c.id)}
                                className="inline-flex items-center gap-1 text-info hover:underline"
                                title={`Abrir razão de ${c.codigo} ${c.nome} em outra aba`}
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
                <tfoot className="sticky bottom-0 z-10 border-t-2 border-border [&>tr>td]:bg-muted">
                  <tr className="font-bold text-foreground tabular-nums">
                    <td className="px-4 py-2.5" colSpan={4}>Saldo final</td>
                    <td className="px-4 py-2.5 text-right text-info">{fmtColuna(razao.movimentos.reduce((s, m) => s + m.debito, 0), modo)}</td>
                    <td className="px-4 py-2.5 text-right text-warning">{fmtColuna(razao.movimentos.reduce((s, m) => s + m.credito, 0), modo)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtSaldo(razao.saldoFinal, modo, razao.conta.natureza as NaturezaConta)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
