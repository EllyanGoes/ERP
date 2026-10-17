"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Solicitacao = {
  id: string; entidade: string; registroId: string; descricao: string; motivo: string | null;
  solicitadoPorNome: string | null; createdAt: string;
};

/** Pedidos de exclusão de colaborador aguardando o aprovador logado (some quando não há). */
export default function ExclusoesPendentes({ onChange }: { onChange?: () => void }) {
  const [itens, setItens] = useState<Solicitacao[]>([]);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/aprovacoes/exclusoes?status=PENDENTE");
    if (r.ok) setItens((await r.json()).data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decidir(id: string, acao: "aprovar" | "reprovar") {
    setBusy(id + acao); setErro("");
    const r = await fetch(`/api/aprovacoes/exclusoes/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, observacao: obs[id] ?? "" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setErro(j.error || "Erro ao decidir"); return; }
    await load(); onChange?.();
    window.dispatchEvent(new Event("aprovacoes:changed"));
  }

  if (itens.length === 0) return null;
  return (
    <div id="exclusoes" className="mb-6 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3"><Trash2 className="w-4 h-4 text-danger" /> Exclusões de colaborador aguardando aprovação <span className="rounded-full bg-danger text-white text-[10px] px-1.5 py-0.5">{itens.length}</span></p>
      {erro && <p className="text-sm text-danger mb-2">{erro}</p>}
      <div className="space-y-2">
        {itens.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card px-3 py-2.5 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[14rem]">
              <Link href={`/empresa/colaboradores/${s.registroId}`} className="font-medium text-foreground hover:underline">{s.descricao}</Link>
              <p className="text-xs text-muted-foreground">Pedido por {s.solicitadoPorNome ?? "—"} em {new Date(s.createdAt).toLocaleString("pt-BR")}{s.motivo ? ` · Motivo: ${s.motivo}` : ""}</p>
              <p className="text-[11px] text-muted-foreground">Aprovar apaga o cadastro e, junto, ASOs, exames, EPIs, função SST e histórico funcional (fica um snapshot para reconstrução).</p>
            </div>
            <Input value={obs[s.id] ?? ""} onChange={(e) => setObs((o) => ({ ...o, [s.id]: e.target.value }))} placeholder="Observação (opcional)" className="w-56 h-8 text-sm" />
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decidir(s.id, "reprovar")} className="gap-1">
              {busy === s.id + "reprovar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Reprovar
            </Button>
            <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => decidir(s.id, "aprovar")} className="gap-1">
              {busy === s.id + "aprovar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Aprovar exclusão
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
