"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useCreateFlow } from "@/components/shared/useCreateFlow";

export default function NovoLocalEstoquePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nome, setNome] = useState(searchParams.get("nome") ?? "");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "local de estoque",
    onNew: () => { setNome(""); setDescricao(""); setError(null); },
    viewHref: (id) => `/suprimentos/locais-estoque/${id}`,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/suprimentos/locais-estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || undefined }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Erro ao salvar");
        return;
      }
      const data = await res.json();
      confirmCreated(data.id);
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo Local de Estoque"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Estoque" },
          { label: "Locais de Estoque", href: "/suprimentos/locais-estoque" },
          { label: "Novo" },
        ]}
      />
      <div className="px-8 pb-8 max-w-lg">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Local *</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Almoxarifado Central"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição opcional"
              className="mt-1"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/suprimentos/locais-estoque")}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !nome.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </form>
      </div>
      {dialog}
    </div>
  );
}
