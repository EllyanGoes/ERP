"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  numero: string;
  status: string;
  isAdmin?: boolean;
};

export default function PedidoActionsMenu({ id, numero, status, isAdmin = false }: Props) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  // Confirm delete modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => { setMounted(true); }, []);

  const canEdit   = isAdmin || ["RASCUNHO", "ENVIADO"].includes(status);
  const canDelete = isAdmin || ["RASCUNHO", "ENVIADO"].includes(status);

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.right - 160 });
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    router.push(`/suprimentos/pedidos-compra/${id}/editar`);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    setDeleteError("");
    setShowConfirm(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setDeleteError(json.error || "Erro ao excluir"); setDeleting(false); return; }
      setShowConfirm(false);
      router.refresh();
    } catch {
      setDeleteError("Erro de conexão. Tente novamente.");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-lg transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        title="Ações"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Dropdown menu */}
      {mounted && open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-40 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          <button
            onClick={handleEdit}
            disabled={!canEdit}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
              canEdit
                ? "text-foreground hover:bg-muted"
                : "text-muted-foreground/60 cursor-not-allowed"
            )}
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            Editar
          </button>
          <div className="border-t border-border" />
          <button
            onClick={handleDeleteClick}
            disabled={!canDelete}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
              canDelete
                ? "text-danger hover:bg-danger/10"
                : "text-muted-foreground/60 cursor-not-allowed"
            )}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            Excluir
          </button>
        </div>,
        document.body
      )}

      {/* Confirm delete modal */}
      {mounted && showConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir pedido?</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  O pedido <span className="font-mono font-semibold text-foreground">{numero}</span> será excluído permanentemente.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg mb-3">{deleteError}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
