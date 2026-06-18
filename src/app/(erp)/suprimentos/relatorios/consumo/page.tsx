"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Download,
  Loader2,
  RefreshCw,
  Star,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Package,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ProductRow = {
  id: string;
  codigo: string;
  descricao: string;
  sigla: string;
  saldoAtual: number;
  consumoDiario: number;
  pontoReposicao: number;
  estoqueMinimo: number;
  estoqueMaximo: number | null;
  leadTime: number;
  previsaoRuptura: string;
  status: "ok" | "alerta" | "critico";
};

type SummaryData = {
  rows: ProductRow[];
  criticos: number;
  alertas: number;
  total: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

const STATUS_META = {
  ok:      { label: "OK",       icon: CheckCircle2,  cls: "bg-success/15 text-success border-success/30" },
  alerta:  { label: "Alerta",   icon: AlertCircle,   cls: "bg-warning/15  text-warning  border-warning/30"   },
  critico: { label: "Crítico",  icon: AlertTriangle, cls: "bg-danger/15    text-danger    border-danger/30"     },
} as const;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RelatorioConsumoPage() {
  const [data,      setData]      = useState<SummaryData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suprimentos/relatorios/consumo");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/suprimentos/relatorios/consumo/pdf");
      if (!res.ok) throw new Error("Erro ao gerar PDF");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "consumo.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Análise de Consumo"
        subtitle="Produtos favoritados · Série histórica 90 dias + projeção 14 dias"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading || loading || data?.total === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {downloading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />
              }
              {downloading ? "Gerando PDF…" : "Baixar PDF"}
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard
            icon={<Star className="h-5 w-5 text-amber-500" />}
            label="Produtos Favoritados"
            value={String(data.total)}
            bg="bg-warning/10"
            border="border-warning/30"
          />
          <SummaryCard
            icon={<AlertCircle className="h-5 w-5 text-warning" />}
            label="Em Alerta"
            value={String(data.alertas)}
            bg="bg-warning/10"
            border="border-warning/30"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-5 w-5 text-danger" />}
            label="Críticos"
            value={String(data.criticos)}
            bg="bg-danger/10"
            border="border-danger/30"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !data || data.total === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-right">Saldo Atual</th>
                  <th className="px-4 py-3 text-right">Consumo/dia</th>
                  <th className="px-4 py-3 text-right">Pto. Reposição</th>
                  <th className="px-4 py-3 text-right">Est. Mínimo</th>
                  <th className="px-4 py-3 text-right">Est. Máximo</th>
                  <th className="px-4 py-3 text-center">Prev. Ruptura</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((row) => {
                  const meta = STATUS_META[row.status];
                  const StatusIcon = meta.icon;
                  return (
                    <tr key={row.id} className="hover:bg-muted/60 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/suprimentos/produtos/${row.id}`}
                          className="font-mono text-xs text-info hover:underline"
                        >
                          {row.codigo}
                        </Link>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-foreground">{row.descricao}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {fmt(row.saldoAtual)} <span className="text-xs text-muted-foreground">{row.sigla}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {fmt(row.consumoDiario, 3)} <span className="text-xs text-muted-foreground">{row.sigla}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-warning">
                        {fmt(row.pontoReposicao)} <span className="text-xs text-amber-400">{row.sigla}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-danger">
                        {fmt(row.estoqueMinimo)} <span className="text-xs text-red-300">{row.sigla}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {row.estoqueMaximo != null
                          ? <>{fmt(row.estoqueMaximo)} <span className="text-xs text-muted-foreground/60">{row.sigla}</span></>
                          : <span className="text-muted-foreground/60">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                          row.status === "critico" ? "text-danger"
                            : row.status === "alerta" ? "text-warning"
                            : "text-foreground"
                        )}>
                          {row.previsaoRuptura}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", meta.cls)}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SummaryCard({
  icon, label, value, bg, border,
}: { icon: React.ReactNode; label: string; value: string; bg: string; border: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-4", bg, border)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
      <Package className="h-10 w-10 opacity-40" />
      <p className="font-medium">Nenhum produto favoritado</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Acesse a ficha de um produto e clique na estrela para incluí-lo neste relatório.
      </p>
      <Link
        href="/suprimentos/produtos"
        className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Ir para Produtos
      </Link>
    </div>
  );
}
