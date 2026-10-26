"use client";

// Liga uma OS já existente da Manutenção a uma tarefa do Projetos (alternativa a
// criar uma nova). Busca por número, descrição ou ativo; OS ligada a outra
// tarefa aparece desabilitada (uma OS pertence a uma tarefa só).
import { useEffect, useState } from "react";
import { Link2, Loader2, Search, X } from "lucide-react";
import ModalPortal from "@/components/shared/ModalPortal";
import EscClose from "@/components/shared/EscClose";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusOSBadge, api, fmtData } from "@/components/manutencao/comum";

type OsBusca = {
  id: string; numero: string; status: string; descricao: string; createdAt: string; tarefaId: string | null;
  ativo: { tag: string; nome: string } | null;
};

export default function VincularOsTarefaDialog({ tarefa, onFechar, onVinculada }: {
  tarefa: { id: string; titulo: string };
  onFechar: () => void;
  onVinculada: (os: { id: string; numero: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<OsBusca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Busca no servidor com debounce; sem termo, mostra as mais recentes.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const t = setTimeout(() => {
      fetch(`/api/pcm/os?situacao=todas${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => r.json())
        .then((j) => { if (vivo) setLista((j.data ?? []).slice(0, 60)); })
        .catch(() => {})
        .finally(() => { if (vivo) setCarregando(false); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  async function confirmar() {
    if (!sel || salvando) return;
    setSalvando(true); setErro("");
    const r = await api<{ id: string; numero: string }>(`/api/projetos/tarefas/${tarefa.id}/ordem-servico`, "PUT", { ordemId: sel });
    setSalvando(false);
    if (!r.ok) { setErro(r.error!); return; }
    onVinculada(r.data!);
  }

  const escolhida = lista.find((o) => o.id === sel);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[9500] flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      >
        <EscClose onClose={onFechar} />
        <div className="bg-card rounded-2xl shadow-2xl w-full sm:max-w-xl flex flex-col max-h-[88vh]">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">Vincular OS existente</h2>
                <p className="text-xs text-muted-foreground truncate">à tarefa “{tarefa.titulo}”</p>
              </div>
            </div>
            <button onClick={onFechar} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-5 h-5" /></button>
          </div>

          <div className="px-6 pt-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, descrição ou ativo…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="px-6 py-3 overflow-y-auto flex-1 min-h-[200px] space-y-1.5">
            {carregando ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : lista.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Nenhuma OS encontrada.</p>
            ) : lista.map((o) => {
              const daTarefa = o.tarefaId === tarefa.id;
              const deOutra = !!o.tarefaId && !daTarefa;
              const bloqueada = daTarefa || deOutra;
              return (
                <button
                  key={o.id} type="button" disabled={bloqueada} onClick={() => setSel(o.id)}
                  className={cn(
                    "w-full text-left border rounded-lg px-3 py-2 transition-colors",
                    sel === o.id ? "border-blue-500 bg-blue-500/10" : "border-border bg-card hover:bg-muted",
                    bloqueada && "opacity-50 cursor-not-allowed hover:bg-card",
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{o.numero}</span>
                    <StatusOSBadge s={o.status} />
                    <span className="text-xs text-muted-foreground truncate">{o.ativo ? `${o.ativo.tag} — ${o.ativo.nome}` : "sem ativo"}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{fmtData(o.createdAt)}</span>
                  </div>
                  <p className="text-xs text-foreground/80 line-clamp-2 mt-0.5">{o.descricao}</p>
                  {daTarefa && <p className="text-[11px] text-muted-foreground mt-0.5">Já ligada a esta tarefa</p>}
                  {deOutra && <p className="text-[11px] text-warning mt-0.5">Ligada a outra tarefa</p>}
                </button>
              );
            })}
          </div>

          {erro && <p className="px-6 pb-2 text-sm text-danger">{erro}</p>}
          <div className="px-6 py-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-xs text-muted-foreground flex-1">
              {escolhida ? `${escolhida.numero} fica ligada à tarefa; custos e materiais dela aparecem no cartão.` : "Escolha a OS na lista."}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
              <Button onClick={confirmar} disabled={!sel || salvando} className="gap-1">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Vincular
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
