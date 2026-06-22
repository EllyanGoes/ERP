"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import NovaEngenhariaDialog from "@/components/pcp/NovaEngenhariaDialog";
import { cn } from "@/lib/utils";
import { ClipboardList, Plus, RefreshCw, FlaskConical } from "lucide-react";

interface EngRow {
  id: string;
  ativo: boolean;
  item: { id: string; codigo: string; descricao: string } | null;
  fluxo: { id: string; nome: string } | null;
  totalInsumos: number;
}
export default function EngenhariaPage() {
  useTabTitle("Engenharia do Produto");
  const router = useRouter();
  const [engs, setEngs] = useState<EngRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const re = await fetch("/api/pcp/engenharia");
      const je = await re.json();
      if (!re.ok) throw new Error(je?.error ?? "Erro ao carregar");
      setEngs(je.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Engenharia do Produto"
        subtitle="Estrutura (BOM) por produto: qual fluxo ele usa e quais insumos consome (argila, água, caco, biomassa, embalagem)."
        breadcrumbs={[{ label: "PCP" }, { label: "Engenharia do Produto" }]}
        action={
          <button
            type="button"
            onClick={() => setNovoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4" /> Nova engenharia
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        <NovaEngenhariaDialog
          open={novoOpen}
          onOpenChange={setNovoOpen}
          permitirNovoProduto
          onCreated={({ engenhariaId }) => router.push(`/pcp/engenharia/${engenhariaId}`)}
        />

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : engs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-3"><FlaskConical className="w-7 h-7 text-cyan-400" /></div>
            <p className="text-sm font-medium text-foreground">Nenhuma engenharia cadastrada</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">Defina, por produto, o fluxo que ele usa e a lista de insumos (BOM). Um mesmo fluxo serve para vários produtos.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Produto</th>
                  <th className="text-left font-medium px-4 py-2.5">Fluxo</th>
                  <th className="text-center font-medium px-4 py-2.5">Insumos</th>
                  <th className="text-center font-medium px-4 py-2.5">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {engs.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/pcp/engenharia/${e.id}`)} className="hover:bg-cyan-50/40 cursor-pointer">
                    <td className="px-4 py-2.5 text-foreground">
                      <span className="font-mono text-muted-foreground text-xs mr-2">{e.item?.codigo}</span>{e.item?.descricao ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.fluxo?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-muted-foreground/60" /> {e.totalInsumos}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", e.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{e.ativo ? "Sim" : "Não"}</span>
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
