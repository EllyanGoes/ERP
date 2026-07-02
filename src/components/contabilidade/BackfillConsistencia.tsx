"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { invalidarCache } from "@/lib/use-cached-data";

// Botão "Backfill de consistência" reutilizável (Diário, Razão, DRE, Balancete,
// Balanço, Diagnóstico), com barra de progresso em tempo real (stream SSE) e a
// linha "Último backfill em…". Acompanha também uma execução disparada em outra
// aba/sessão (progresso persistido com heartbeat). Substituiu o antigo "Gerar
// retroativos": o motor re-sincroniza por origem o que diverge (títulos, pedidos,
// devoluções, frete/desconto das entradas) e remove órfãos — sem apagar e
// regravar tudo. `onDone` recarrega o relatório anfitrião; o cache contábil é
// limpo antes.
type Ultima = { at: string; erros?: number; ok?: boolean; error?: string } | null;
type Barra = { pct: number; fase: string } | null;

export default function BackfillConsistencia({ onDone, className }: { onDone?: () => void; className?: string }) {
  const [rodandoLocal, setRodandoLocal] = useState(false);
  const [progresso, setProgresso] = useState<Barra>(null);
  const [remotoAtivo, setRemotoAtivo] = useState(false);
  const [progressoRemoto, setProgressoRemoto] = useState<Barra>(null);
  const [ultima, setUltima] = useState<Ultima>(null);
  const [aviso, setAviso] = useState("");

  const checar = useCallback(async (): Promise<boolean> => {
    try {
      const j = await fetch("/api/contabilidade/backfill-consistencia").then((r) => r.json());
      setProgressoRemoto(j.progresso ?? null);
      setUltima(j.ultima ?? null);
      return !!j.running;
    } catch { return false; }
  }, []);

  useEffect(() => { checar().then(setRemotoAtivo); }, [checar]);

  // Ao concluir: limpa o cache contábil (os saldos mudaram) e recarrega o relatório.
  const concluir = useCallback(() => { invalidarCache(); onDone?.(); }, [onDone]);

  // Segue uma execução iniciada em outra sessão: polla até terminar e recarrega.
  useEffect(() => {
    if (!remotoAtivo || rodandoLocal) return;
    let parar = false;
    const t = setInterval(async () => {
      const rodando = await checar();
      if (parar) return;
      if (!rodando) { setRemotoAtivo(false); setProgressoRemoto(null); setAviso("Backfill de consistência concluído."); concluir(); }
    }, 2000);
    return () => { parar = true; clearInterval(t); };
  }, [remotoAtivo, rodandoLocal, checar, concluir]);

  async function executar() {
    if (!window.confirm("Rodar o backfill de consistência? É idempotente (re-rodar não duplica) e pode levar alguns minutos.")) return;
    setRodandoLocal(true); setAviso(""); setProgresso({ pct: 0, fase: "Iniciando" });
    try {
      const res = await fetch("/api/contabilidade/backfill-consistencia", { method: "POST" });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        // 409: já há uma execução rodando — segue o job (barra com % persistido).
        if (res.status === 409) { setRemotoAtivo(true); checar(); }
        else setAviso(j.error || "Erro no backfill de consistência");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: { done?: boolean; log?: string[]; erros?: string[]; error?: string } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n\n");
        buffer = partes.pop() ?? "";
        for (const parte of partes) {
          const linha = parte.replace(/^data:\s*/, "").trim();
          if (!linha) continue;
          try {
            const obj = JSON.parse(linha);
            if (obj.done) final = obj;
            else if (typeof obj.pct === "number") setProgresso({ pct: obj.pct, fase: obj.fase ?? "" });
          } catch { /* linha parcial */ }
        }
      }
      if (final?.error) setAviso(final.error);
      else if (final) {
        setProgresso({ pct: 100, fase: "Concluído" });
        console.log("[backfill-consistencia]", final.log, final.erros);
        setAviso(final.erros?.length
          ? `Backfill concluído com ${final.erros.length} pendência(s) — detalhe no console do navegador.`
          : "Backfill de consistência concluído sem erros.");
        concluir();
      }
    } catch {
      setAviso("Erro de conexão durante o backfill.");
    } finally {
      setRodandoLocal(false);
      setProgresso(null);
      checar();
    }
  }

  const barra = progresso ?? progressoRemoto;
  const rodando = rodandoLocal || remotoAtivo;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {ultima?.at ? (
          <p className="text-xs text-muted-foreground">
            Último backfill de consistência em <span className="font-medium text-foreground">{new Date(ultima.at).toLocaleString("pt-BR")}</span>
            {ultima.ok === false
              ? <span className="text-danger"> · falhou{ultima.error ? ` (${ultima.error})` : ""}</span>
              : <>{ultima.erros ? ` · ${ultima.erros} pendência(s)` : " · sem pendências"}</>}
          </p>
        ) : <span className="text-xs text-muted-foreground">Re-sincroniza a contabilidade com os documentos (só corrige o que diverge).</span>}
        <Button size="sm" variant="outline" onClick={executar} disabled={rodando}>
          {rodando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
          {rodando ? `Consistência… ${barra?.pct ?? 0}%` : "Backfill de consistência"}
        </Button>
      </div>
      {rodando && barra && (
        <div className="mt-2 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Backfill de consistência{barra.fase ? ` — ${barra.fase}` : ""}…</span>
            <span className="font-semibold tabular-nums">{barra.pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-info/20 overflow-hidden">
            <div className="h-full rounded-full bg-info transition-all duration-300" style={{ width: `${barra.pct}%` }} />
          </div>
        </div>
      )}
      {aviso && !rodando && <div className="mt-2 rounded-lg border border-info/30 bg-info/10 px-4 py-2.5 text-sm text-info">{aviso}</div>}
    </div>
  );
}
