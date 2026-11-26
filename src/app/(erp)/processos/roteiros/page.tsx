"use client";

// Configuração dos roteiros (tarefas padrão) por tipo de processo. Ao criar um processo do tipo,
// o cadastro oferece aplicar o roteiro → cada etapa vira um prazo (docs/processos-prd.md, Fase 1.5 item 3).
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { TIPOS_PROCESSO, api, useLookups } from "@/components/processos/comum";
import { BASES, RoteiroEditor, type Roteiro } from "@/components/processos/roteiros";

export default function RoteirosPage() {
  useTabTitle("Roteiros de processos");
  const lk = useLookups();
  const [lista, setLista] = useState<Roteiro[]>([]); const [loading, setLoading] = useState(true); const [pode, setPode] = useState(false);
  const [editando, setEditando] = useState<Roteiro | "novo" | null>(null);
  const [excluir, setExcluir] = useState<Roteiro | null>(null);
  const load = useCallback(async () => {
    const j = await fetch("/api/processos/roteiros?todos=1").then((r) => r.json()).catch(() => ({}));
    setLista(j.data ?? []); setPode(!!j.podeEditar); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function remover() { if (!excluir) return; await api(`/api/processos/roteiros?id=${excluir.id}`, "DELETE"); setExcluir(null); load(); }

  return (
    <div>
      <PageHeader title="Roteiros por tipo" subtitle="Tarefas padrão que viram prazos ao criar um processo do tipo" breadcrumbs={[{ label: "Processos", href: "/processos" }, { label: "Roteiros" }]}
        action={pode ? <Button onClick={() => setEditando("novo")} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo roteiro</Button> : undefined} />
      <div className="px-8 pb-8 space-y-3">
        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhum roteiro cadastrado.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {lista.map((r) => (
              <div key={r.id} className={cn("bg-card border border-border rounded-xl p-4", !r.ativo && "opacity-60")}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">{TIPOS_PROCESSO[r.tipo] ?? r.tipo}{!r.ativo && " · inativo"}</div>
                    <div className="font-medium">{r.nome}</div>
                    {r.descricao && <p className="text-xs text-muted-foreground mt-0.5">{r.descricao}</p>}
                  </div>
                  {pode && <>
                    <button onClick={() => setEditando(r)} className="text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setExcluir(r)} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                  </>}
                </div>
                <ol className="mt-3 space-y-1">
                  {r.etapas.map((e, i) => (
                    <li key={e.id ?? i} className="text-sm flex gap-2">
                      <span className="text-xs text-muted-foreground w-4 text-right pt-0.5">{i + 1}.</span>
                      <span className="flex-1">{e.titulo}<span className="block text-[11px] text-muted-foreground">{e.dias} dia(s) {e.diasUteis ? "úteis" : "corridos"} {BASES[e.base] ?? ""}{e.responsavel ? ` · ${e.responsavel.nome}` : ""}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editando === "novo" ? "Novo roteiro" : "Editar roteiro"}</DialogTitle></DialogHeader>
          {editando && <RoteiroEditor roteiro={editando === "novo" ? undefined : editando} usuarios={lk.usuarios} onCancelar={() => setEditando(null)} onSalvo={() => { setEditando(null); load(); }} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!excluir} onOpenChange={(v) => !v && setExcluir(null)} title="Excluir roteiro?" description={`${excluir?.nome ?? ""}. Os prazos já criados nos processos continuam.`} onConfirm={remover} confirmLabel="Excluir" />
    </div>
  );
}
