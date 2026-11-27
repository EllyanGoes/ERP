"use client";

// Solicitar manutenção / Minhas solicitações. Qualquer usuário abre e acompanha
// as próprias SS. A TRIAGEM do PCM fica no quadro de OS (coluna Solicitações) —
// quem tem o módulo PCM é levado para lá.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { PrioridadeTxt, StatusOSBadge, fmtDataHora } from "@/components/manutencao/comum";
import { NovaSolicitacaoDialog, STATUS_SS, type SS } from "@/components/manutencao/SolicitacaoDialogs";

const ABAS = [
  { value: "ABERTA", label: "Aguardando" },
  { value: "CONVERTIDA", label: "Viraram OS" },
  { value: "ANEXADA", label: "Anexadas" },
  { value: "RECUSADA", label: "Recusadas" },
  { value: "todas", label: "Todas" },
];

export default function SolicitacoesServicoPage() {
  useTabTitle("Solicitar manutenção");
  const router = useRouter();
  const [aba, setAba] = usePersistedState<string>("pcm:ss:aba", "ABERTA");
  const [lista, setLista] = useState<SS[]>([]);
  const [loading, setLoading] = useState(true);
  const [nova, setNova] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/pcm/solicitacoes?status=${aba}&minhas=1`).then((r) => r.json()).catch(() => ({}));
    if (j.podeTriar) { router.replace("/pcm/os?visao=kanban"); return; }
    setLista(j.data ?? []); setLoading(false);
  }, [aba, router]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Solicitar manutenção" subtitle="Peça manutenção e acompanhe suas solicitações"
        breadcrumbs={[{ label: "Manutenção" }, { label: "Minhas solicitações" }]}
        action={<Button onClick={() => setNova(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova solicitação</Button>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {ABAS.map((a) => <button key={a.value} onClick={() => setAba(a.value)} className={cn("text-xs px-2.5 py-1 rounded-full border", aba === a.value ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{a.label}</button>)}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2">
            {lista.map((s) => (
              <div key={s.id} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[16rem]">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{s.numero}</span>
                      <span className="text-foreground">{s.ativo ? `${s.ativo.tag} — ${s.ativo.nome}` : s.localTexto ?? "—"}</span>
                      {s.ativoParado && <span className="text-[11px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">parado desde {fmtDataHora(s.paradoDesde)}</span>}
                      {s.prioridade && <PrioridadeTxt p={s.prioridade} />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{s.descricao}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{fmtDataHora(s.createdAt)}{s.triadoPor ? ` · analisada por ${s.triadoPor}` : ""}</p>
                    {s.status === "RECUSADA" && s.motivoRecusa && <p className="text-xs text-danger mt-1">Recusada: {s.motivoRecusa}</p>}
                  </div>
                  {s.ordem
                    ? <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">{s.ordem.numero} <StatusOSBadge s={s.ordem.status} /></span>
                    : <span className="text-xs text-muted-foreground">{STATUS_SS[s.status] ?? s.status}</span>}
                </div>
              </div>
            ))}
            {lista.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Nenhuma solicitação aqui.</p>}
          </div>
        )}
      </div>
      <NovaSolicitacaoDialog open={nova} onOpenChange={setNova} onCriada={() => { setAba("ABERTA"); load(); }} />
    </div>
  );
}
