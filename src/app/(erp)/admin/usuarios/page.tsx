"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Plus, Edit, Trash2, ShieldCheck, User, AlertTriangle, Search, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULOS } from "@/lib/modules";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  ADMIN:   "bg-info/15 text-info",
  USUARIO: "bg-muted text-muted-foreground",
};

type TabView = "lista" | "por-perfil";

// ── Helper ────────────────────────────────────────────────────────────────────

function getModulesLabel(u: Usuario) {
  if (u.perfil === "ADMIN") return "Todos os módulos";
  if (u.permissoes.length === 0) return "Nenhum";
  const modKeys = Array.from(new Set(u.permissoes.map((p) => p.modulo.split(".")[0])));
  return modKeys.map((k) => MODULOS.find((m) => m.key === k)?.label ?? k).join(", ");
}

function Avatar({ u }: { u: Usuario }) {
  const initials = u.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={cn(
      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
      u.perfil === "ADMIN" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
    )}>
      {initials}
    </div>
  );
}

// ── Column definition factory (needs toggleAtivo from component scope) ────────
function makeUsuariosCols(toggleAtivo: (u: Usuario) => void): ColDef<Usuario>[] {
  return [
    {
      id: "usuario",
      label: "Usuário",
      thClass: "text-left px-4 py-3 font-medium",
      tdClass: "px-4 py-3",
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar u={u} />
          <div>
            <p className="font-medium text-foreground">{u.nome}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: "perfil",
      label: "Perfil",
      thClass: "text-left px-4 py-3 font-medium",
      tdClass: "px-4 py-3",
      render: (u) => (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", PERFIL_COLOR[u.perfil])}>
          {u.perfil === "ADMIN" ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
          {PERFIL_LABEL[u.perfil]}
        </span>
      ),
    },
    {
      id: "modulos",
      label: "Módulos",
      thClass: "text-left px-4 py-3 font-medium",
      tdClass: "px-4 py-3 text-muted-foreground text-xs max-w-[200px]",
      render: (u) =>
        u.perfil === "ADMIN"
          ? <span className="text-info font-medium">Todos</span>
          : u.permissoes.length === 0
          ? <span className="text-muted-foreground">Nenhum</span>
          : <span className="truncate block">{getModulesLabel(u)}</span>,
    },
    {
      id: "status",
      label: "Status",
      thClass: "text-center px-4 py-3 font-medium",
      tdClass: "px-4 py-3 text-center",
      render: (u) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleAtivo(u); }}
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80",
            u.ativo ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
          )}
        >
          {u.ativo ? "Ativo" : "Inativo"}
        </button>
      ),
    },
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const router = useRouter();
  const [users,    setUsers]    = useState<Usuario[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [tabView,  setTabView]  = useState<TabView>("lista");

  // Delete confirm
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/usuarios");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAtivo(u: Usuario) {
    await fetch(`/api/admin/usuarios/${u.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ativo: !u.ativo }),
    });
    await load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setDeleteError("");
    const res  = await fetch(`/api/admin/usuarios/${deleteId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setDeleteError(data.error ?? "Erro ao excluir"); setDeleting(false); return; }
    setDeleteId(null);
    await load();
    setDeleting(false);
  }

  // Column order (only relevant for list view)
  const COLS = makeUsuariosCols(toggleAtivo);
  const [colOrder, setColOrder] = useColumnOrder("usuarios", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("usuarios", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<Usuario> => c !== undefined && colVis[c.id] !== false);

  const filtered     = users.filter((u) =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );
  const deleteTarget = users.find((u) => u.id === deleteId);

  const usersByPerfil: Record<string, Usuario[]> = {};
  for (const u of users) {
    if (!usersByPerfil[u.perfil]) usersByPerfil[u.perfil] = [];
    usersByPerfil[u.perfil].push(u);
  }
  const perfilOrder = ["ADMIN", "USUARIO"] as const;

  return (
    <div>
      {/* ── Delete modal ──────────────────────────────────────────────────── */}
      {deleteId && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-danger/15 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
            </div>
            <h3 className="font-semibold text-foreground">Excluir usuário?</h3>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{deleteTarget?.nome}</strong> será removido permanentemente.
            </p>
            {deleteError && (
              <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline" className="flex-1"
                onClick={() => { setDeleteId(null); setDeleteError(""); }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir"}
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
          <Button size="sm" onClick={() => router.push("/admin/usuarios/novo")}>
            <Plus className="w-4 h-4 mr-1" />Novo Usuário
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-4 max-w-5xl">
        {/* ── Tab + Search ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {(["lista", "por-perfil"] as TabView[]).map((t) => (
              <button
                key={t}
                onClick={() => setTabView(t)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  tabView === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "lista" ? "Lista" : "Por Perfil"}
              </button>
            ))}
          </div>

          {tabView === "lista" && (
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuário..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {tabView === "lista" && (
            <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
          )}
        </div>

        {/* ── Lista View ──────────────────────────────────────────── */}
        {tabView === "lista" && (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={orderedCols.length + 1} className="px-4 py-12 text-center text-muted-foreground text-sm">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={orderedCols.length + 1} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhum usuário encontrado</td></tr>
                ) : filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-muted cursor-pointer"
                    onClick={() => router.push(`/admin/usuarios/${u.id}`)}
                  >
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(u)}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => router.push(`/admin/usuarios/${u.id}`)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-red-500"
                          onClick={() => { setDeleteError(""); setDeleteId(u.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Por Perfil View ──────────────────────────────────────── */}
        {tabView === "por-perfil" && (
          <div className="space-y-6">
            {loading ? (
              <p className="text-muted-foreground text-sm">Carregando...</p>
            ) : perfilOrder.map((perfil) => {
              const group = usersByPerfil[perfil] ?? [];
              return (
                <div key={perfil} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted">
                    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", PERFIL_COLOR[perfil])}>
                      {perfil === "ADMIN" ? <ShieldCheck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      {PERFIL_LABEL[perfil]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {group.length} {group.length === 1 ? "usuário" : "usuários"}
                    </span>
                  </div>

                  {group.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                      <Users className="w-8 h-8 text-gray-200" />
                      <p className="text-sm">Nenhum usuário neste perfil</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {group.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted transition-colors cursor-pointer"
                          onClick={() => router.push(`/admin/usuarios/${u.id}`)}
                        >
                          <Avatar u={u} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{u.nome}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                          <div className="text-xs text-muted-foreground hidden sm:block max-w-[180px] truncate">
                            {getModulesLabel(u)}
                          </div>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            u.ativo ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                          )}>
                            {u.ativo ? "Ativo" : "Inativo"}
                          </span>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/usuarios/${u.id}`); }}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
