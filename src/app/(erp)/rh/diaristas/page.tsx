"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatBRL } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { CalendarDays, Plus, Loader2, Users, Trash2, Search } from "lucide-react";

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

type Colab = { id: string; nome: string; setor: { nome: string } | null };

// Ex.: "07/04/2026 - terça-feira"
const fmtData = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.toLocaleDateString("pt-BR")} - ${d.toLocaleDateString("pt-BR", { weekday: "long" })}`;
};

export default function DiaristasPage() {
  useTabTitle("Diárias");
  const router = useRouter();
  const [folhas, setFolhas] = useState<Folha[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);

  // Popup de novo lançamento: data + pré-seleção dos colaboradores
  const [novoOpen, setNovoOpen] = useState(false);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/rh/diaristas");
    const j = await res.json();
    setFolhas(Array.isArray(j.data) ? j.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function abrirNovo() {
    setData(new Date().toISOString().slice(0, 10));
    setSel(new Set()); setBusca("");
    setNovoOpen(true);
    if (colabs.length === 0) {
      fetch("/api/empresa/colaboradores?ativo=true")
        .then((r) => r.json())
        .then((j) => {
          const lista: Colab[] = Array.isArray(j) ? j : (j.data ?? []);
          setColabs(lista);
        });
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return colabs;
    return colabs.filter((c) => c.nome.toLowerCase().includes(q) || (c.setor?.nome ?? "").toLowerCase().includes(q));
  }, [colabs, busca]);

  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function criar() {
    setCriando(true);
    const res = await fetch("/api/rh/diaristas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, colaboradorIds: Array.from(sel) }),
    });
    setCriando(false);
    if (res.ok) { const j = await res.json(); setNovoOpen(false); router.push(`/rh/diaristas/${j.data.id}`); }
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
        title="Diárias"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Diárias" }]}
        action={
          <Button onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-2" /> Novo lançamento
          </Button>
        }
      />
      <div className="px-8 pb-10 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : folhas.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium text-muted-foreground">Nenhum lançamento ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em &quot;Novo lançamento&quot; para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Data</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Pessoas</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {folhas.map((f) => (
                  <tr key={f.id} onClick={() => router.push(`/rh/diaristas/${f.id}`)} className="hover:bg-info/10 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-foreground">{fmtData(f.data)}</td>
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

      {/* Popup: data + pré-seleção dos colaboradores do lançamento */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo lançamento de diárias</DialogTitle>
            <DialogDescription>
              Selecione quem vai constar neste lançamento — os blocos são montados automaticamente pelo setor de cada colaborador.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
              <DatePicker value={data} onChange={(v) => setData(v)} className="w-44" />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou setor..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <div className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border">
              {colabs.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : filtrados.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum colaborador encontrado.</p>
              ) : (
                filtrados.map((c) => (
                  <label key={c.id} className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted", sel.has(c.id) && "bg-info/5")}>
                    <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 rounded border-border" />
                    <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{c.nome}</span>
                    {c.setor?.nome && <span className="text-xs text-muted-foreground shrink-0">{c.setor.nome}</span>}
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">{sel.size} selecionado{sel.size !== 1 ? "s" : ""}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={criando}>Cancelar</Button>
            <Button onClick={criar} disabled={criando || !data}>
              {criando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar lançamento{sel.size > 0 ? ` (${sel.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
