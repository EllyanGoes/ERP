"use client";

import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { useCachedData } from "@/lib/use-cached-data";
import { Loader2, ShieldCheck, AlertTriangle, ExternalLink } from "lucide-react";

type Anormal = {
  id: string; codigo: string; nome: string;
  natureza: "DEVEDORA" | "CREDORA"; grupo: string;
  saldo: number; tipo: "CREDOR" | "DEVEDOR";
};

const GRUPO_LABEL: Record<string, string> = {
  ATIVO: "Ativo", PASSIVO: "Passivo", PATRIMONIO_LIQUIDO: "Patrimônio Líquido", RESULTADO: "Resultado",
};

export default function DiagnosticoPage() {
  useTabTitle("Diagnóstico contábil");
  const { data, loading } = useCachedData<{ contas: Anormal[]; total: number }>(
    "contabilidade:diagnostico",
    () => fetch("/api/contabilidade/diagnostico").then((r) => r.json()),
  );
  const contas = data?.contas ?? [];

  return (
    <div>
      <PageHeader title="Diagnóstico contábil" breadcrumbs={[{ label: "Contabilidade" }, { label: "Diagnóstico" }]} />
      <div className="px-8 pb-8 space-y-4 max-w-4xl">
        <div className="flex items-start gap-3 bg-info/10 border border-info/20 rounded-xl p-4 text-sm text-info">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Aponta contas analíticas com <b>saldo de natureza errada</b> — ex.: <b>Clientes a Receber credor</b> ou
            <b> Estoque negativo</b>. Indicam divergência (recebimento concentrado, edição sem re-contabilizar,
            valoração de estoque…). Clique para abrir o razão e investigar.
          </p>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Verificando…</div>
        ) : contas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <ShieldCheck className="w-10 h-10 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">Nenhuma divergência encontrada</p>
            <p className="text-xs text-muted-foreground">Todas as contas analíticas estão com o saldo na natureza esperada.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between">
              <span className="font-semibold text-foreground">Contas com saldo anormal</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-danger/10 text-danger">
                <AlertTriangle className="w-3.5 h-3.5" /> {contas.length}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-2 font-semibold w-28">Código</th>
                  <th className="text-left px-5 py-2 font-semibold">Conta</th>
                  <th className="text-left px-5 py-2 font-semibold w-40">Grupo</th>
                  <th className="text-right px-5 py-2 font-semibold w-40">Saldo</th>
                  <th className="px-5 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contas.map((c) => (
                  <tr key={c.id} className="hover:bg-muted">
                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{c.codigo}</td>
                    <td className="px-5 py-2.5 text-foreground">{c.nome}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{GRUPO_LABEL[c.grupo] ?? c.grupo}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-danger">
                      {formatBRL(Math.abs(c.saldo))} <span className="text-xs font-normal">{c.tipo === "CREDOR" ? "C" : "D"}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`/contabilidade/razao/${c.id}`} className={cn("inline-flex items-center text-info hover:text-info/80")} title="Abrir razão em nova aba">
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
