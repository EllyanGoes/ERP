"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, X, Loader2 } from "lucide-react";
import { MODULOS, getAllPermissoes } from "@/lib/modules";
import ModuloRow from "@/components/admin/ModuloRow";

export default function NovoPerfisPage() {
  const router = useRouter();

  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [nome,       setNome]       = useState("");
  const [descricao,  setDescricao]  = useState("");
  const [permissoes, setPermissoes] = useState<string[]>([]);

  const allPerms = getAllPermissoes();

  async function handleSave() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setSaving(true);
    setError("");
    try {
      const res  = await fetch("/api/admin/perfis", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ nome: nome.trim(), descricao: descricao.trim(), permissoes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao criar perfil"); return; }
      router.push("/admin/perfis");
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo Perfil de Acesso"
        breadcrumbs={[
          { label: "Administração" },
          { label: "Perfis de Acesso", href: "/admin/perfis" },
          { label: "Novo" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/perfis")} disabled={saving}>
              <X className="w-4 h-4 mr-1" />Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</>
                : <><Save className="w-4 h-4 mr-1" />Criar Perfil</>
              }
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-12 max-w-3xl space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* Dados do perfil */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Dados do Perfil</h2>
          </div>
          <div className="px-6 py-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Comprador, Financeiro, Estoque..."
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-gray-400 font-normal text-xs">(opcional)</span></Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva as responsabilidades deste perfil..."
                rows={2}
              />
            </div>
          </div>
        </section>

        {/* Permissões */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Permissões de Acesso</h2>
              <p className="text-xs text-gray-400 mt-0.5">Defina quais recursos este perfil pode acessar</p>
            </div>
            <button
              type="button"
              onClick={() => setPermissoes(permissoes.length === allPerms.length ? [] : [...allPerms])}
              className="text-xs text-blue-600 hover:underline shrink-0"
            >
              {permissoes.length === allPerms.length ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>
          <div className="px-6 py-5 space-y-3">
            {MODULOS.filter((m) => m.key !== "admin").map((mod) => (
              <ModuloRow
                key={mod.key}
                mod={mod}
                permissoes={permissoes}
                onChange={setPermissoes}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
