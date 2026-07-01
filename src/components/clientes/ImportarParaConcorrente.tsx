"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Loader2, Building2, Store, HardHat, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Botão "mapear" no detalhe do cliente: abre um diálogo perguntando a categoria
// (fornecedor / revendedor / construtora / consumidor final) e cria o concorrente
// vinculado (Parceiro). Se já existir, vai para o existente.
const CATEGORIAS = [
  { key: "ehFornecedor", label: "Fornecedor", Icon: Building2, cor: "border-amber-400 bg-amber-50 dark:bg-amber-500/15" },
  { key: "ehRevendedor", label: "Revendedor", Icon: Store, cor: "border-blue-400 bg-blue-50 dark:bg-blue-500/15" },
  { key: "ehConstrutora", label: "Construtora", Icon: HardHat, cor: "border-orange-400 bg-orange-50 dark:bg-orange-500/15" },
  { key: "ehConsumidorFinal", label: "Consumidor final", Icon: User, cor: "border-violet-400 bg-violet-50 dark:bg-violet-500/15" },
] as const;

type CatKey = (typeof CATEGORIAS)[number]["key"];

export default function ImportarParaConcorrente({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cats, setCats] = useState<Record<CatKey, boolean>>({ ehFornecedor: false, ehRevendedor: true, ehConstrutora: false, ehConsumidorFinal: false });

  const algumaMarcada = Object.values(cats).some(Boolean);

  async function confirmar() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/marketing/concorrentes/importar-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, ...cats }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/marketing/inteligencia-comercial/${json.data.id}`);
      } else if (res.status === 409 && json.concorrenteId) {
        router.push(`/marketing/inteligencia-comercial/${json.concorrenteId}`);
      } else {
        setErro(json.error ?? "Erro ao mapear.");
        setLoading(false);
      }
    } catch {
      setErro("Erro de conexão.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setErro(null); setAberto(true); }}
        title="Mapear este cliente na Inteligência Comercial (Parceiro)"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70 transition-colors"
      >
        <Target className="h-3.5 w-3.5" /> Não mapeado · mapear
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setAberto(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Target className="h-4 w-4 text-fuchsia-600" /> Mapear na Inteligência Comercial</h3>
              <button onClick={() => setAberto(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Como este concorrente atua? Marque uma ou mais categorias.</p>

            <div className="grid grid-cols-2 gap-2">
              {CATEGORIAS.map(({ key, label, Icon, cor }) => {
                const on = cats[key];
                return (
                  <button key={key} type="button" onClick={() => setCats((c) => ({ ...c, [key]: !c[key] }))}
                    className={cn("flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors", on ? cor : "border-border hover:bg-muted")}>
                    <Icon className={cn("h-4 w-4 shrink-0", on ? "text-foreground" : "text-muted-foreground")} />
                    <span className="text-foreground">{label}</span>
                  </button>
                );
              })}
            </div>

            {erro && <p className="text-xs text-danger mt-3">{erro}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setAberto(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={confirmar} disabled={loading || !algumaMarcada}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-700 disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />} Mapear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
