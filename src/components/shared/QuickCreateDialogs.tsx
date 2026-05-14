"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateModalArgs } from "./ComboboxWithCreate";

// ── Shell ─────────────────────────────────────────────────────────────────────

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ── Local de Estoque ──────────────────────────────────────────────────────────

export function LocalEstoqueQuickCreate({ initialValue, onCreated, onClose }: CreateModalArgs) {
  const [nome, setNome] = useState(initialValue);
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!nome.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/suprimentos/locais-estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar"); return; }
      onCreated(json.id, json.nome);
    } catch { setError("Erro de conexão"); }
    finally { setSaving(false); }
  }

  return (
    <DialogShell title="Novo Local de Estoque" onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nome <span className="text-red-500">*</span></Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Almoxarifado Central"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição opcional"
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !nome.trim()}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Salvar
        </Button>
      </div>
    </DialogShell>
  );
}

// ── Tipo de Produto ───────────────────────────────────────────────────────────

export function TipoProdutoQuickCreate({ initialValue, onCreated, onClose }: CreateModalArgs) {
  const [nome, setNome] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!nome.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/suprimentos/tipos-produto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar"); return; }
      onCreated(json.id, json.nome);
    } catch { setError("Erro de conexão"); }
    finally { setSaving(false); }
  }

  return (
    <DialogShell title="Novo Tipo de Produto" onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nome <span className="text-red-500">*</span></Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Eletrônicos"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !nome.trim()}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Salvar
        </Button>
      </div>
    </DialogShell>
  );
}

// ── Unidade de Medida ─────────────────────────────────────────────────────────

export function UnidadeQuickCreate({ initialValue, onCreated, onClose }: CreateModalArgs) {
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!sigla.trim() || !nome.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/suprimentos/unidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sigla: sigla.trim(), nome: nome.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar"); return; }
      onCreated(json.id, `${json.sigla} — ${json.nome}`);
    } catch { setError("Erro de conexão"); }
    finally { setSaving(false); }
  }

  return (
    <DialogShell title="Nova Unidade de Medida" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Sigla <span className="text-red-500">*</span></Label>
            <Input
              value={sigla}
              onChange={(e) => setSigla(e.target.value.toUpperCase())}
              placeholder="UN"
              maxLength={10}
              autoFocus
            />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Nome <span className="text-red-500">*</span></Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Unidade"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !sigla.trim() || !nome.trim()}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Salvar
        </Button>
      </div>
    </DialogShell>
  );
}
