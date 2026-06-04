"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { RefreshCw, AlertTriangle, Save, Info, Check } from "lucide-react";
import type { TipoManutencao } from "@/app/api/pcm/config/tipos-manutencao/route";

export default function ConfigTiposPage() {
  useTabTitle("Tipos de OS");

  const [tipos, setTipos] = useState<TipoManutencao[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [fonte, setFonte] = useState<"config" | "auto">("auto");
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
      if (res.status === 503) {
        setErro("Engeman indisponível no momento. Tente novamente.");
        setTipos([]);
        return;
      }
      if (!res.ok) {
        setErro("Não foi possível carregar os tipos de OS.");
        setTipos([]);
        return;
      }
      const j = await res.json();
      const lista: TipoManutencao[] = j.tipos ?? [];
      setTipos(lista);
      setFonte(j.fonte ?? "auto");
      setSel(new Set(lista.filter((t) => t.conta).map((t) => t.codTipMan)));
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

  function toggle(cod: number) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(cod)) n.delete(cod);
      else n.add(cod);
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
        body: JSON.stringify({ codTipMans: Array.from(sel) }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErro(j.error || "Não foi possível salvar.");
        return;
      }
      setOkMsg("Configuração salva. Vale para os próximos fechamentos.");
      setFonte("config");
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
        subtitle="Escolha quais tipos de ordem de serviço do Engeman contam como falha / parada não planejada no MTBF/MTTR."
        breadcrumbs={[{ label: "PCM" }, { label: "Ativo Saúde" }, { label: "Tipos de OS" }]}
      />

      <div className="flex-1 overflow-y-auto px-8 pb-8 max-w-2xl">
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Os tipos marcados <strong>contam como parada não planejada</strong> (corretivas);
            inspeção/preventiva ficam desmarcadas. Muda os <strong>próximos fechamentos</strong> —
            meses já fechados não são alterados.
            {fonte === "auto" &&
              " Hoje está em auto-detecção (tipos com “CORRETIV” no nome); ao salvar, passa a valer exatamente a sua seleção."}
          </span>
        </div>

        {erro && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}
        {okMsg && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check className="w-4 h-4" /> {okMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-10">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando tipos…
          </div>
        ) : tipos.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Nenhum tipo carregado.
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
            <div className="rounded-xl border border-gray-300 bg-white divide-y divide-gray-100 overflow-hidden">
              {tipos.map((t) => (
                <label
                  key={t.codTipMan}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={sel.has(t.codTipMan)}
                    onChange={() => toggle(t.codTipMan)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="flex-1 text-sm text-gray-800">{t.descricao}</span>
                  <span className="text-[11px] text-gray-400 font-mono">#{t.codTipMan}</span>
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
              <span className="text-xs text-gray-400">
                {sel.size} de {tipos.length} contam como falha
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
