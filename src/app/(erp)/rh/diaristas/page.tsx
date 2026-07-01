"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import { cn, formatBRL } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { CalendarDays, Plus, Loader2, Users, Trash2 } from "lucide-react";

type Folha = {
  id: string;
  data: string;
  status: string;
  total: number | string;
  observacoes: string | null;
  criadoPor: string | null;
  qtdePessoas: number;
  qtdeBlocos: number;
};

const fmtData = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

export default function DiaristasPage() {
  useTabTitle("Lançamento de Diárias");
  const router = useRouter();
  const [folhas, setFolhas] = useState<Folha[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/rh/diaristas");
    const j = await res.json();
    setFolhas(Array.isArray(j.data) ? j.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function criar() {
    setCriando(true);
    const res = await fetch("/api/rh/diaristas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    setCriando(false);
    if (res.ok) { const j = await res.json(); router.push(`/rh/diaristas/${j.data.id}`); }
  }

  async function excluir(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir esta folha de diárias? Esta ação é permanente.")) return;
    const res = await fetch(`/api/rh/diaristas/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div>
      <PageHeader
        title="Lançamento de Diárias"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Lançamento de Diárias" }]}
      />
      <div className="px-8 pb-10 space-y-5">
        {/* Nova folha */}
        <div className="flex items-end gap-3 rounded-xl border border-border bg-card p-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data da folha</label>
            <DatePicker value={data} onChange={(v) => setData(v)} className="w-48" />
          </div>
          <Button onClick={criar} disabled={criando || !data} className="h-10 gap-1.5">
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nova folha
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : folhas.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium text-muted-foreground">Nenhuma folha de diárias ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Escolha uma data e clique em &quot;Nova folha&quot;.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Data</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Blocos</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Pessoas</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {folhas.map((f) => (
                  <tr key={f.id} onClick={() => router.push(`/rh/diaristas/${f.id}`)} className="hover:bg-info/10 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-foreground capitalize">{fmtData(f.data)}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{f.qtdeBlocos}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {f.qtdePessoas}</span></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatBRL(Number(f.total))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", f.status === "FECHADA" ? "bg-success/15 text-success" : "bg-info/15 text-info")}>
                        {f.status === "FECHADA" ? "Fechada" : "Aberta"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => excluir(f.id, e)} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 className="h-4 w-4" /></button>
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
