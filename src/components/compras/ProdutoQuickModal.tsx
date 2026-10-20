"use client";
// Criação rápida de produto SEM sair do formulário em uso (SC etc.), via
// ComboboxWithCreate.renderCreateModal. O fluxo antigo (createHref) navegava
// para /suprimentos/produtos/novo e destruía as linhas já digitadas — foi assim
// que a SC-0430 perdeu itens e nasceram produtos duplicados em sequência.

import { useState } from "react";
import { PackagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EscClose from "@/components/shared/EscClose";
import CamposObrigatoriosProduto, { AvisoProdutoDuplicado, useOpcoesProduto, type CamposProduto } from "@/components/shared/CamposObrigatoriosProduto";
import { camposFaltandoProduto, type ProdutoDuplicado } from "@/lib/produto-cadastro";

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
  const [campos,    setCampos]    = useState<CamposProduto>({ unidadeId: "", tipoProdutoId: "", categoriaEstoque: "ALMOXARIFADO" });
  const { unidades } = useOpcoesProduto();
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [duplicado, setDuplicado] = useState<ProdutoDuplicado | null>(null);

  async function handleSave() {
    if (saving) return;
    if (!descricao.trim()) { setError("Descrição é obrigatória"); return; }
    const faltando = camposFaltandoProduto(campos);
    if (faltando.length) { setError(`Preencha: ${faltando.join(", ")}`); return; }
    setSaving(true); setError(""); setDuplicado(null);
    try {
      const res = await fetch("/api/suprimentos/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricao.trim(), ...campos, precoVenda: 0 }),
      });
      const json = await res.json();
      if (res.status === 409 && json.duplicado) { setDuplicado(json.duplicado); setSaving(false); return; }
      if (!res.ok) { setError(json.error || "Erro ao criar produto"); setSaving(false); return; }
      const sigla = unidades.find((u) => u.id === campos.unidadeId)?.sigla;
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

          {duplicado && <AvisoProdutoDuplicado duplicado={duplicado} onUsar={() => onCreated(duplicado)} />}

          <CamposObrigatoriosProduto value={campos} onChange={setCampos} />

          <p className="text-[11px] text-muted-foreground">
            O código é gerado automaticamente. Os demais dados podem ser completados depois no cadastro do produto.
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
