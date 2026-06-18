"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// Botão que alterna entre claro e escuro. Guarda `mounted` para evitar mismatch
// de hidratação (o tema real só é conhecido no cliente). Estilizado para o strip
// escuro do sidebar por padrão; aceita className para outros contextos.
export default function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={mounted ? (isDark ? "Tema claro" : "Tema escuro") : "Alternar tema"}
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors",
        className,
      )}
    >
      {mounted && isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
