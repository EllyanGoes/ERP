"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatDate } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, saldoAnormal, type FormatoModo, type NaturezaConta } from "@/lib/formato-contabil";
import { useSession } from "@/lib/session-context";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import { Loader2, Scale, Check, X, FileDown } from "lucide-react";

type Linha = { id: string; codigo: string; nome: string; tipo: "SINTETICA" | "ANALITICA"; natureza: NaturezaConta; nivel: number; saldo: number };
type Balanco = {
  ativo: Linha[]; passivo: Linha[]; patrimonioLiquido: Linha[];
  totalAtivo: number; totalPassivo: number; totalPL: number;
  resultadoExercicio: number; totalPLcomResultado: number; confere: boolean;
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}
function inicioAno(d: string) {
  return `${d.slice(0, 4)}-01-01`;
}

function LinhaRow({ l, soComSaldo, modo, data }: { l: Linha; soComSaldo: boolean; modo: FormatoModo; data: string }) {
  if (soComSaldo && l.saldo === 0) return null;
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-1.5 border-b border-gray-50 text-sm tabular-nums",
      l.tipo === "SINTETICA" ? "bg-muted/40 font-semibold text-foreground" : "text-foreground",
    )}>
      <Link href={`/contabilidade/razao?contaId=${l.id}&from=${inicioAno(data)}&to=${data}`} className="flex items-center gap-2 min-w-0 hover:text-info" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }} title="Abrir razão">
        <span className="font-mono text-xs text-muted-foreground shrink-0">{l.codigo}</span>
        <span className="truncate">{l.nome}</span>
      </Link>
      <span className={cn(l.saldo === 0 && "text-muted-foreground/60", saldoAnormal(l.saldo) && "text-danger font-medium")}>{fmtSaldo(l.saldo, modo, l.natureza)}</span>
    </div>
  );
}

export default function BalancoPage() {
  useTabTitle("Balanço Patrimonial");
  const [data, setData] = useState(hoje());
  const [bal, setBal] = useState<Balanco | null>(null);
  const [loading, setLoading] = useState(true);
  const [soComSaldo, setSoComSaldo] = useState(true);
  const [modo, setModo] = useFormatoContabil();

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const j = await fetch(`/api/contabilidade/balanco?data=${d}`).then((r) => r.json());
      setBal(j);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (data) load(data); }, [data, load]);

  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? null;

  function baixarPdf() {
    if (!bal) return;
    const conta = (l: Linha): LinhaPdf | null => {
      if (soComSaldo && l.saldo === 0) return null;
      return {
        estilo: l.tipo === "SINTETICA" ? "secao" : "normal",
        celulas: [l.codigo, `${"   ".repeat(Math.max(0, l.nivel - 1))}${l.nome}`, fmtSaldo(l.saldo, modo, l.natureza)],
      };
    };
    const linhas: LinhaPdf[] = [{ estilo: "secao", celulas: ["", "ATIVO", ""] }];
    for (const l of bal.ativo) { const r = conta(l); if (r) linhas.push(r); }
    linhas.push({ estilo: "total", celulas: ["", "Total do Ativo", fmtSaldo(bal.totalAtivo, modo, "DEVEDORA")] });
    linhas.push({ estilo: "secao", celulas: ["", "PASSIVO + PATRIMÔNIO LÍQUIDO", ""] });
    for (const l of [...bal.passivo, ...bal.patrimonioLiquido]) { const r = conta(l); if (r) linhas.push(r); }
    linhas.push({ celulas: ["2.3.9", "   Resultado do Exercício", fmtSaldo(bal.resultadoExercicio, modo, "CREDORA")] });
    linhas.push({ estilo: "total", celulas: ["", "Total Passivo + PL", fmtSaldo(bal.totalPassivo + bal.totalPLcomResultado, modo, "CREDORA")] });
    gerarPdfContabil({
      titulo: "Balanço Patrimonial",
      empresa: empresaNome,
      subinfo: [
        `Posição em: ${formatDate(data)}`,
        `Formato: ${modo === "contabil" ? "Contábil" : "Real"} · ${bal.confere ? "Confere (Ativo = Passivo + PL)" : "Não fecha!"}`,
      ],
      head: ["Código", "Conta", "Saldo"],
      linhas,
      alinharDireitaDe: 2,
      arquivo: `balanco-${data}.pdf`,
    });
  }

  return (
    <div>
      <PageHeader title="Balanço Patrimonial" breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "Balanço" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap no-print">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Posição em
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-10 w-44 border-border" />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} className="w-4 h-4 rounded border-border text-info" />
            Só contas com saldo
          </label>
          <FormatoToggle modo={modo} onChange={setModo} />
          <button type="button" onClick={baixarPdf} disabled={!bal}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
            <FileDown className="w-4 h-4" /> Baixar PDF
          </button>
          {bal && (
            <span className={cn("ml-auto inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg",
              bal.confere ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
              {bal.confere ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {bal.confere ? "Confere (Ativo = Passivo + PL)" : "Não fecha!"}
            </span>
          )}
        </div>

        {loading || !bal ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* ATIVO */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted flex items-center gap-2">
                <Scale className="w-4 h-4 text-blue-500" />
                <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Ativo</h2>
              </div>
              <div>
                {bal.ativo.map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} modo={modo} data={data} />)}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t-2 border-border bg-info/10 font-bold text-foreground tabular-nums">
                <span>Total do Ativo</span>
                <span>{fmtSaldo(bal.totalAtivo, modo, "DEVEDORA")}</span>
              </div>
            </div>

            {/* PASSIVO + PL */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-500" />
                <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Passivo + Patrimônio Líquido</h2>
              </div>
              <div>
                {bal.passivo.map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} modo={modo} data={data} />)}
                {bal.patrimonioLiquido.map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} modo={modo} data={data} />)}
                {/* Resultado do exercício compõe o PL sem lançamento de encerramento */}
                <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-50 text-sm tabular-nums text-foreground italic">
                  <span className="flex items-center gap-2" style={{ paddingLeft: "16px" }}>
                    <span className="font-mono text-xs text-muted-foreground">2.3.9</span>
                    <span>Resultado do Exercício</span>
                  </span>
                  <span className={cn(bal.resultadoExercicio < 0 && "text-danger")}>{fmtSaldo(bal.resultadoExercicio, modo, "CREDORA")}</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t-2 border-border bg-warning/10 font-bold text-foreground tabular-nums">
                <span>Total Passivo + PL</span>
                <span>{fmtSaldo(bal.totalPassivo + bal.totalPLcomResultado, modo, "CREDORA")}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
