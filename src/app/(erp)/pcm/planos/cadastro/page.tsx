"use client";

// Cadastro de planos de manutenção: lista com os ativos aplicados e o próximo
// vencimento de cada um. Edição (checklist, kit, gatilhos) em /pcm/planos/cadastro/[id].
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Search } from "lucide-react";
import { api, fmtData, useManutLookups } from "@/components/manutencao/comum";

type Plano = {
  id: string; codigo: string; nome: string; ativo: boolean; tipo: { sigla: string; nome: string }; equipe: { nome: string } | null;
  _count: { tarefas: number; materiais: number };
  ativos: { id: string; gatilho: string; intervaloDias: number | null; intervaloMedida: string | null; proximoVencimento: string | null; proximaMedida: string | null; ativo: boolean;
    ativoRef: { tag: string; nome: string }; medidor: { unidade: string; acumulado: string } | null }[];
};

export default function PlanosCadastroPage() {
  useTabTitle("Planos de manutenção");
  const router = useRouter();
  const lk = useManutLookups();
  const [lista, setLista] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = usePersistedState<boolean>("pcm:planos:inativos", false);
  useEffect(() => { fetch("/api/pcm/planos-cadastro").then((r) => r.json()).then((j) => { setLista(j.data ?? []); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const visiveis = useMemo(() => lista.filter((p) => mostrarInativos || p.ativo).filter((p) => !busca || `${p.codigo} ${p.nome} ${p.ativos.map((a) => `${a.ativoRef.tag} ${a.ativoRef.nome}`).join(" ")}`.toLowerCase().includes(busca.toLowerCase())), [lista, busca, mostrarInativos]);
  const hoje = new Date(new Date().toDateString());

  const [novo, setNovo] = useState<{ nome: string; tipoId: string; equipeId: string } | null>(null);
  const [erro, setErro] = useState(""); const [saving, setSaving] = useState(false);
  async function criar() {
    if (!novo) return;
    setSaving(true); setErro("");
    const r = await api<{ id: string }>("/api/pcm/planos-cadastro", "POST", novo);
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    router.push(`/pcm/planos/cadastro/${r.data!.id}`);
  }

  return (
    <div>
      <PageHeader title="Planos de manutenção" subtitle="Preventivas, inspeções e lubrificação — por calendário ou por horímetro" breadcrumbs={[{ label: "Manutenção" }, { label: "Planos", href: "/pcm/planos" }, { label: "Cadastro" }]}
        action={<Button onClick={() => { setErro(""); setNovo({ nome: "", tipoId: lk.tipos.find((t) => t.natureza === "PREVENTIVA")?.id ?? "", equipeId: "" }); }} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo plano</Button>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5"><input type="checkbox" className="rounded" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos</label>
          <div className="relative ml-auto"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Plano ou ativo…" className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" /></div>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Plano</th><th className="text-left px-3 py-2 font-semibold">Tipo</th><th className="text-left px-3 py-2 font-semibold">Equipe</th><th className="text-left px-3 py-2 font-semibold">Checklist</th><th className="text-left px-3 py-2 font-semibold">Ativos e próximo vencimento</th></tr></thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.id} onClick={() => router.push(`/pcm/planos/cadastro/${p.id}`)} className={cn("border-t border-border/60 hover:bg-muted/40 cursor-pointer align-top", !p.ativo && "opacity-50")}>
                    <td className="px-4 py-2"><span className="text-xs text-muted-foreground">{p.codigo}</span> <span className="text-foreground">{p.nome}</span>{!p.ativo && <span className="ml-1 text-[10px]">(inativo)</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={p.tipo.nome}>{p.tipo.sigla}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.equipe?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p._count.tarefas} itens{p._count.materiais ? ` · kit ${p._count.materiais}` : ""}</td>
                    <td className="px-3 py-2 text-xs">
                      {p.ativos.length === 0 ? <span className="text-warning">sem ativo — não gera OS</span> : p.ativos.map((a) => {
                        const vencido = a.gatilho === "CALENDARIO" && a.proximoVencimento && new Date(a.proximoVencimento) < hoje;
                        return <div key={a.id} className={cn(!a.ativo && "line-through opacity-60")}>
                          <span className="text-foreground">{a.ativoRef.tag}</span>{" "}
                          {a.gatilho === "CALENDARIO" ? <span className={cn(vencido ? "text-danger" : "text-muted-foreground")}>a cada {a.intervaloDias} d · {fmtData(a.proximoVencimento)}</span>
                            : <span className="text-muted-foreground">a cada {Number(a.intervaloMedida)} {a.medidor?.unidade ?? ""} · próx. {a.proximaMedida ? Number(a.proximaMedida) : "—"} (atual {a.medidor ? Number(a.medidor.acumulado) : "—"})</span>}
                        </div>;
                      })}
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum plano.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!novo} onOpenChange={(v) => !v && setNovo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Novo plano</DialogTitle></DialogHeader>
          {novo && <div className="space-y-3">
            <div><Label>Nome</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Preventiva 250 h — pá carregadeira" /></div>
            <div><Label>Tipo</Label><SelectMenu value={novo.tipoId} onChange={(v) => setNovo({ ...novo, tipoId: v })} options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
            <div><Label>Equipe</Label><SelectMenu value={novo.equipeId} onChange={(v) => setNovo({ ...novo, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button><Button onClick={criar} disabled={saving}>{saving ? "Criando…" : "Criar e configurar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
