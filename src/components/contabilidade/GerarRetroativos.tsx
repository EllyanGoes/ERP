"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { invalidarCache } from "@/lib/use-cached-data";

// Botão "Gerar retroativos" reutilizável (mesmo do Diário Contábil), com barra de
// progresso em tempo real (stream SSE) e a linha "Último retroativo gerado em…".
// Acompanha também um reprocesso disparado em outra aba/sessão (progresso persistido).
// `onDone` recarrega o relatório anfitrião ao concluir; o cache contábil é limpo antes.
type Ultima = { at: string; processados?: number; total?: number; erros?: number; ok?: boolean; error?: string } | null;
type Barra = { pct: number; fase: string } | null;

export default function GerarRetroativos({ onDone, className }: { onDone?: () => void; className?: string }) {
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<Barra>(null);
  const [reprocessoAtivo, setReprocessoAtivo] = useState(false);
  const [progressoRemoto, setProgressoRemoto] = useState<Barra>(null);
  const [ultima, setUltima] = useState<Ultima>(null);
  const [aviso, setAviso] = useState("");

  const checar = useCallback(async (): Promise<boolean> => {
    try {
      const j = await fetch("/api/contabilidade/backfill").then((r) => r.json());
      setProgressoRemoto(j.progresso ?? null);
      setUltima(j.ultima ?? null);
      return !!j.running;
    } catch { return false; }
  }, []);

  useEffect(() => { checar().then(setReprocessoAtivo); }, [checar]);

  // Ao concluir: limpa o cache contábil (os saldos mudaram) e recarrega o relatório.
  const concluir = useCallback(() => { invalidarCache(); onDone?.(); }, [onDone]);

  // Segue um reprocesso iniciado em outra sessão: polla até terminar e recarrega.
  useEffect(() => {
    if (!reprocessoAtivo || gerando) return;
    let parar = false;
    const t = setInterval(async () => {
      const rodando = await checar();
      if (parar) return;
      if (!rodando) { setReprocessoAtivo(false); setProgressoRemoto(null); setAviso("Reprocesso concluído."); concluir(); }
    }, 2000);
    return () => { parar = true; clearInterval(t); };
  }, [reprocessoAtivo, gerando, checar, concluir]);

  async function gerar() {
    setGerando(true); setAviso(""); setProgresso({ pct: 0, fase: "Iniciando" });
    try {
      const res = await fetch("/api/contabilidade/backfill?reset=vendas", { method: "POST" });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409) { setReprocessoAtivo(true); checar(); }
        else setAviso(j.error || "Erro ao gerar lançamentos");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: { processados?: number; erros?: string[]; error?: string } | null = null;
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
        setAviso(`${final.processados} título(s) processado(s).${final.erros?.length ? ` ${final.erros.length} com erro.` : ""}`);
        concluir();
      }
    } catch {
      setAviso("Erro de conexão durante o reprocesso.");
    } finally {
      setGerando(false);
      setProgresso(null);
      checar();
    }
  }

  const barra = progresso ?? progressoRemoto;
  const rodando = gerando || reprocessoAtivo;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {ultima?.at ? (
          <p className="text-xs text-muted-foreground">
            Último retroativo gerado em <span className="font-medium text-foreground">{new Date(ultima.at).toLocaleString("pt-BR")}</span>
            {ultima.ok === false
              ? <span className="text-danger"> · falhou</span>
              : <>{typeof ultima.processados === "number" ? ` · ${ultima.processados} lançamento(s) processado(s)` : ""}{ultima.erros ? ` · ${ultima.erros} com erro` : ""}</>}
          </p>
        ) : <span className="text-xs text-muted-foreground">Gera os lançamentos contábeis a partir dos documentos.</span>}
        <Button size="sm" variant="outline" onClick={gerar} disabled={rodando}>
          {rodando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
          {rodando ? `Gerando… ${barra?.pct ?? 0}%` : "Gerar retroativos"}
        </Button>
      </div>
      {rodando && barra && (
        <div className="mt-2 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Gerando lançamentos retroativos{barra.fase ? ` — ${barra.fase}` : ""}…</span>
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
