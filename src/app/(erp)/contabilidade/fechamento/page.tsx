"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/utils";
import { Lock, Unlock, Loader2, CalendarCheck } from "lucide-react";

type Fechamento = {
  id: string;
  exercicio: number;
  resultado: string | number;
  status: "FECHADO" | "REABERTO";
  dataFim: string;
  reabertoEm: string | null;
};

export default function FechamentoPage() {
  const [lista, setLista] = useState<Fechamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/contabilidade/fechamento")
      .then((r) => r.json())
      .then((d) => setLista(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const fechados = lista.filter((f) => f.status === "FECHADO");
  const ultimoFechado = fechados.length ? Math.max(...fechados.map((f) => f.exercicio)) : null;

  async function reabrir(f: Fechamento) {
    if (!confirm(`Reabrir o exercício ${f.exercicio}? O encerramento será desfeito.`)) return;
    setBusy(f.id);
    const res = await fetch(`/api/contabilidade/fechamento/${f.id}/reabrir`, { method: "POST" });
    setBusy(null);
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? "Erro ao reabrir"); return; }
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Encerramento do Exercício"
        subtitle="Fecha o resultado contra o Patrimônio Líquido e trava o período"
        actions={<EncerrarDialog onDone={load} />}
      />

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-3 font-medium">Exercício</th>
              <th className="px-6 py-3 font-medium text-right">Resultado apurado</th>
              <th className="px-6 py-3 font-medium">Situação</th>
              <th className="px-6 py-3 font-medium w-24" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">Nenhum exercício encerrado.</td></tr>
            ) : lista.map((f) => {
              const res = Number(f.resultado);
              return (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-muted">
                  <td className="px-6 py-3 font-medium text-foreground">{f.exercicio}</td>
                  <td className={`px-6 py-3 text-right tabular-nums ${res >= 0 ? "text-foreground" : "text-danger"}`}>
                    {formatBRL(res)} <span className="text-xs text-muted-foreground">{res >= 0 ? "lucro" : "prejuízo"}</span>
                  </td>
                  <td className="px-6 py-3">
                    {f.status === "FECHADO" ? (
                      <span className="inline-flex items-center gap-1.5 text-success"><Lock className="w-3.5 h-3.5" />Encerrado</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Unlock className="w-3.5 h-3.5" />Reaberto</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {f.status === "FECHADO" && f.exercicio === ultimoFechado && (
                      <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => reabrir(f)}>
                        {busy === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reabrir"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EncerrarDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [exercicio, setExercicio] = useState(String(new Date().getUTCFullYear() - 1));
  const [preview, setPreview] = useState<{ resultado: number; podeFechar: boolean; jaFechado: boolean } | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarPreview = useCallback(async (ano: string) => {
    const n = parseInt(ano, 10);
    if (Number.isNaN(n)) { setPreview(null); return; }
    setLoadingPrev(true);
    const res = await fetch(`/api/contabilidade/fechamento?preview=1&exercicio=${n}`);
    const d = await res.json().catch(() => ({}));
    setLoadingPrev(false);
    setPreview(res.ok ? d.data : null);
  }, []);

  useEffect(() => { if (open) carregarPreview(exercicio); }, [open, exercicio, carregarPreview]);

  async function encerrar() {
    setSaving(true); setErro(null);
    const res = await fetch("/api/contabilidade/fechamento", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercicio: parseInt(exercicio, 10) }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErro(d.error ?? "Erro ao encerrar"); return; }
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <CalendarCheck className="w-4 h-4 mr-1.5" /> Encerrar exercício
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Encerrar exercício</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Exercício (ano)</Label>
            <Input type="number" min={2000} max={2100} value={exercicio} onChange={(e) => setExercicio(e.target.value)} />
          </div>
          <div className="rounded-lg bg-muted p-3 text-sm">
            {loadingPrev ? (
              <span className="text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> apurando…</span>
            ) : preview ? (
              <>
                <p>Resultado apurado: <strong className={preview.resultado >= 0 ? "" : "text-danger"}>{formatBRL(preview.resultado)}</strong> ({preview.resultado >= 0 ? "lucro" : "prejuízo"})</p>
                {preview.jaFechado && <p className="text-warning text-xs mt-1">Exercício já encerrado.</p>}
                {!preview.podeFechar && !preview.jaFechado && <p className="text-warning text-xs mt-1">Há exercício posterior já encerrado — encerre em ordem.</p>}
              </>
            ) : <span className="text-muted-foreground">—</span>}
          </div>
          <p className="text-xs text-muted-foreground">Zera as contas de resultado contra Lucros/Prejuízos Acumulados e trava lançamentos até 31/12 do exercício.</p>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter>
          <Button onClick={encerrar} disabled={saving || !preview?.podeFechar}>{saving ? "Encerrando..." : "Encerrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
