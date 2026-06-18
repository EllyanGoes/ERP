"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Provider de tema (claro/escuro/sistema) via next-themes. Aplica a classe no
// <html> e persiste a escolha em localStorage, sem flash no carregamento.
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
