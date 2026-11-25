"use client";

// Tela de boas-vindas: é para onde o sistema leva depois do login (o Dashboard
// ainda não está pronto). Saudação com o nome, o que está pendente e atalhos
// para os módulos que a pessoa acessa.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, ThumbsUp } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { mainModules, type Module } from "@/lib/nav-menu";
import { podeAcessarInvestimentos } from "@/lib/investimentos-acesso";
import { useTabTitle } from "@/lib/tabs-context";

function saudacao(h: number) {
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeira tela de um módulo: o 1º item disponível do menu dele. */
function hrefDoModulo(m: Module): string | null {
  for (const sec of m.sections) for (const it of sec.items) if (!it.soon) return it.href;
  return null;
}

export default function InicioPage() {
  const { user, canAccess } = useSession();
  useTabTitle("Início");
  const [agora, setAgora] = useState<Date | null>(null);
  const [pendentes, setPendentes] = useState<number | null>(null);

  useEffect(() => {
    setAgora(new Date());
    Promise.all([
      fetch("/api/aprovacoes?status=PENDENTE&limit=1").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/aprovacoes/exclusoes?status=PENDENTE").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([a, b]) => setPendentes((a?.pendingCount ?? 0) + (b?.pendingCount ?? 0)))
      .catch(() => setPendentes(null));
  }, []);

  const primeiroNome = user?.nome?.trim().split(/\s+/)[0] ?? "";
  const modulos = mainModules
    .filter((m) => (m.id === "investimentos" ? podeAcessarInvestimentos(user?.email) : canAccess(m.id)))
    .map((m) => ({ m, href: hrefDoModulo(m) }))
    .filter((x): x is { m: Module; href: string } => !!x.href);

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto space-y-8">
      <div>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {agora ? agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : " "}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">
          {agora ? saudacao(agora.getHours()) : "Olá"}{primeiroNome ? `, ${primeiroNome}` : ""}!
        </h1>
        <p className="mt-1 text-muted-foreground">Bem-vindo de volta. Por onde você quer começar?</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/aprovacoes"
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <ThumbsUp className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-foreground">Minhas aprovações</span>
            <span className="block text-sm text-muted-foreground">
              {pendentes == null ? "Carregando…" : pendentes === 0 ? "Nada esperando por você" : `${pendentes} aguardando sua decisão`}
            </span>
          </span>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        </Link>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left shadow-sm hover:border-primary/40 transition-colors"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Search className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-foreground">Buscar no sistema</span>
            <span className="block text-sm text-muted-foreground">Telas, produtos, clientes, pedidos… atalho ⌘K</span>
          </span>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        </button>
      </div>

      {modulos.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Seus módulos</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {modulos.map(({ m, href }) => (
              <Link
                key={m.id}
                href={href}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm hover:border-primary/40 hover:bg-muted/40 transition-colors"
              >
                <m.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{m.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
