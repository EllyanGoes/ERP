"use client";
// Criação rápida de produto SEM sair do formulário em uso (SC etc.), via
// ComboboxWithCreate.renderCreateModal. O fluxo antigo (createHref) navegava
// para /suprimentos/produtos/novo e destruía as linhas já digitadas — foi assim
// que a SC-0430 perdeu itens e nasceram produtos duplicados em sequência.

import { useEffect, useState } from "react";
import { PackagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SelectMenu from "@/components/shared/SelectMenu";
import EscClose from "@/components/shared/EscClose";

type Unidade = { id: string; sigla: string; nome: string };

export type ProdutoCriado = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: { sigla: string } | null;
};

export default function ProdutoQuickModal({
  initialValue,
  onCreated,
  onClose,
}: {
  initialValue: string;
  onCreated: (item: ProdutoCriado) => void;
  onClose: () => void;
}) {
  const [descricao, setDescricao] = useState(initialValue);
  const [unidades,  setUnidades]  = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    fetch("/api/suprimentos/unidades").then((r) => r.json()).then((j) => {
      const list: Unidade[] = Array.isArray(j) ? j : j.data ?? [];
      setUnidades(list);
      setUnidadeId((atual) => atual || (list.find((u) => u.sigla === "UN")?.id ?? list[0]?.id ?? ""));
    });
  }, []);

  async function handleSave() {
    if (!descricao.trim()) { setError("Descrição é obrigatória"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/suprimentos/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricao.trim(), unidadeId: unidadeId || null, precoVenda: 0 }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao criar produto"); setSaving(false); return; }
      const sigla = unidades.find((u) => u.id === unidadeId)?.sigla;
      onCreated({
        id: json.data.id,
        codigo: json.data.codigo,
        descricao: json.data.descricao,
        unidade: sigla ? { sigla } : null,
      });
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <EscClose onClose={onClose} />
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-info/10 rounded-lg">
              <PackagePlus className="w-4 h-4 text-info" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">Novo Produto</h3>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição <span className="text-red-500">*</span></Label>
            <Input
              autoFocus
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
              placeholder="Descrição do produto"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <SelectMenu
              value={unidadeId}
              options={unidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
              onChange={setUnidadeId}
              placeholder="Selecionar unidade…"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            O código é gerado automaticamente. Demais dados podem ser completados depois no cadastro do produto.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Criando…</> : "Criar Produto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
