"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Save, X, ShieldCheck, Loader2, Zap } from "lucide-react";
import { MODULOS, getAllPermissoes } from "@/lib/modules";
import ModuloRow from "@/components/admin/ModuloRow";

type PerfilAcesso = { id: string; nome: string; permissoes: string[] };

export default function NovoUsuarioPage() {
  const router = useRouter();

  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [showPass,       setShowPass]       = useState(false);

  const [nome,           setNome]           = useState("");
  const [email,          setEmail]          = useState("");
  const [senha,          setSenha]          = useState("");
  const [perfil,         setPerfil]         = useState<"ADMIN" | "USUARIO">("USUARIO");
  const [permissoes,     setPermissoes]     = useState<string[]>([]);
  const [perfilAcessoId, setPerfilAcessoId] = useState<string>("");
  const [perfisList,     setPerfisList]     = useState<PerfilAcesso[]>([]);

  useEffect(() => {
    fetch("/api/admin/perfis")
      .then((r) => r.json())
      .then((d) => setPerfisList(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  function applyPerfil(pid: string) {
    setPerfilAcessoId(pid);
    if (!pid) return;
    const found = perfisList.find((p) => p.id === pid);
    if (found) setPermissoes([...found.permissoes]);
  }

  async function handleSave() {
    if (!nome.trim() || !email.trim()) {
      setError("Nome e e-mail são obrigatórios");
      return;
    }
    if (!senha.trim()) {
      setError("Senha é obrigatória para novo usuário");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res  = await fetch("/api/admin/usuarios", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          senha: senha.trim(),
          perfil,
          perfilAcessoId: perfilAcessoId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao criar usuário"); return; }

      // Salvar permissões se USUARIO
      if (perfil === "USUARIO" && permissoes.length > 0) {
        await fetch(`/api/admin/usuarios/${data.id}/permissoes`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ modulos: permissoes }),
        });
      }

      router.push("/admin/usuarios");
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  const allPerms = getAllPermissoes();

  return (
    <div>
      <PageHeader
        title="Novo Usuário"
        breadcrumbs={[
          { label: "Administração" },
          { label: "Usuários", href: "/admin/usuarios" },
          { label: "Novo" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/usuarios")} disabled={saving}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</>
                : <><Save className="w-4 h-4 mr-1" />Criar Usuário</>
              }
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-12 max-w-3xl space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* ── Informações do Usuário ─────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Informações do Usuário</h2>
          </div>
          <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoFocus
              />
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <Label>E-mail <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@empresa.com"
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label>Senha <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Perfil */}
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select value={perfil} onValueChange={(v) => setPerfil(v as "ADMIN" | "USUARIO")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="USUARIO">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── Permissões ─────────────────────────────────────────── */}
        {perfil === "ADMIN" ? (
          <section className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-5 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Acesso total</p>
              <p className="text-xs text-blue-600 mt-0.5">Administradores têm acesso completo a todos os módulos e recursos do sistema.</p>
            </div>
          </section>
        ) : (
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Permissões de Acesso</h2>
              <button
                type="button"
                onClick={() =>
                  setPermissoes(permissoes.length === allPerms.length ? [] : [...allPerms])
                }
                className="text-xs text-blue-600 hover:underline"
              >
                {permissoes.length === allPerms.length ? "Desmarcar todos" : "Marcar todos"}
              </button>
            </div>

            {perfisList.length > 0 && (
              <div className="px-6 py-4 border-b border-gray-100 bg-amber-50/60 flex items-center gap-3">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">Aplicar perfil de acesso</p>
                  <p className="text-xs text-amber-600 mt-0.5">Carrega automaticamente as permissões do perfil selecionado</p>
                </div>
                <Select value={perfilAcessoId} onValueChange={applyPerfil}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-white">
                    <SelectValue placeholder="Selecionar perfil..." />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="">Nenhum</SelectItem>
                    {perfisList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
        )}
      </div>
    </div>
  );
}
