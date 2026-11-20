"use client";

import { useEffect, useRef } from "react";

// Polling que só roda com a aba VISÍVEL.
//
// Por quê: cada consulta automática (sino, badge de aprovações, fila do PDV…)
// gasta CPU da Vercel duas vezes (middleware + rota). Abas esquecidas em
// segundo plano continuavam consultando e respondiam por boa parte do consumo
// que estourou o plano em 19/11/2026. Com a aba oculta o intervalo para; ao
// voltar (visibilitychange/focus) roda na hora, então o usuário não vê dado
// velho.
//
// - `fn` pode mudar a cada render: guardamos a última versão num ref.
// - focus + visibilitychange disparam juntos ao voltar: um respiro de
//   MIN_GAP_MS evita chamada dobrada.
// - `enabled=false` desliga tudo (ex.: usuário sem o módulo).
// - `inicial=false` pula a carga na montagem (quando a tela já carrega em
//   outro efeito, p/ não buscar duas vezes).

const MIN_GAP_MS = 3_000;

export function usePollingVisivel(
  fn: () => unknown,
  intervalMs: number,
  enabled = true,
  inicial = true,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let ultimo = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const rodar = () => {
      const agora = Date.now();
      if (agora - ultimo < MIN_GAP_MS) return;
      ultimo = agora;
      void fnRef.current();
    };
    const iniciar = () => {
      if (timer === null) timer = setInterval(rodar, intervalMs);
    };
    const parar = () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") { rodar(); iniciar(); }
      else parar();
    };
    const onFocus = () => rodar();

    if (inicial) rodar(); // carga inicial (mesmo oculta: o componente acabou de montar)
    else ultimo = Date.now();
    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `inicial` só vale na montagem
  }, [intervalMs, enabled]);
}
