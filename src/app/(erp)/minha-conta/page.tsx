"use client";

// Minha Conta: dados do usuário e preferências de interface (tema e barra de
// módulos). As preferências valem por usuário, neste navegador.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ChevronRight, LayoutPanelLeft, Monitor, Moon, PanelLeft, Sun } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useSession } from "@/lib/session-context";
import { useBarraModulos } from "@/lib/ui-prefs";
import { cn } from "@/lib/utils";

function Opcoes<T extends string>({
  valor, opcoes, onChange,
}: {
  valor: T;
  opcoes: { v: T; label: string; icon: typeof Sun; ajuda?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
            valor === o.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
          )}
        >
          <o.icon className={cn("w-4 h-4 mt-0.5 shrink-0", valor === o.v ? "text-primary" : "text-muted-foreground")} />
          <span>
            <span className="block text-sm font-medium text-foreground">{o.label}</span>
            {o.ajuda && <span className="block text-xs text-muted-foreground mt-0.5">{o.ajuda}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function MinhaContaPage() {
  const { user } = useSession();
  const { theme, setTheme } = useTheme();
  const [barraModulos, setBarraModulos] = useBarraModulos();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const iniciais = user?.nome ? user.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "?";

  return (
    <div>
      <PageHeader title="Minha conta" breadcrumbs={[{ label: "Minha conta" }]} />
      <div className="px-8 pb-8 space-y-5 max-w-4xl">
        <section className="bg-card rounded-xl border border-border shadow-sm">
          <header className="px-5 h-11 flex items-center border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Dados</h2>
          </header>
          <div className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">{iniciais}</div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{user?.nome ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              {user?.perfil === "ADMIN" && <p className="text-xs font-medium text-primary mt-0.5">Administrador</p>}
            </div>
            <Link href="/conta/dispositivos" className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline">
              Dispositivos conectados <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-sm">
          <header className="px-5 h-11 flex items-center border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Preferências</h2>
          </header>
          <div className="p-5 space-y-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Tema</p>
              {montado && (
                <Opcoes
                  valor={(theme as "light" | "dark" | "system") ?? "system"}
                  onChange={setTheme}
                  opcoes={[
                    { v: "light", label: "Claro", icon: Sun },
                    { v: "dark", label: "Escuro", icon: Moon },
                    { v: "system", label: "Seguir o sistema", icon: Monitor, ajuda: "Acompanha o tema do computador" },
                  ]}
                />
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Barra de módulos</p>
              <Opcoes
                valor={barraModulos ? "mostrar" : "ocultar"}
                onChange={(v) => setBarraModulos(v === "mostrar")}
                opcoes={[
                  { v: "mostrar", label: "Mostrar", icon: LayoutPanelLeft, ajuda: "Faixa de ícones à esquerda para trocar de módulo" },
                  { v: "ocultar", label: "Ocultar", icon: PanelLeft, ajuda: "Troca de módulo clicando no nome do módulo (lista com busca e recentes)" },
                ]}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
