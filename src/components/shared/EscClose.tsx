"use client";

import { useEffect, useRef } from "react";

// Pilha global de modais abertos — ESC fecha apenas o do topo (o último que
// montou), então modais empilhados (ex.: "Nova condição" sobre a proposta)
// fecham um por vez.
const stack: Array<() => void> = [];
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached || typeof document === "undefined") return;
  listenerAttached = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || stack.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    stack[stack.length - 1]();
  });
}

/**
 * Fecha o modal com a tecla ESC. Monte dentro do render condicional do modal:
 *
 *   {showModal && (
 *     <div className="fixed inset-0 ...">
 *       <EscClose onClose={() => setShowModal(false)} />
 *       ...
 *     </div>
 *   )}
 */
export default function EscClose({ onClose }: { onClose: () => void }) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    ensureListener();
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.indexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
  return null;
}
