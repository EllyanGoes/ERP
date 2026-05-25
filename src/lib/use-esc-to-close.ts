"use client";

import { useEffect } from "react";

/**
 * Hook padrão do sistema: fecha um modal/painel ao pressionar Escape.
 * Use em todo componente que renderiza um overlay ou diálogo.
 *
 * @param onClose  Função chamada ao pressionar Esc.
 * @param enabled  Permite desabilitar o listener temporariamente (ex: quando o modal não está aberto).
 */
export function useEscToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }

    // Capture phase so we get it before other handlers (e.g. CommandPalette)
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose, enabled]);
}
