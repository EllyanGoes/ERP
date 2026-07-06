"use client";

// Grupos de tributação ("gaveta fiscal" do produto): agrupam itens com a mesma
// tributação para as RegraTributacao não explodirem por item. Cadastro
// compartilhado pelo grupo (sem empresa).

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderTree, Plus, Pencil, Trash2, Loader2, X, Save, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Grupo = {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  _count: { itens: number; regras: number };
};

export default function GruposTributacaoPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fCodigo, setFCodigo] = useState("");
  const [fNome, setFNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/fiscal/grupos-tributacao");
    const data = await res.json();
    setGrupos(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null); setFCodigo(""); setFNome(""); setErro(""); setFormOpen(true);
  }
  function openEdit(g: Grupo) {
    setEditingId(g.id); setFCodigo(g.codigo); setFNome(g.nome); setErro(""); setFormOpen(true);
  }

  async function salvar() {
    if (!fNome.trim() || (!editingId && !fCodigo.trim())) { setErro("Código e nome são obrigatórios"); return; }
    setSaving(true); setErro("");
    try {
      const url = editingId ? `/api/fiscal/grupos-tributacao/${editingId}` : "/api/fiscal/grupos-tributacao";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { nome: fNome.trim() } : { codigo: fCodigo.trim(), nome: fNome.trim() }),
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

  async function excluir(g: Grupo) {
    setErro("");
    const res = await fetch(`/api/fiscal/grupos-tributacao/${g.id}`, { method: "DELETE" });
    if (!res.ok) { setErro((await res.json()).error || "Erro ao excluir"); return; }
    await load();
  }

  const filtered = grupos.filter((g) =>
    `${g.codigo} ${g.nome}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Grupos de Tributação"
        breadcrumbs={[{ label: "Fiscal" }, { label: "Grupos de Tributação" }]}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo Grupo
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar grupos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}

        {formOpen && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm">{editingId ? "Editar Grupo" : "Novo Grupo"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Código</Label>
                <Input value={fCodigo} onChange={(e) => setFCodigo(e.target.value.toUpperCase())} placeholder="CIMENTO_ST" disabled={!!editingId} autoFocus={!editingId} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome</Label>
                <Input value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Ex: Cimento (ST), Revenda geral..." autoFocus={!!editingId} />
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderTree className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum grupo cadastrado</p>
            <p className="text-muted-foreground text-sm mt-1">Vincule os produtos a grupos para regrar a tributação por família</p>
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {filtered.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", g.ativo ? "bg-emerald-400" : "bg-muted")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.nome}</p>
                    <p className="text-xs text-muted-foreground">{g.codigo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="text-xs text-muted-foreground">{g._count.itens} itens · {g._count.regras} regras</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(g)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-danger hover:bg-danger/10" onClick={() => excluir(g)}>
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
