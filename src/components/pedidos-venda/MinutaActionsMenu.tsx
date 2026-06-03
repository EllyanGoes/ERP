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

export default function MinutaActionsMenu({ id, numero, status, isAdmin = false }: Props) {
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

  // Confirm edit modal state
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  // Editar: liberado para minutas não-terminais — ou sempre, para admin.
  // (mesma regra do antigo ícone de lápis).
  const canEdit = isAdmin || (status !== "ENTREGUE" && status !== "CANCELADA");
  // Excluir: somente minutas PENDENTE. A API bloqueia as demais (estoque já
  // movimentado em minutas que saíram/foram entregues).
  const canDelete = status === "PENDENTE";

  // Sem nenhuma ação disponível, não renderiza o menu (coluna fica vazia,
  // como acontecia antes com o lápis).
  if (!canEdit && !canDelete) return null;

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.right - 160 });
    setOpen(true);
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canEdit) return;
    setOpen(false);
    setShowEditConfirm(true);
  }

  function confirmEdit() {
    setShowEditConfirm(false);
    router.push(`/comercial/minutas/${id}/editar`);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canDelete) return;
    setOpen(false);
    setDeleteError("");
    setShowConfirm(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/comercial/minutas/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
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
          "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        )}
        title="Ações"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Dropdown menu */}
      {mounted && open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-40 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          <button
            onClick={handleEdit}
            disabled={!canEdit}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
              canEdit
                ? "text-gray-700 hover:bg-gray-50"
                : "text-gray-300 cursor-not-allowed"
            )}
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            Editar
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={handleDeleteClick}
            disabled={!canDelete}
            title={canDelete ? undefined : "Apenas minutas pendentes podem ser excluídas"}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
              canDelete
                ? "text-red-600 hover:bg-red-50"
                : "text-gray-300 cursor-not-allowed"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir minuta?</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  A minuta <span className="font-mono font-semibold text-gray-700">{numero}</span> será excluída permanentemente. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{deleteError}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
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

      {/* Confirm edit modal */}
      {mounted && showEditConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Pencil className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Editar minuta?</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Você será redirecionado para a edição da minuta <span className="font-mono font-semibold text-gray-700">{numero}</span>.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEditConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEdit}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
