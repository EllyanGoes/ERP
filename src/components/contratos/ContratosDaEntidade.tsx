"use client";

// Aba "Contratos" na ficha do fornecedor/cliente: lista os contratos da
// contraparte com situação e próximo evento.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, Semaforo, fmtBRL, fmtData, TIPO_CONTRATO, TIPO_EVENTO } from "@/components/contratos/comum";

type Row = { id: string; numero: string; titulo: string; tipo: string; lado: string; status: string; inicio: string; fimVigente: string | null; valorMensal: number; semaforo: "OK" | "ATENCAO" | "CRITICO"; proximoEvento: { tipo: string; data: string } | null };

export default function ContratosDaEntidade({ id }: { id: string }) {
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetch(`/api/contratos?parte=${id}`).then((r) => r.json()), fetch(`/api/contratos?parte=${id}&encerrados=1`).then((r) => r.json())])
      .then(([a, b]) => setRows([...(a.data ?? []), ...(b.data ?? [])])).catch(() => {}).finally(() => setLoading(false));
  }, [id]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
        <h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2"><FileSignature className="w-4 h-4" /> Contratos ({rows.length})</h2>
        <Link href="/contratos/lista" className="text-xs text-info hover:underline">abrir módulo</Link>
      </div>
      {rows.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">Nenhum contrato com esta contraparte.</p> : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-1.5 font-semibold">Contrato</th><th className="text-left px-3 py-1.5 font-semibold">Tipo</th><th className="text-left px-3 py-1.5 font-semibold">Vigência</th><th className="text-right px-3 py-1.5 font-semibold">Valor/mês</th><th className="text-left px-3 py-1.5 font-semibold">Status</th><th className="text-left px-3 py-1.5 font-semibold">Próximo evento</th><th className="px-3 py-1.5"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-border/60", ["ENCERRADO", "RESCINDIDO"].includes(r.status) && "opacity-60")}>
                <td className="px-4 py-2"><Link href={`/contratos/${r.id}`} className="text-foreground hover:text-info"><span className="text-xs text-muted-foreground mr-1">{r.numero}</span>{r.titulo}</Link></td>
                <td className="px-3 py-2 text-muted-foreground">{TIPO_CONTRATO[r.tipo] ?? r.tipo}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtData(r.inicio)} → {r.fimVigente ? fmtData(r.fimVigente) : "indeterminado"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.valorMensal ? fmtBRL(r.valorMensal) : "—"}</td>
                <td className="px-3 py-2"><StatusBadge s={r.status} /></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.proximoEvento ? `${TIPO_EVENTO[r.proximoEvento.tipo] ?? r.proximoEvento.tipo} · ${fmtData(r.proximoEvento.data)}` : "—"}</td>
                <td className="px-3 py-2"><Semaforo s={r.semaforo} label={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
