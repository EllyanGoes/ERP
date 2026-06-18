"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtColuna } from "@/lib/formato-contabil";
import { useSession } from "@/lib/session-context";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import { Loader2, FileBarChart, SlidersHorizontal, FileDown } from "lucide-react";

type LinhaConta = { id: string; codigo: string; nome: string; meses: number[]; total: number; subgrupoCodigo: string | null; subgrupoNome: string | null };
type Secao = { id: string; nome: string; operacao: "SOMA" | "SUBTRAI" | "SUBTOTAL"; contas: LinhaConta[]; meses: number[]; total: number };
type Dre = { ano: number; secoes: Secao[]; resultadoMeses: number[]; resultadoTotal: number };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function celula(v: number, modo: "contabil" | "real") {
  if (Math.abs(v) < 0.005) return <span className="text-muted-foreground/60">—</span>;
  return <span className={v < 0 ? "text-danger" : ""}>{fmtColuna(v, modo)}</span>;
}

export default function DrePage() {
  useTabTitle("DRE");
  const [ano, setAno] = useState(new Date().getUTCFullYear());
  const [dre, setDre] = useState<Dre | null>(null);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useFormatoContabil();
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
      subinfo: [`Exercício: ${dre.ano}`, `Formato: ${modo === "contabil" ? "Contábil" : "Real"}`],
      head: ["Conta", ...MESES, "Total"],
      linhas,
      alinharDireitaDe: 1,
      orientacao: "l",
      arquivo: `dre-${dre.ano}.pdf`,
    });
  }

  const load = useCallback(async (a: number) => {
    setLoading(true);
    try {
      const j = await fetch(`/api/contabilidade/dre?ano=${a}`).then((r) => r.json());
      setDre(j);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(ano); }, [ano, load]);

  return (
    <div>
      <PageHeader title="DRE" breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "DRE" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap no-print">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Exercício
            <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="h-10 rounded-lg border border-border px-3 text-sm bg-card">
              {Array.from({ length: 6 }).map((_, i) => { const y = new Date().getUTCFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </label>
          <Link href="/contabilidade/dre/estrutura" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted">
            <SlidersHorizontal className="w-4 h-4" /> Editar estrutura
          </Link>
          <FormatoToggle modo={modo} onChange={setModo} />
          <button type="button" onClick={baixarPdf} disabled={!dre}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
            <FileDown className="w-4 h-4" /> Baixar PDF
          </button>
        </div>

        {loading || !dre ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
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
                  <SecaoRows key={s.id} secao={s} ano={dre.ano} modo={modo} />
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

function SecaoRows({ secao, ano, modo }: { secao: Secao; ano: number; modo: "contabil" | "real" }) {
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
  return (
    <>
      <tr className="bg-muted/70 border-y border-border font-semibold text-foreground">
        <td className="px-4 py-2 sticky left-0 bg-muted/70 z-10">
          {secao.nome} <span className="text-xs font-normal text-muted-foreground">({secao.operacao === "SUBTRAI" ? "−" : "+"})</span>
        </td>
        {secao.meses.map((v, i) => <td key={i} className="text-right px-3 py-2">{celula(v, modo)}</td>)}
        <td className="text-right px-4 py-2 bg-muted">{celula(secao.total, modo)}</td>
      </tr>
      {secao.contas.map((c) => {
        const abreSub = c.subgrupoCodigo && c.subgrupoCodigo !== ultimoSub;
        ultimoSub = c.subgrupoCodigo;
        const st = abreSub ? subtotais.get(c.subgrupoCodigo!) : null;
        return (
          <Fragment key={c.id}>
            {st && (
              <tr className="border-b border-border bg-muted/40 font-medium text-foreground">
                <td className="px-4 py-1.5 sticky left-0 bg-muted/40 z-10">
                  <span className="font-mono text-[11px] text-muted-foreground mr-2">{c.subgrupoCodigo}</span>{st.nome}
                </td>
                {st.meses.map((v, i) => <td key={i} className="text-right px-3 py-1.5">{celula(v, modo)}</td>)}
                <td className="text-right px-4 py-1.5 bg-muted/60">{celula(st.total, modo)}</td>
              </tr>
            )}
            <tr className="border-b border-gray-50 hover:bg-info/10">
              <td className={cn("px-4 py-1.5 sticky left-0 bg-card z-10", c.subgrupoCodigo && "pl-9")}>
                <Link
                  href={`/contabilidade/razao?contaId=${c.id}&from=${ano}-01-01&to=${ano}-12-31`}
                  className="flex items-center gap-2 hover:text-info"
                  title="Abrir razão da conta"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span>
                  <span className="truncate">{c.nome}</span>
                </Link>
              </td>
              {c.meses.map((v, i) => <td key={i} className="text-right px-3 py-1.5 text-muted-foreground">{celula(v, modo)}</td>)}
              <td className="text-right px-4 py-1.5 font-medium bg-muted/50">{celula(c.total, modo)}</td>
            </tr>
          </Fragment>
        );
      })}
    </>
  );
}
