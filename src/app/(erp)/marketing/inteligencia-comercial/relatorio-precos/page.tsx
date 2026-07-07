"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { ArrowLeft, Search, Loader2, BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Linha = {
  itemId: string | null;
  produtoNome: string;
  codigo: string | null;
  nossoPreco: number | null;
  mediaMercado: number;
  menor: number;
  maior: number;
  qtdCotacoes: number;
  qtdConcorrentes: number;
  delta: number | null;
  deltaPct: number | null;
};

export default function RelatorioPrecosMercadoPage() {
  useTabTitle("Preço de Mercado");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/marketing/relatorios/precos-mercado")
      .then((r) => r.json())
      .then((j) => setLinhas(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtradas = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter((l) => l.produtoNome.toLowerCase().includes(termo) || (l.codigo ?? "").toLowerCase().includes(termo));
  }, [linhas, q]);

  return (
    <div>
      <PageHeader
        title="Preço de Mercado por Produto"
        subtitle="Preço médio praticado pelos competidores, comparado ao nosso preço de venda"
        breadcrumbs={[
          { label: "Marketing" },
          { label: "Inteligência Comercial", href: "/marketing/inteligencia-comercial" },
          { label: "Preço de Mercado" },
        ]}
        actions={
          <Link href="/marketing/inteligencia-comercial">
            <Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar à lista</Button>
          </Link>
        }
      />

      <div className="px-8 pb-10">
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto..." className="pl-9 h-10 border-border" />
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><BarChart3 className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-sm font-medium text-foreground">Sem dados de preço</p>
              <p className="text-sm text-muted-foreground">Cadastre preços de competidores para ver o preço médio de mercado.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Produto</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Comp.</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Menor</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Média mercado</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Maior</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Nosso preço</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Nós vs média</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => {
                  const acima = l.delta != null && l.delta > 0;
                  const abaixo = l.delta != null && l.delta < 0;
                  return (
                    <tr key={(l.itemId ?? "avulso") + l.produtoNome} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{l.produtoNome}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.codigo ? l.codigo : <span className="uppercase">avulso</span>}
                          <span className="mx-1.5">·</span>{l.qtdCotacoes} cotação(ões)
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground">{l.qtdConcorrentes}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{formatBRL(l.menor)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-foreground">{formatBRL(l.mediaMercado)}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{formatBRL(l.maior)}</td>
                      <td className="px-3 py-3 text-right text-foreground">{l.nossoPreco != null ? formatBRL(l.nossoPreco) : "—"}</td>
                      <td className="px-3 py-3 text-right">
                        {l.delta == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={cn("inline-flex items-center gap-1 font-medium", acima ? "text-amber-600 dark:text-amber-400" : abaixo ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}>
                            {acima ? <TrendingUp className="h-3.5 w-3.5" /> : abaixo ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                            {l.delta > 0 ? "+" : ""}{formatBRL(l.delta)}
                            {l.deltaPct != null ? ` (${l.deltaPct > 0 ? "+" : ""}${l.deltaPct.toFixed(0)}%)` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && filtradas.length > 0 && (
            <div className="px-5 py-2.5 text-[11px] text-muted-foreground border-t border-border">
              <span className="text-amber-600 dark:text-amber-400 font-medium">Âmbar</span> = estamos acima da média do mercado ·{" "}
              <span className="text-blue-600 dark:text-blue-400 font-medium">Azul</span> = estamos abaixo. Média simples das cotações registradas por produto.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
