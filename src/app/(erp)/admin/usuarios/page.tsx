"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, ShieldCheck, User, AlertTriangle, Eye, EyeOff, X, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULOS } from "@/lib/modules";

type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "USUARIO";
  ativo: boolean;
  permissoes: { modulo: string }[];
};

const PERFIL_LABEL = { ADMIN: "Admin", USUARIO: "Usuário" };
const PERFIL_COLOR = {
  ADMIN:   "bg-blue-100 text-blue-700",
  USUARIO: "bg-gray-100 text-gray-600",
};

type FormState = {
  nome: string;
  email: string;
  senha: string;
  perfil: "ADMIN" | "USUARIO";
  modulos: string[];
};

const EMPTY_FORM: FormState = { nome: "", email: "", senha: "", perfil: "USUARIO", modulos: [] };

export default function UsuariosPage() {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/usuarios");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setModalError("");
    setShowPass(false);
    setShowModal(true);
  }

  function openEdit(u: Usuario) {
    setEditId(u.id);
    setForm({
      nome: u.nome,
      email: u.email,
      senha: "",
      perfil: u.perfil,
      modulos: u.permissoes.map((p) => p.modulo),
    });
    setModalError("");
    setShowPass(false);
    setShowModal(true);
  }

  function toggleModulo(key: string) {
    setForm((p) => ({
      ...p,
      modulos: p.modulos.includes(key) ? p.modulos.filter((m) => m !== key) : [...p.modulos, key],
    }));
  }

  async function handleSave() {
    if (!form.nome.trim() || !form.email.trim()) {
      setModalError("Nome e e-mail são obrigatórios");
      return;
    }
    if (!editId && !form.senha.trim()) {
      setModalError("Senha é obrigatória para novo usuário");
      return;
    }
    setSaving(true);
    setModalError("");
    try {
      const url = editId ? `/api/admin/usuarios/${editId}` : "/api/admin/usuarios";
      const method = editId ? "PATCH" : "POST";
      const body: Record<string, unknown> = { nome: form.nome, email: form.email, perfil: form.perfil };
      if (form.senha) body.senha = form.senha;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error ?? "Erro ao salvar"); return; }

      // Save permissions if USUARIO
      if (form.perfil === "USUARIO") {
        const uid = editId ?? data.id;
        await fetch(`/api/admin/usuarios/${uid}/permissoes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modulos: form.modulos }),
        });
      }

      setShowModal(false);
      await load();
    } catch {
      setModalError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(u: Usuario) {
    await fetch(`/api/admin/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !u.ativo }),
    });
    await load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/usuarios/${deleteId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setDeleteError(data.error ?? "Erro ao excluir"); setDeleting(false); return; }
    setDeleteId(null);
    await load();
    setDeleting(false);
  }

  const filtered = users.filter((u) =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const deleteTarget = users.find((u) => u.id === deleteId);

  return (
    <div>
      {/* Delete confirm modal */}
      {deleteId && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <h3 className="font-semibold text-gray-900">Excluir usuário?</h3>
            <p className="text-sm text-gray-500">
              <strong className="text-gray-700">{deleteTarget?.nome}</strong> será removido permanentemente.
            </p>
            {deleteError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{deleteError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setDeleteId(null); setDeleteError(""); }} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create/Edit modal */}
      {showModal && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-base">
                {editId ? "Editar Usuário" : "Novo Usuário"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{modalError}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-mail <span className="text-red-500">*</span></Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@empresa.com" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{editId ? "Nova Senha (deixe em branco para manter)" : "Senha *"}</Label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    value={form.senha}
                    onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
                    placeholder={editId ? "••••••••" : "Mínimo 6 caracteres"}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPass((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={form.perfil} onValueChange={(v) => setForm((p) => ({ ...p, perfil: v as "ADMIN" | "USUARIO" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                    <SelectItem value="USUARIO">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Permissions matrix — only for USUARIO profile */}
            {form.perfil === "USUARIO" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">Módulos com Acesso</Label>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({
                      ...p,
                      modulos: p.modulos.length === MODULOS.length ? [] : MODULOS.map((m) => m.key),
                    }))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {form.modulos.length === MODULOS.length ? "Desmarcar todos" : "Marcar todos"}
                  </button>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {MODULOS.map((mod) => (
                    <label key={mod.key} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                      <div
                        onClick={() => toggleModulo(mod.key)}
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer",
                          form.modulos.includes(mod.key)
                            ? "bg-blue-600 border-blue-600"
                            : "border-gray-300 bg-white"
                        )}
                      >
                        {form.modulos.includes(mod.key) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{mod.label}</p>
                        <p className="text-xs text-gray-400">{mod.group}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.perfil === "ADMIN" && (
              <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Administradores têm acesso completo a todos os módulos
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <PageHeader
        title="Usuários"
        breadcrumbs={[{ label: "Administração" }, { label: "Usuários" }]}
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />Novo Usuário
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-4 max-w-4xl">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Usuário</th>
                <th className="text-left px-4 py-3 font-medium">Perfil</th>
                <th className="text-left px-4 py-3 font-medium">Módulos</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">Nenhum usuário encontrado</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                        u.perfil === "ADMIN" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      )}>
                        {u.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.nome}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", PERFIL_COLOR[u.perfil])}>
                      {u.perfil === "ADMIN" ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {PERFIL_LABEL[u.perfil]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.perfil === "ADMIN"
                      ? <span className="text-blue-600 font-medium">Todos</span>
                      : u.permissoes.length === 0
                      ? <span className="text-gray-400">Nenhum</span>
                      : u.permissoes.map((p) => p.modulo).join(", ")
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleAtivo(u)}
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80",
                        u.ativo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      )}
                    >
                      {u.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-300 hover:text-red-500" onClick={() => { setDeleteError(""); setDeleteId(u.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
