"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import GerarRetroativos from "@/components/contabilidade/GerarRetroativos";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatDate } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, saldoAnormal, type FormatoModo, type NaturezaConta } from "@/lib/formato-contabil";
import { useCachedData } from "@/lib/use-cached-data";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useSession } from "@/lib/session-context";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import { Loader2, Scale, Check, X, FileDown, ChevronRight, ChevronDown } from "lucide-react";

const COLLAPSE_KEY = "contabilidade:balanco:collapsed";

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

function LinhaRow({ l, soComSaldo, modo, data, filhos, recolhido, onToggle }: {
  l: Linha; soComSaldo: boolean; modo: FormatoModo; data: string;
  filhos: boolean; recolhido: boolean; onToggle: (codigo: string) => void;
}) {
  if (soComSaldo && l.saldo === 0) return null;
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-1.5 border-b border-gray-50 text-sm tabular-nums",
      l.tipo === "SINTETICA" ? "bg-muted/40 font-semibold text-foreground" : "text-foreground",
    )}>
      <span className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }}>
        {filhos ? (
          <button type="button" onClick={() => onToggle(l.codigo)} className="text-muted-foreground hover:text-foreground shrink-0" title={recolhido ? "Expandir" : "Recolher"}>
            {recolhido ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <Link href={`/contabilidade/razao/${l.id}?from=${inicioAno(data)}&to=${data}`} className="flex items-center gap-2 min-w-0 hover:text-info" title="Abrir razão em nova aba">
          <span className="font-mono text-xs text-muted-foreground shrink-0">{l.codigo}</span>
          <span className="truncate">{l.nome}</span>
        </Link>
      </span>
      <span className={cn(l.saldo === 0 && "text-muted-foreground/60", saldoAnormal(l.saldo) && "text-danger font-medium")}>{fmtSaldo(l.saldo, modo, l.natureza)}</span>
    </div>
  );
}

export default function BalancoPage() {
  useTabTitle("Balanço Patrimonial");
  // Posição SEMPRE em hoje ao abrir (não persiste a data — evita ver saldo defasado).
  const [data, setData] = useState<string>(hoje);
  const [soComSaldo, setSoComSaldo] = usePersistedState<boolean>("contabilidade:balanco:soComSaldo", true);
  const [modo, setModo] = useFormatoContabil();

  // Recolher/expandir contas (sintéticas escondem suas analíticas). Persiste.
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

  // Cache stale-while-revalidate por data — reabrir não recarrega.
  const { data: bal, loading, refetch } = useCachedData<Balanco>(
    data ? `balanco:${data}` : null,
    () => fetch(`/api/contabilidade/balanco?data=${data}`).then((r) => r.json()),
  );

  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? null;

  // Árvore de contas (todas as seções) p/ detectar filhos e recolher/expandir.
  const todas = useMemo(() => bal ? [...bal.ativo, ...bal.passivo, ...bal.patrimonioLiquido] : [], [bal]);
  const temFilhos = useCallback((l: Linha) => todas.some((x) => x.codigo.startsWith(l.codigo + ".")), [todas]);
  const visivel = useCallback((l: Linha) => !Array.from(collapsed).some((c) => l.codigo.startsWith(c + ".")), [collapsed]);
  const recolherTudo = useCallback(() => persist(new Set(todas.filter((l) => temFilhos(l)).map((l) => l.codigo))), [todas, temFilhos, persist]);
  const expandirTudo = useCallback(() => persist(new Set()), [persist]);

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
      <PageHeader title="Balanço Patrimonial" breadcrumbs={[{ label: "Contabilidade" }, { label: "Balanço" }]} />
      <div className="px-8 pb-8 space-y-4">
        <GerarRetroativos onDone={refetch} />
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
          <button type="button" onClick={recolherTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">Recolher tudo</button>
          <button type="button" onClick={expandirTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">Expandir tudo</button>
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
                {bal.ativo.filter(visivel).map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} modo={modo} data={data} filhos={temFilhos(l)} recolhido={collapsed.has(l.codigo)} onToggle={toggle} />)}
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
                {bal.passivo.filter(visivel).map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} modo={modo} data={data} filhos={temFilhos(l)} recolhido={collapsed.has(l.codigo)} onToggle={toggle} />)}
                {bal.patrimonioLiquido.filter(visivel).map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} modo={modo} data={data} filhos={temFilhos(l)} recolhido={collapsed.has(l.codigo)} onToggle={toggle} />)}
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
