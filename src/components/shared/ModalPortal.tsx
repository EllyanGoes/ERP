"use client";

// Renderiza um modal/overlay direto no <body>, fora da árvore do conteúdo. Sem
// isso, um overlay "fixed inset-0" pode ficar preso no contexto de empilhamento
// do conteúdo (sidebar fixa, wrappers com transition) e não cobrir a página
// inteira. O conteúdo deve usar z-index alto (ex.: z-[9999]).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
