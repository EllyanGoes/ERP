"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { Loader2, RefreshCw, BookText } from "lucide-react";

type Partida = { id: string; tipo: "DEBITO" | "CREDITO"; valor: unknown; conta: { codigo: string; nome: string } };
type Lancamento = {
  id: string; data: string; historico: string; origemTipo: string; origemId: string | null; estornoDeId: string | null;
  partidas: Partida[];
};

const ORIGEM_LABEL: Record<string, string> = {
  VENDA: "Venda", RECEBIMENTO: "Recebimento", COMPRA: "Compra", PAGAMENTO: "Pagamento", MANUAL: "Manual", ESTORNO: "Estorno",
};
const ORIGEM_COR: Record<string, string> = {
  VENDA: "bg-emerald-100 text-emerald-700", RECEBIMENTO: "bg-blue-100 text-blue-700",
  COMPRA: "bg-amber-100 text-amber-700", PAGAMENTO: "bg-rose-100 text-rose-700",
  MANUAL: "bg-gray-100 text-gray-600", ESTORNO: "bg-gray-200 text-gray-600",
};

export default function LancamentosContabeisPage() {
  useTabTitle("Diário Contábil");
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contabilidade/lancamentos").then((r) => r.json());
    setLancs(j.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function gerarRetroativos() {
    setGerando(true); setAviso("");
    try {
      const res = await fetch("/api/contabilidade/backfill", { method: "POST" });
      const j = await res.json();
      if (res.ok) {
        setAviso(`${j.processados} título(s) processado(s).${j.erros?.length ? ` ${j.erros.length} com erro.` : ""}`);
        await load();
      } else setAviso(j.error || "Erro ao gerar lançamentos");
    } finally { setGerando(false); }
  }

  return (
    <div>
      <PageHeader
        title="Diário Contábil"
        breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "Diário" }]}
        action={
          <Button size="sm" variant="outline" onClick={gerarRetroativos} disabled={gerando}>
            {gerando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Gerar retroativos
          </Button>
        }
      />
      <div className="px-8 pb-8 space-y-4">
        {aviso && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">{aviso}</div>}

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Carregando...</p>
        ) : lancs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <BookText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="font-medium">Nenhum lançamento contábil</p>
            <p className="text-xs mt-1">Use “Gerar retroativos” para lançar a partir dos títulos existentes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lancs.map((l) => {
              const totalD = l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + decimalToNumber(p.valor), 0);
              return (
                <div key={l.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-500 w-20 shrink-0">{formatDate(l.data)}</span>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0", ORIGEM_COR[l.origemTipo] ?? "bg-gray-100 text-gray-600")}>
                      {ORIGEM_LABEL[l.origemTipo] ?? l.origemTipo}
                    </span>
                    <span className="text-sm text-gray-700 truncate flex-1">{l.historico}</span>
                    <span className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">{formatBRL(totalD)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {l.partidas.map((p) => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-5 py-1.5 w-10 text-center">
                            <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold",
                              p.tipo === "DEBITO" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")}>
                              {p.tipo === "DEBITO" ? "D" : "C"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-gray-500 w-24">{p.conta.codigo}</td>
                          <td className="px-2 py-1.5 text-gray-700">{p.conta.nome}</td>
                          <td className={cn("px-5 py-1.5 text-right tabular-nums w-32", p.tipo === "DEBITO" ? "text-blue-700" : "text-amber-700")}>
                            {formatBRL(decimalToNumber(p.valor))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
