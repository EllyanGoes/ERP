"use client";

import { useEffect, useState } from "react";

// Linha "Último retroativo gerado em …" — o mesmo indicador do Diário Contábil,
// reaproveitado nos relatórios contábeis. Lê a última execução do reprocesso
// (persistida em Configuracao) via GET /api/contabilidade/backfill.
type Ultima = { at: string; processados?: number; total?: number; erros?: number; ok?: boolean; error?: string } | null;

export default function UltimoRetroativo({ className }: { className?: string }) {
  const [ultima, setUltima] = useState<Ultima>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/contabilidade/backfill")
      .then((r) => r.json())
      .then((j) => { if (!cancel) setUltima(j.ultima ?? null); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  if (!ultima?.at) return null;
  return (
    <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
      Último retroativo gerado em <span className="font-medium text-foreground">{new Date(ultima.at).toLocaleString("pt-BR")}</span>
      {ultima.ok === false
        ? <span className="text-danger"> · falhou</span>
        : <>{typeof ultima.processados === "number" ? ` · ${ultima.processados} lançamento(s) processado(s)` : ""}{ultima.erros ? ` · ${ultima.erros} com erro` : ""}</>}
    </p>
  );
}
