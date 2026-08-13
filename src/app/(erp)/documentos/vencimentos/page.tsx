"use client";

// Agenda de vencimentos — vencidos + próximos 90 dias, agrupados por mês.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, CalendarClock, AlertTriangle } from "lucide-react";
import { DocumentoListaDTO, StatusDocBadge, entidadeVinculada } from "@/components/documentos/comum";

export default function VencimentosPage() {
  const router = useRouter();
  useTabTitle("Vencimentos de Documentos");

  const [documentos, setDocumentos] = useState<DocumentoListaDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/documentos/vencimentos")
      .then((r) => r.json())
      .then((j) => setDocumentos(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const vencidos = documentos.filter((d) => d.status === "VENCIDO");
  const futuros = documentos.filter((d) => d.status !== "VENCIDO");

  // Agrupa futuros por mês da validade
  const porMes = new Map<string, DocumentoListaDTO[]>();
  for (const d of futuros) {
    if (!d.validade) continue;
    const v = new Date(d.validade);
    const chave = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
    porMes.set(chave, [...(porMes.get(chave) ?? []), d]);
  }

  function Linha({ d }: { d: DocumentoListaDTO }) {
    const v = d.validade ? new Date(d.validade) : null;
    const dias = v ? Math.round((v.setHours(0, 0, 0, 0), v.getTime() - hoje.getTime()) / 86_400_000) : null;
    return (
      <button
        onClick={() => router.push(`/documentos/${d.id}`)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium truncate">{d.titulo}</p>
          <p className="text-xs text-muted-foreground truncate">
            {d.categoria.nome}
            {entidadeVinculada(d) ? ` · ${entidadeVinculada(d)}` : ""}
            {d.responsavel ? ` · ${d.responsavel.nome}` : ""}
          </p>
        </div>
        <StatusDocBadge status={d.status} />
        <span className={cn(
          "text-sm whitespace-nowrap w-28 text-right",
          d.status === "VENCIDO" ? "text-danger font-semibold" : dias !== null && dias <= 7 ? "text-warning font-semibold" : "text-foreground"
        )}>
          {d.validade ? new Date(d.validade).toLocaleDateString("pt-BR") : "—"}
        </span>
        <span className="text-xs text-muted-foreground w-24 text-right whitespace-nowrap">
          {dias === null ? "" : dias < 0 ? `há ${-dias}d` : dias === 0 ? "HOJE" : `em ${dias}d`}
        </span>
      </button>
    );
  }

  return (
    <div>
      <PageHeader title="Vencimentos" />
      <div className="px-8 pb-8 space-y-6 max-w-4xl">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : documentos.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum documento com validade nos próximos 90 dias. 🎉</p>
          </div>
        ) : (
          <>
            {vencidos.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-danger uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4" /> Vencidos ({vencidos.length})
                </div>
                <div className="bg-card rounded-xl border border-danger/30 divide-y divide-border overflow-hidden">
                  {vencidos.map((d) => <Linha key={d.id} d={d} />)}
                </div>
              </div>
            )}
            {Array.from(porMes.entries()).map(([mes, lista]) => (
              <div key={mes}>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 capitalize">
                  {new Date(`${mes}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} ({lista.length})
                </p>
                <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {lista.map((d) => <Linha key={d.id} d={d} />)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
