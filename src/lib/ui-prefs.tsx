"use client";

// Preferências de interface da CONTA (Usuario.preferencias): valem em qualquer
// navegador. Chegam do servidor no carregamento da página (UiPrefsProvider no
// layout), então a tela já abre certa — sem piscar o padrão antes.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";

export type Tema = "light" | "dark" | "system";
export type UiPrefs = { tema?: Tema; barraModulos?: boolean };

type Ctx = { prefs: UiPrefs; salvar: (p: UiPrefs) => void };
const PrefsCtx = createContext<Ctx>({ prefs: {}, salvar: () => {} });

function salvarNoServidor(p: UiPrefs) {
  fetch("/api/minha-conta/preferencias", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  }).catch(() => { /* fica só local até a próxima vez */ });
}

export function UiPrefsProvider({ initial, children }: { initial: UiPrefs | null; children: ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>(initial ?? {});
  const { theme, setTheme } = useTheme();

  // Navegador novo (ou com outro tema guardado): aplica o tema da conta.
  useEffect(() => {
    if (prefs.tema && theme && theme !== prefs.tema) setTheme(prefs.tema);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = useCallback((p: UiPrefs) => {
    setPrefs((atual) => ({ ...atual, ...p }));
    if (p.tema) setTheme(p.tema);
    salvarNoServidor(p);
  }, [setTheme]);

  return <PrefsCtx.Provider value={{ prefs, salvar }}>{children}</PrefsCtx.Provider>;
}

/** true = faixa de ícones dos módulos; false = troca de módulo pelo droplist no nome. */
export function useBarraModulos(): [boolean, (v: boolean) => void] {
  const { prefs, salvar } = useContext(PrefsCtx);
  return [prefs.barraModulos ?? true, (v: boolean) => salvar({ barraModulos: v })];
}

/** Tema da conta (Claro/Escuro/Seguir o sistema); salvar também aplica. */
export function useTemaConta(): [Tema, (t: Tema) => void] {
  const { prefs, salvar } = useContext(PrefsCtx);
  const { theme } = useTheme();
  return [(prefs.tema ?? (theme as Tema) ?? "light"), (t: Tema) => salvar({ tema: t })];
}
