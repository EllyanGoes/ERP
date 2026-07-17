"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Restaura a posição de scroll do container principal POR ROTA (padrão do
 * sistema): ao voltar para uma tela já visitada, o scroll volta para onde o
 * usuário estava; rota nova abre no topo (evita o "espaço em branco" de
 * carregar a posição de uma tela na outra). Guardado em sessionStorage,
 * então sobrevive à navegação mas zera ao fechar a aba.
 */
const KEY = "erp:scroll-por-rota";

function lerPosicoes(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function ScrollRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById("erp-main");
    if (!main) return;

    // Restaura a posição salva da rota (0 se nunca visitada). Tenta de novo no
    // frame seguinte: o conteúdo pode ainda estar assentando o layout e o
    // primeiro scrollTo ser clampado pela altura antiga.
    const alvo = lerPosicoes()[pathname] ?? 0;
    main.scrollTo({ top: alvo, behavior: "instant" });
    const raf = requestAnimationFrame(() => {
      if (Math.abs(main.scrollTop - alvo) > 1) main.scrollTo({ top: alvo, behavior: "instant" });
    });

    // Salva a posição enquanto o usuário rola (throttle por frame).
    let rafSave = 0;
    const onScroll = () => {
      if (rafSave) return;
      rafSave = requestAnimationFrame(() => {
        rafSave = 0;
        const m = lerPosicoes();
        m[pathname] = main.scrollTop;
        try {
          sessionStorage.setItem(KEY, JSON.stringify(m));
        } catch {}
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      if (rafSave) cancelAnimationFrame(rafSave);
      main.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  return null;
}
