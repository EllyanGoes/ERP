"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
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
import { Eye, EyeOff, Save, X, ShieldCheck, Loader2, Zap, Building2 } from "lucide-react";
import { MODULOS, getAllPermissoes } from "@/lib/modules";
import ModuloRow from "@/components/admin/ModuloRow";
import { useSession } from "@/lib/session-context";

type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "USUARIO";
  ativo: boolean;
  permissoes: { modulo: string }[];
  perfilAcesso: { id: string; nome: string } | null;
};

type PerfilAcesso = { id: string; nome: string; permissoes: string[] };

export default function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [showPass,       setShowPass]       = useState(false);

  const [nome,           setNome]           = useState("");

  // Título da aba baseado no nome do usuário carregado
  useTabTitle(nome || null);
  const [email,          setEmail]          = useState("");
  const [senha,          setSenha]          = useState("");
  const [perfil,         setPerfil]         = useState<"ADMIN" | "USUARIO">("USUARIO");
  const [ativo,          setAtivo]          = useState(true);
  const [permissoes,     setPermissoes]     = useState<string[]>([]);
  const [perfilAcessoId, setPerfilAcessoId] = useState<string>("none");
  const [perfisList,     setPerfisList]     = useState<PerfilAcesso[]>([]);
  const [empresasVinculadas, setEmpresasVinculadas] = useState<string[]>([]);

  // Empresas do grupo: o admin logado enxerga todas as ativas na própria sessão
  const { user: adminLogado } = useSession();
  const empresasGrupo = adminLogado?.empresas ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resU, resP, resE] = await Promise.all([
        fetch(`/api/admin/usuarios/${id}`),
        fetch("/api/admin/perfis"),
        fetch(`/api/admin/usuarios/${id}/empresas`),
      ]);
      const data: Usuario      = await resU.json();
      const perfisData: PerfilAcesso[] = await resP.json();
      const empresasData: string[] = await resE.json();
      setNome(data.nome);
      setEmail(data.email);
      setPerfil(data.perfil);
      setAtivo(data.ativo);
      setPermissoes(data.permissoes.map((p) => p.modulo));
      setPerfilAcessoId(data.perfilAcesso?.id ?? "none");
      setPerfisList(Array.isArray(perfisData) ? perfisData : []);
      setEmpresasVinculadas(Array.isArray(empresasData) ? empresasData : []);
    } catch {
      setError("Erro ao carregar usuário");
    } finally {
      setLoading(false);
    }
  }, [id]);

  function applyPerfil(pid: string) {
    const realId = pid === "none" ? "" : pid;
    setPerfilAcessoId(pid);
    if (!realId) return;
    const found = perfisList.find((p) => p.id === realId);
    if (found) setPermissoes([...found.permissoes]);
  }

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!nome.trim() || !email.trim()) {
      setError("Nome e e-mail são obrigatórios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        nome: nome.trim(),
        email: email.trim(),
        perfil,
        perfilAcessoId: (perfilAcessoId === "none" || !perfilAcessoId) ? null : perfilAcessoId,
      };
      if (senha.trim()) body.senha = senha.trim();

      const res  = await fetch(`/api/admin/usuarios/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar"); return; }

      // Salvar permissões e empresas se USUARIO
      if (perfil === "USUARIO") {
        await fetch(`/api/admin/usuarios/${id}/permissoes`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ modulos: permissoes }),
        });
        await fetch(`/api/admin/usuarios/${id}/empresas`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ empresaIds: empresasVinculadas }),
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
        title="Editar Usuário"
        breadcrumbs={[
          { label: "Administração" },
          { label: "Usuários", href: "/admin/usuarios" },
          { label: nome || "Usuário" },
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
                : <><Save className="w-4 h-4 mr-1" />Salvar</>
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
              <Label>Nova Senha <span className="text-gray-400 font-normal text-xs">(deixe em branco para manter)</span></Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
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

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={ativo ? "true" : "false"} onValueChange={(v) => setAtivo(v === "true")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
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

            {/* Seletor de perfil de acesso */}
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
                    <SelectItem value="none">Nenhum</SelectItem>
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

        {/* ── Empresas (multiempresa) ────────────────────────────── */}
        {perfil === "USUARIO" && empresasGrupo.length > 1 && (
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-800">Empresas</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-gray-500">
                Empresas que este usuário pode acessar pelo seletor. Sem nenhuma marcada,
                o acesso fica restrito à Tramontin.
              </p>
              {empresasGrupo.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={empresasVinculadas.includes(emp.id)}
                    onChange={(e) =>
                      setEmpresasVinculadas((atual) =>
                        e.target.checked ? [...atual, emp.id] : atual.filter((x) => x !== emp.id)
                      )
                    }
                  />
                  {emp.nome}
                </label>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
