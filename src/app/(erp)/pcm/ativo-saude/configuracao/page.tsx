"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { RefreshCw, AlertTriangle, Save, Info, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoManutencao } from "@/app/api/pcm/config/tipos-manutencao/route";

const NATUREZA_LABEL: Record<string, string> = {
  CORRETIVA: "Corretiva",
  PREVENTIVA: "Preventiva",
  PREDITIVA: "Preditiva",
  INSPECAO: "Inspeção",
  LUBRIFICACAO: "Lubrificação",
  MELHORIA: "Melhoria",
  OUTROS: "Outros",
};

export default function ConfigTiposPage() {
  useTabTitle("Tipos de OS");

  const [tipos, setTipos] = useState<TipoManutencao[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setOkMsg("");
    try {
      const res = await fetch("/api/pcm/config/tipos-manutencao");
      if (!res.ok) {
        setErro("Não foi possível carregar os tipos de OS.");
        setTipos([]);
        return;
      }
      const j = await res.json();
      const lista: TipoManutencao[] = j.tipos ?? [];
      setTipos(lista);
      setSel(new Set(lista.filter((t) => t.conta).map((t) => t.id)));
    } catch {
      setErro("Erro de conexão ao carregar.");
      setTipos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setOkMsg("");
  }

  async function salvar() {
    setSaving(true);
    setErro(null);
    setOkMsg("");
    try {
      const res = await fetch("/api/pcm/config/tipos-manutencao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(sel) }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErro(j.error || "Não foi possível salvar.");
        return;
      }
      setOkMsg("Configuração salva. Vale para os próximos fechamentos.");
    } catch {
      setErro("Erro de conexão ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Tipos de OS"
        subtitle="Escolha quais tipos de ordem de serviço contam como falha / parada não planejada no MTBF/MTTR."
        breadcrumbs={[{ label: "PCM" }, { label: "Ativo Saúde" }, { label: "Tipos de OS" }]}
      />

      <div className="flex-1 overflow-y-auto px-8 pb-8 max-w-2xl">
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Os tipos marcados <strong>contam como parada não planejada</strong> (corretivas);
            inspeção/preventiva ficam desmarcadas. Muda os <strong>próximos fechamentos</strong> —
            meses já fechados não são alterados.
          </span>
        </div>

        {erro && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {erro}
          </div>
        )}
        {okMsg && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            <Check className="w-4 h-4" /> {okMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando tipos…
          </div>
        ) : tipos.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Nenhum tipo de OS cadastrado.
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {tipos.map((t) => (
                <label
                  key={t.id}
                  className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-muted cursor-pointer", !t.ativo && "opacity-60")}
                >
                  <input
                    type="checkbox"
                    checked={sel.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="w-4 h-4 rounded border-border text-info focus:ring-blue-500"
                  />
                  <span className="flex-1 text-sm text-foreground">
                    {t.descricao}
                    {!t.ativo && <span className="ml-1.5 text-[11px] text-muted-foreground">(inativo)</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{NATUREZA_LABEL[t.natureza] ?? t.natureza}</span>
                  <span className="text-[11px] text-muted-foreground font-mono w-10 text-right">{t.sigla}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={salvar}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
              </button>
              <span className="text-xs text-muted-foreground">
                {sel.size} de {tipos.length} contam como falha
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
