"use client";

// Prepara os ícones com .anim-desenhar para o efeito "se completa ao passar o
// mouse" (estilo Tera / lucide-animated): cada traço ganha pathLength="1", o
// que permite ao CSS mostrá-lo PARCIALMENTE desenhado em repouso e completá-lo
// no hover, qualquer que seja o tamanho do traço. pathLength é atributo SVG
// (não dá para pôr via CSS), por isso este observador.
import { useEffect } from "react";

const FORMAS = "path, circle, rect, line, polyline, polygon, ellipse";

function preparar(raiz: ParentNode) {
  raiz.querySelectorAll<SVGElement>(`svg.anim-desenhar :is(${FORMAS})`).forEach((el) => {
    if (!el.hasAttribute("pathLength")) el.setAttribute("pathLength", "1");
  });
}

export default function IconesAnimados() {
  useEffect(() => {
    preparar(document);
    const obs = new MutationObserver((mutacoes) => {
      for (const m of mutacoes) {
        m.addedNodes.forEach((n) => { if (n instanceof Element) preparar(n.parentNode ?? n); });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
