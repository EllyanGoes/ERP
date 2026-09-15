"use client";

import { Fragment, useState } from "react";
import LancamentosDrePopup, { type AlvoLancamentos } from "@/components/contabilidade/LancamentosDrePopup";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import BackfillConsistencia from "@/components/contabilidade/BackfillConsistencia";
import { useCachedData } from "@/lib/use-cached-data";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtColuna } from "@/lib/formato-contabil";
import { useSession } from "@/lib/session-context";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import { Loader2, FileBarChart, SlidersHorizontal, FileDown, Database, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";

type LinhaConta = { id: string; codigo: string; nome: string; meses: number[]; total: number; subgrupoCodigo: string | null; subgrupoNome: string | null; filhos?: LinhaConta[] };
type Secao = { id: string; nome: string; operacao: "SOMA" | "SUBTRAI" | "SUBTOTAL"; contas: LinhaConta[]; meses: number[]; total: number };
type Fonte = "erp" | "dexion";
type Dre = { ano: number; fonte?: Fonte; secoes: Secao[]; resultadoMeses: number[]; resultadoTotal: number; codigoDexion?: number; atualizadoEm?: string; erroAtualizacao?: string | null; error?: string };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function celula(v: number, modo: "contabil" | "real") {
  if (Math.abs(v) < 0.005) return <span className="text-muted-foreground/60">—</span>;
  return <span className={v < 0 ? "text-danger" : ""}>{fmtColuna(v, modo)}</span>;
}

// Número clicável: abre o popup com os lançamentos que compõem a célula.
function Cel({ v, modo, onClick, className }: { v: number; modo: "contabil" | "real"; onClick?: () => void; className?: string }) {
  const vazio = Math.abs(v) < 0.005;
  return (
    <td className={cn("text-right", className)}>
      {vazio || !onClick ? celula(v, modo) : (
        <button type="button" onClick={onClick} className="hover:underline decoration-dotted underline-offset-2 hover:text-info" title="Ver lançamentos">
          {celula(v, modo)}
        </button>
      )}
    </td>
  );
}

export default function DrePage() {
  useTabTitle("DRE");
  // Exercício SEMPRE no ano corrente ao abrir (não persiste).
  const [ano, setAno] = useState<number>(() => new Date().getUTCFullYear());
  const [modo, setModo] = useFormatoContabil();
  // Origem dos dados: contabilidade do ERP ou a do contador (Dexion). Persiste por usuário.
  const [fonte, setFonte] = usePersistedState<Fonte>("contabilidade:dre:fonte", "erp");
  // Cache stale-while-revalidate por ano+origem — reabrir não recarrega.
  const { data: dre, loading, refetch } = useCachedData<Dre>(
    `dre:${fonte}:${ano}`,
    () => fetch(`/api/contabilidade/dre?ano=${ano}&fonte=${fonte}`).then((r) => r.json()),
  );
  const erroDre = dre && !dre.secoes ? (dre.error || "Não foi possível montar a DRE.") : null;
  const [atualizando, setAtualizando] = useState(false);
  // Popup de lançamentos da célula clicada.
  const [alvo, setAlvo] = useState<AlvoLancamentos | null>(null);
  // Força a releitura no Firebird do contador (o cache no ERP vale 12h) e recarrega.
  async function atualizarDexion() {
    setAtualizando(true);
    try { await fetch(`/api/contabilidade/dre?ano=${ano}&fonte=dexion&atualizar=1`); } catch { /* o refetch mostra o erro */ }
    await refetch();
    setAtualizando(false);
  }
  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? null;

  function baixarPdf() {
    if (!dre) return;
    const celMes = (v: number) => (Math.abs(v) < 0.005 ? "" : fmtColuna(v, modo));
    const linhas: LinhaPdf[] = [];
    for (const s of dre.secoes) {
      if (s.operacao === "SUBTOTAL") {
        linhas.push({ estilo: "total", celulas: [`= ${s.nome}`, ...s.meses.map(celMes), fmtColuna(s.total, modo)] });
        continue;
      }
      linhas.push({ estilo: "secao", celulas: [`${s.nome} (${s.operacao === "SUBTRAI" ? "−" : "+"})`, ...s.meses.map(celMes), celMes(s.total)] });
      const subtotais = subtotaisDoSubgrupo(s.contas);
      let ultimoSub: string | null = null;
      for (const c of s.contas) {
        if (c.subgrupoCodigo && c.subgrupoCodigo !== ultimoSub) {
          const st = subtotais.get(c.subgrupoCodigo);
          if (st) linhas.push({ estilo: "secao", celulas: [`  ${c.subgrupoCodigo}  ${st.nome}`, ...st.meses.map(celMes), celMes(st.total)] });
        }
        ultimoSub = c.subgrupoCodigo;
        linhas.push({ celulas: [`${c.subgrupoCodigo ? "    " : ""}${c.codigo}  ${c.nome}`, ...c.meses.map(celMes), celMes(c.total)] });
      }
    }
    linhas.push({ estilo: "total", celulas: ["Resultado do Exercício", ...dre.resultadoMeses.map(celMes), fmtColuna(dre.resultadoTotal, modo)] });
    gerarPdfContabil({
      titulo: "DRE — Demonstração do Resultado",
      empresa: empresaNome,
      subinfo: [`Exercício: ${dre.ano}`, `Origem: ${fonte === "dexion" ? "Dexion (contador)" : "ERP"}`, `Formato: ${modo === "contabil" ? "Contábil" : "Real"}`],
      head: ["Conta", ...MESES, "Total"],
      linhas,
      alinharDireitaDe: 1,
      orientacao: "l",
      arquivo: `dre-${dre.ano}.pdf`,
    });
  }


  return (
    <div>
      <PageHeader title="DRE" breadcrumbs={[{ label: "Contabilidade" }, { label: "DRE" }]} />
      <div className="px-8 pb-8 space-y-4">
        <BackfillConsistencia onDone={refetch} />
        <div className="flex items-center gap-3 flex-wrap no-print">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Exercício
            <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="h-10 rounded-lg border border-border px-3 text-sm bg-card">
              {Array.from({ length: 6 }).map((_, i) => { const y = new Date().getUTCFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </label>
          {/* Origem: ERP × Dexion (contador) */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm" title="Origem dos dados da DRE">
            {([["erp", "ERP"], ["dexion", "Dexion (contador)"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFonte(k)}
                className={cn("px-3 py-2 inline-flex items-center gap-1.5 font-medium transition-colors", fonte === k ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
              >
                {k === "dexion" ? <Database className="w-4 h-4" /> : <FileBarChart className="w-4 h-4" />} {label}
              </button>
            ))}
          </div>
          <Link href="/contabilidade/dre/estrutura" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted">
            <SlidersHorizontal className="w-4 h-4" /> Editar estrutura
          </Link>
          <FormatoToggle modo={modo} onChange={setModo} />
          <button type="button" onClick={baixarPdf} disabled={!dre}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
            <FileDown className="w-4 h-4" /> Baixar PDF
          </button>
        </div>

        {fonte === "dexion" && dre?.secoes && (
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground no-print">
            <span className="inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> Contabilidade do contador (Dexion, empresa {dre.codigoDexion}), nas seções da sua estrutura de DRE. Linhas são os grupos do plano do contador e não abrem razão.
            </span>
            {dre.atualizadoEm && <span>Dados de {new Date(dre.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.</span>}
            {dre.erroAtualizacao && <span className="text-warning" title={dre.erroAtualizacao}>Dexion indisponível, mostrando o cache.</span>}
            <button type="button" onClick={atualizarDexion} disabled={atualizando} className="inline-flex items-center gap-1 text-info hover:underline disabled:opacity-50">
              <RefreshCw className={cn("w-3.5 h-3.5", atualizando && "animate-spin")} /> Atualizar do Dexion
            </button>
          </div>
        )}
        {loading || !dre ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : erroDre ? (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 text-danger text-sm px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {erroDre}</div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-auto print-area">
            <table className="w-full text-sm tabular-nums whitespace-nowrap">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold sticky left-0 bg-muted z-20 min-w-[16rem]">Conta</th>
                  {MESES.map((m) => <th key={m} className="text-right px-3 py-2.5 font-semibold w-24">{m}</th>)}
                  <th className="text-right px-4 py-2.5 font-semibold w-28 bg-muted">Total</th>
                </tr>
              </thead>
              <tbody>
                {dre.secoes.map((s) => (
                  <SecaoRows key={s.id} secao={s} ano={dre.ano} modo={modo} fonte={fonte} onCelula={setAlvo} />
                ))}
                <tr className="border-t-2 border-border bg-gray-900 text-white font-bold">
                  <td className="px-4 py-3 sticky left-0 bg-gray-900 z-10">Resultado do Exercício</td>
                  {dre.resultadoMeses.map((v, i) => (
                    <td key={i} className={cn("text-right px-3 py-3", v < 0 && "text-red-300")}>{Math.abs(v) < 0.005 ? "" : fmtColuna(v, modo)}</td>
                  ))}
                  <td className={cn("text-right px-4 py-3 bg-gray-800", dre.resultadoTotal < 0 && "text-red-300")}>{fmtColuna(dre.resultadoTotal, modo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {alvo && <LancamentosDrePopup alvo={alvo} onFechar={() => setAlvo(null)} />}
      </div>
    </div>
  );
}

// Subtotais por sintética-pai (ex.: CMV, CPV) — soma das analíticas do subgrupo.
function subtotaisDoSubgrupo(contas: LinhaConta[]) {
  const m = new Map<string, { nome: string; meses: number[]; total: number }>();
  for (const c of contas) {
    if (!c.subgrupoCodigo) continue;
    let g = m.get(c.subgrupoCodigo);
    if (!g) { g = { nome: c.subgrupoNome ?? c.subgrupoCodigo, meses: new Array(12).fill(0), total: 0 }; m.set(c.subgrupoCodigo, g); }
    for (let i = 0; i < 12; i++) g.meses[i] += c.meses[i];
    g.total += c.total;
  }
  return m;
}

function SecaoRows({ secao, ano, modo, fonte, onCelula }: { secao: Secao; ano: number; modo: "contabil" | "real"; fonte: Fonte; onCelula: (a: AlvoLancamentos) => void }) {
  // Linhas abertas (mais um nível: analíticas do Dexion).
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setAbertas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Alvo do popup p/ conta(s): ERP usa ids; Dexion usa o código/prefixo.
  const alvoContas = (contas: LinhaConta[], titulo: string, mes: number): AlvoLancamentos | null => {
    if (fonte === "erp") return { fonte: "erp", contaIds: contas.map((c) => c.id), titulo, ano, mes };
    if (contas.length === 1) return { fonte: "dexion", conta: contas[0].codigo, titulo, ano, mes };
    return null;
  };
  const alvoPrefixo = (codigo: string, titulo: string, mes: number): AlvoLancamentos => ({ fonte: "dexion", conta: codigo, titulo, ano, mes });
  const abrir = (a: AlvoLancamentos | null) => { if (a) onCelula(a); };

  // Linha "=" (SUBTOTAL): resultado acumulado, sem contas.
  if (secao.operacao === "SUBTOTAL") {
    return (
      <tr className="border-y-2 border-border bg-muted font-bold text-foreground">
        <td className="px-4 py-2.5 sticky left-0 bg-muted z-10">
          <span className="text-muted-foreground mr-1.5">=</span>{secao.nome}
        </td>
        {secao.meses.map((v, i) => (
          <td key={i} className={cn("text-right px-3 py-2.5", v < 0 && "text-danger")}>{Math.abs(v) < 0.005 ? "" : fmtColuna(v, modo)}</td>
        ))}
        <td className={cn("text-right px-4 py-2.5 bg-muted/80", secao.total < 0 && "text-danger")}>{fmtColuna(secao.total, modo)}</td>
      </tr>
    );
  }
  const subtotais = subtotaisDoSubgrupo(secao.contas);
  let ultimoSub: string | null = null;
  const secaoAlvo = (mes: number) => fonte === "erp" ? alvoContas(secao.contas, secao.nome, mes) : null;
  return (
    <>
      <tr className="bg-muted/70 border-y border-border font-semibold text-foreground">
        <td className="px-4 py-2 sticky left-0 bg-muted/70 z-10">
          {secao.nome} <span className="text-xs font-normal text-muted-foreground">({secao.operacao === "SUBTRAI" ? "−" : "+"})</span>
        </td>
        {secao.meses.map((v, i) => <Cel key={i} v={v} modo={modo} className="px-3 py-2" onClick={secaoAlvo(i + 1) ? () => abrir(secaoAlvo(i + 1)) : undefined} />)}
        <Cel v={secao.total} modo={modo} className="px-4 py-2 bg-muted" onClick={secaoAlvo(0) ? () => abrir(secaoAlvo(0)) : undefined} />
      </tr>
      {secao.contas.map((c) => {
        const abreSub = c.subgrupoCodigo && c.subgrupoCodigo !== ultimoSub;
        ultimoSub = c.subgrupoCodigo;
        const st = abreSub ? subtotais.get(c.subgrupoCodigo!) : null;
        const contasDoSub = c.subgrupoCodigo ? secao.contas.filter((x) => x.subgrupoCodigo === c.subgrupoCodigo) : [];
        const subAlvo = (mes: number) => fonte === "erp" ? alvoContas(contasDoSub, st?.nome ?? c.subgrupoCodigo ?? "", mes) : alvoPrefixo(c.subgrupoCodigo!, `${c.subgrupoCodigo} ${st?.nome ?? ""}`, mes);
        const contaAlvo = (mes: number) => fonte === "erp" ? alvoContas([c], `${c.codigo} ${c.nome}`, mes) : alvoPrefixo(c.codigo, `${c.codigo} ${c.nome}`, mes);
        const temFilhos = !!c.filhos?.length;
        const aberta = abertas.has(c.id);
        return (
          <Fragment key={c.id}>
            {st && (
              <tr className="border-b border-border bg-muted/40 font-medium text-foreground">
                <td className="px-4 py-1.5 sticky left-0 bg-muted/40 z-10">
                  <span className="font-mono text-[11px] text-muted-foreground mr-2">{c.subgrupoCodigo}</span>{st.nome}
                </td>
                {st.meses.map((v, i) => <Cel key={i} v={v} modo={modo} className="px-3 py-1.5" onClick={() => abrir(subAlvo(i + 1))} />)}
                <Cel v={st.total} modo={modo} className="px-4 py-1.5 bg-muted/60" onClick={() => abrir(subAlvo(0))} />
              </tr>
            )}
            <tr className="border-b border-gray-50 hover:bg-info/10">
              <td className={cn("px-4 py-1.5 sticky left-0 bg-card z-10", c.subgrupoCodigo && "pl-9")}>
                <span className="flex items-center gap-1.5">
                  {temFilhos ? (
                    <button type="button" onClick={() => toggle(c.id)} className="p-0.5 -ml-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" title={aberta ? "Fechar" : `Abrir ${c.filhos!.length} contas`}>
                      <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", aberta && "rotate-90")} />
                    </button>
                  ) : <span className="w-4" />}
                  {fonte === "erp" ? (
                    <Link
                      href={`/contabilidade/razao/${c.id}?from=${ano}-01-01&to=${ano}-12-31`}
                      className="flex items-center gap-2 hover:text-info"
                      title="Abrir razão da conta"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span>
                      <span className="truncate">{c.nome}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span>
                      <span className="truncate">{c.nome}</span>
                    </span>
                  )}
                </span>
              </td>
              {c.meses.map((v, i) => <Cel key={i} v={v} modo={modo} className="px-3 py-1.5 text-muted-foreground" onClick={() => abrir(contaAlvo(i + 1))} />)}
              <Cel v={c.total} modo={modo} className="px-4 py-1.5 font-medium bg-muted/50" onClick={() => abrir(contaAlvo(0))} />
            </tr>
            {aberta && c.filhos!.map((f) => {
              const filhoAlvo = (mes: number) => fonte === "erp" ? alvoContas([f], `${f.codigo} ${f.nome}`, mes) : alvoPrefixo(f.codigo, `${f.codigo} ${f.nome}`, mes);
              return (
                <tr key={f.id} className="border-b border-gray-50 bg-muted/20 text-xs hover:bg-info/10">
                  <td className={cn("px-4 py-1 sticky left-0 bg-muted/20 z-10", c.subgrupoCodigo ? "pl-16" : "pl-11")}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{f.codigo}</span>
                      <span className="truncate text-foreground">{f.nome}</span>
                    </span>
                  </td>
                  {f.meses.map((v, i) => <Cel key={i} v={v} modo={modo} className="px-3 py-1 text-muted-foreground" onClick={() => abrir(filhoAlvo(i + 1))} />)}
                  <Cel v={f.total} modo={modo} className="px-4 py-1 bg-muted/40" onClick={() => abrir(filhoAlvo(0))} />
                </tr>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
