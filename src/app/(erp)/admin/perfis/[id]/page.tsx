"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, X, Loader2, Users, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULOS, getAllPermissoes } from "@/lib/modules";
import ModuloRow from "@/components/admin/ModuloRow";

type PerfilData = {
  id: string;
  nome: string;
  descricao: string | null;
  permissoes: string[];
  _count: { usuarios: number };
  usuarios: { id: string; nome: string; email: string }[];
};

export default function EditarPerfilPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [applying,   setApplying]   = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");

  const [nome,       setNome]       = useState("");
  useTabTitle(nome || null);

  const [descricao,  setDescricao]  = useState("");
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [usuarios,   setUsuarios]   = useState<PerfilData["usuarios"]>([]);
  const [userCount,  setUserCount]  = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/perfis/${id}`);
      const data: PerfilData = await res.json();
      setNome(data.nome);
      setDescricao(data.descricao ?? "");
      setPermissoes(data.permissoes);
      setUsuarios(data.usuarios);
      setUserCount(data._count.usuarios);
    } catch {
      setError("Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res  = await fetch(`/api/admin/perfis/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ nome: nome.trim(), descricao: descricao.trim(), permissoes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar"); return; }
      router.push("/admin/perfis");
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function handleAplicar() {
    setApplying(true);
    setError("");
    setSuccess("");
    try {
      const res  = await fetch(`/api/admin/perfis/${id}/aplicar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao aplicar"); return; }
      setSuccess(`Permissões reaplicadas em ${data.atualizados} usuário(s) com sucesso.`);
    } catch {
      setError("Erro de conexão");
    } finally {
      setApplying(false);
    }
  }

  const allPerms = getAllPermissoes();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={nome || "Perfil de Acesso"}
        breadcrumbs={[
          { label: "Administração" },
          { label: "Perfis de Acesso", href: "/admin/perfis" },
          { label: nome || "Perfil" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/perfis")} disabled={saving}>
              <X className="w-4 h-4 mr-1" />Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</>
                : <><Save className="w-4 h-4 mr-1" />Salvar</>
              }
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-12 max-w-3xl space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">{success}</div>
        )}

        {/* Dados do perfil */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Dados do Perfil</h2>
          </div>
          <div className="px-6 py-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Comprador, Financeiro..." />
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

        {/* Usuários vinculados */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">Usuários Vinculados</h2>
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {userCount}
              </span>
            </div>
            {userCount > 0 && (
              <Button
                variant="outline" size="sm"
                onClick={handleAplicar}
                disabled={applying}
                className="text-xs h-7 gap-1.5"
              >
                {applying
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Aplicando...</>
                  : <><RefreshCw className="w-3 h-3" />Reaplicar permissões</>
                }
              </Button>
            )}
          </div>

          {usuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
              <Users className="w-8 h-8 text-gray-200" />
              <p className="text-sm">Nenhum usuário vinculado a este perfil</p>
              <p className="text-xs text-gray-400">Vincule ao criar ou editar um usuário</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {usuarios.map((u) => {
                const initials = u.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div key={u.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.nome}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
