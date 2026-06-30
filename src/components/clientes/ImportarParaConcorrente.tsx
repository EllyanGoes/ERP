"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Loader2 } from "lucide-react";

// Botão "Cadastrar como concorrente" no detalhe do cliente. Cria o concorrente
// vinculado (Parceiro) e abre o cadastro. Se já existir, vai para o existente.
export default function ImportarParaConcorrente({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function importar() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/marketing/concorrentes/importar-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/marketing/inteligencia-comercial/${json.data.id}`);
      } else if (res.status === 409 && json.concorrenteId) {
        router.push(`/marketing/inteligencia-comercial/${json.concorrenteId}`);
      } else {
        setErro(json.error ?? "Erro ao importar.");
        setLoading(false);
      }
    } catch {
      setErro("Erro de conexão.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={importar}
      disabled={loading}
      title={erro ?? "Mapear este cliente na Inteligência Comercial (Parceiro)"}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70 transition-colors disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
      Não mapeado · mapear
    </button>
  );
}
