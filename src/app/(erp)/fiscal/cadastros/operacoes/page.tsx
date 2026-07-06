"use client";

// Operações fiscais (natureza de operação da NF — vira natOp). Eixo FISCAL,
// separado do TES: o TES segue só no gerencial de entrada e nunca decide a
// emissão. Por empresa (empresa ativa).

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Pencil, Trash2, Loader2, X, Save, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Operacao = {
  id: string;
  codigo: string;
  descricao: string;
  finalidade: number;
  tipoOperacao: number;
  ativo: boolean;
  _count: { regras: number };
};

const FINALIDADES: Record<number, string> = { 1: "Normal", 2: "Complementar", 3: "Ajuste", 4: "Devolução" };

export default function OperacoesFiscaisPage() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fCodigo, setFCodigo] = useState("");
  const [fDescricao, setFDescricao] = useState("");
  const [fFinalidade, setFFinalidade] = useState("1");
  const [fTipo, setFTipo] = useState("1");
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/fiscal/operacoes");
    const data = await res.json();
    setOperacoes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null); setFCodigo(""); setFDescricao(""); setFFinalidade("1"); setFTipo("1");
    setErro(""); setFormOpen(true);
  }
  function openEdit(o: Operacao) {
    setEditingId(o.id); setFCodigo(o.codigo); setFDescricao(o.descricao);
    setFFinalidade(String(o.finalidade)); setFTipo(String(o.tipoOperacao));
    setErro(""); setFormOpen(true);
  }

  async function salvar() {
    setSaving(true); setErro("");
    try {
      const url = editingId ? `/api/fiscal/operacoes/${editingId}` : "/api/fiscal/operacoes";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? {} : { codigo: fCodigo }),
          descricao: fDescricao,
          finalidade: Number(fFinalidade),
          tipoOperacao: Number(fTipo),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar"); return; }
      await load();
      setFormOpen(false);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function seed() {
    setSeeding(true); setErro(""); setAviso("");
    try {
      const res = await fetch("/api/fiscal/seed", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro no seed"); return; }
      setAviso(json.mensagem);
      await load();
    } catch {
      setErro("Erro de conexão");
    } finally {
      setSeeding(false);
    }
  }

  async function excluir(o: Operacao) {
    setErro("");
    const res = await fetch(`/api/fiscal/operacoes/${o.id}`, { method: "DELETE" });
    if (!res.ok) { setErro((await res.json()).error || "Erro ao excluir"); return; }
    await load();
  }

  const selectCls = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div>
      <PageHeader
        title="Operações Fiscais"
        breadcrumbs={[{ label: "Fiscal" }, { label: "Operações" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={seed} disabled={seeding}>
              {seeding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wand2 className="w-4 h-4 mr-1" />}
              Criar padrão
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Nova Operação
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">
        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
        {aviso && <p className="text-sm text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{aviso}</p>}

        {formOpen && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm">{editingId ? "Editar Operação" : "Nova Operação"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Código</Label>
                <Input value={fCodigo} onChange={(e) => setFCodigo(e.target.value.toUpperCase())} placeholder="VENDA" disabled={!!editingId} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição (vira a natureza de operação da NF)</Label>
                <Input value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} placeholder="Venda de mercadoria" />
              </div>
              <div className="space-y-1.5">
                <Label>Finalidade</Label>
                <select className={selectCls} value={fFinalidade} onChange={(e) => setFFinalidade(e.target.value)}>
                  {Object.entries(FINALIDADES).map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select className={selectCls} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                  <option value="1">1 — Saída</option>
                  <option value="0">0 — Entrada (emitida por nós)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={salvar} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : operacoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma operação cadastrada</p>
            <p className="text-muted-foreground text-sm mt-1">Use &ldquo;Criar padrão&rdquo; para gerar VENDA, DEVOLUÇÃO, REMESSA etc. com regra geral</p>
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {operacoes.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", o.ativo ? "bg-emerald-400" : "bg-muted")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{o.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.codigo} · {FINALIDADES[o.finalidade] ?? o.finalidade} · {o.tipoOperacao === 1 ? "Saída" : "Entrada"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="text-xs text-muted-foreground">{o._count.regras} regra{o._count.regras !== 1 ? "s" : ""}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(o)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-danger hover:bg-danger/10" onClick={() => excluir(o)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
