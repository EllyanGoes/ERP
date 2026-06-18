"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtColuna } from "@/lib/formato-contabil";
import PrintButton from "@/components/shared/PrintButton";
import { Loader2, FileBarChart, SlidersHorizontal } from "lucide-react";

type LinhaConta = { id: string; codigo: string; nome: string; meses: number[]; total: number };
type Secao = { id: string; nome: string; operacao: "SOMA" | "SUBTRAI"; contas: LinhaConta[]; meses: number[]; total: number };
type Dre = { ano: number; secoes: Secao[]; resultadoMeses: number[]; resultadoTotal: number };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function celula(v: number, modo: "contabil" | "real") {
  if (Math.abs(v) < 0.005) return <span className="text-gray-300">—</span>;
  return <span className={v < 0 ? "text-red-600" : ""}>{fmtColuna(v, modo)}</span>;
}

export default function DrePage() {
  useTabTitle("DRE");
  const [ano, setAno] = useState(new Date().getUTCFullYear());
  const [dre, setDre] = useState<Dre | null>(null);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useFormatoContabil();

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
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Exercício
            <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              {Array.from({ length: 6 }).map((_, i) => { const y = new Date().getUTCFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </label>
          <Link href="/contabilidade/dre/estrutura" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <SlidersHorizontal className="w-4 h-4" /> Editar estrutura
          </Link>
          <FormatoToggle modo={modo} onChange={setModo} />
          <PrintButton />
        </div>

        {loading || !dre ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-auto print-area">
            <table className="w-full text-sm tabular-nums whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold sticky left-0 bg-gray-50 z-20 min-w-[16rem]">Conta</th>
                  {MESES.map((m) => <th key={m} className="text-right px-3 py-2.5 font-semibold w-24">{m}</th>)}
                  <th className="text-right px-4 py-2.5 font-semibold w-28 bg-gray-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {dre.secoes.map((s) => (
                  <SecaoRows key={s.id} secao={s} ano={dre.ano} modo={modo} />
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-900 text-white font-bold">
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

function SecaoRows({ secao, ano, modo }: { secao: Secao; ano: number; modo: "contabil" | "real" }) {
  return (
    <>
      <tr className="bg-gray-100/70 border-y border-gray-200 font-semibold text-gray-800">
        <td className="px-4 py-2 sticky left-0 bg-gray-100/70 z-10">
          {secao.nome} <span className="text-xs font-normal text-gray-400">({secao.operacao === "SUBTRAI" ? "−" : "+"})</span>
        </td>
        {secao.meses.map((v, i) => <td key={i} className="text-right px-3 py-2">{celula(v, modo)}</td>)}
        <td className="text-right px-4 py-2 bg-gray-100">{celula(secao.total, modo)}</td>
      </tr>
      {secao.contas.map((c) => (
        <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/30">
          <td className="px-4 py-1.5 sticky left-0 bg-white z-10">
            <Link
              href={`/contabilidade/razao?contaId=${c.id}&from=${ano}-01-01&to=${ano}-12-31`}
              className="flex items-center gap-2 hover:text-blue-600"
              title="Abrir razão da conta"
            >
              <span className="font-mono text-[11px] text-gray-400">{c.codigo}</span>
              <span className="truncate">{c.nome}</span>
            </Link>
          </td>
          {c.meses.map((v, i) => <td key={i} className="text-right px-3 py-1.5 text-gray-600">{celula(v, modo)}</td>)}
          <td className="text-right px-4 py-1.5 font-medium bg-gray-50/50">{celula(c.total, modo)}</td>
        </tr>
      ))}
    </>
  );
}
