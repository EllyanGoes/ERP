"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, AlertTriangle, Users, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type PerfilAcesso = {
  id: string;
  nome: string;
  descricao: string | null;
  permissoes: string[];
  _count: { usuarios: number };
};

export default function PerfisPage() {
  const router = useRouter();
  const [perfis,   setPerfis]   = useState<PerfilAcesso[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Delete
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/perfis");
    const data = await res.json();
    setPerfis(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setDeleteError("");
    const res  = await fetch(`/api/admin/perfis/${deleteId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setDeleteError(data.error ?? "Erro ao excluir"); setDeleting(false); return; }
    setDeleteId(null);
    await load();
    setDeleting(false);
  }

  const deleteTarget = perfis.find((p) => p.id === deleteId);

  return (
    <div>
      {/* Delete modal */}
      {deleteId && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-danger/15 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
            </div>
            <h3 className="font-semibold text-foreground">Excluir perfil?</h3>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{deleteTarget?.nome}</strong> será removido.
              {(deleteTarget?._count.usuarios ?? 0) > 0 && (
                <span className="block mt-1 text-warning">
                  {deleteTarget?._count.usuarios} usuário(s) serão desvinculados.
                </span>
              )}
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
        title="Perfis de Acesso"
        breadcrumbs={[{ label: "Administração" }, { label: "Perfis de Acesso" }]}
        action={
          <Button size="sm" onClick={() => router.push("/admin/perfis/novo")}>
            <Plus className="w-4 h-4 mr-1" />Novo Perfil
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-4xl">
        {loading ? (
          <p className="text-muted-foreground text-sm py-8">Carregando...</p>
        ) : perfis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <ShieldCheck className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-medium">Nenhum perfil de acesso cadastrado</p>
            <Button size="sm" variant="outline" onClick={() => router.push("/admin/perfis/novo")}>
              <Plus className="w-4 h-4 mr-1" />Criar primeiro perfil
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {perfis.map((p) => (
              <div
                key={p.id}
                className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-info/30 hover:shadow-sm transition-all cursor-pointer group"
                onClick={() => router.push(`/admin/perfis/${p.id}`)}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0 group-hover:bg-info/15 transition-colors">
                  <ShieldCheck className="w-5 h-5 text-blue-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{p.nome}</p>
                  {p.descricao && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{p.descricao}</p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center hidden sm:block">
                    <p className="text-sm font-semibold text-foreground">{p.permissoes.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">permissões</p>
                  </div>
                  <div className="text-center hidden sm:block">
                    <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      {p._count.usuarios}
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">usuários</p>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 ml-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost" size="sm" className="h-8 w-8 p-0"
                      onClick={() => router.push(`/admin/perfis/${p.id}`)}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-red-500"
                      onClick={() => { setDeleteError(""); setDeleteId(p.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
