"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Molde único das telas de etapa da compra (Solicitação, Cotação, Pedido,
// Entrada). As quatro aparecem como abas da página da compra e precisam ter a
// mesma cara: mesma grade, mesmo cartão, mesmo rótulo de campo, mesma tabela.
//
//   <EtapaLayout lateral={…}>          coluna principal (2/3) + lateral (1/3)
//     <EtapaSecao titulo="Dados">      cartão com título padrão
//       <EtapaCampos>                  grade de 4 colunas
//         <EtapaCampo rotulo="Motivo">…</EtapaCampo>
//     <EtapaSecao titulo="Itens" semPadding>
//       <table className={tabela.table}> … th={tabela.th} td={tabela.td}
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useEmbutidoNaCompra } from "@/lib/compra-embutida";

/** Grade da tela: conteúdo principal à esquerda, contexto da etapa à direita. */
export function EtapaLayout({
  children, lateral, abaixo, className,
}: {
  children: ReactNode;
  lateral?: ReactNode;
  /** Largura total, depois da grade (ex.: tabela de itens larga, sem rolagem lateral). */
  abaixo?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-8 pb-8 grid gap-5 items-start", lateral ? "lg:grid-cols-3" : "", className)}>
      <div className={cn("space-y-5 min-w-0", lateral && "lg:col-span-2")}>{children}</div>
      {lateral && <div className="space-y-5 min-w-0">{lateral}</div>}
      {abaixo && <div className={cn("space-y-5 min-w-0", lateral && "lg:col-span-3")}>{abaixo}</div>}
    </div>
  );
}

/** Cartão padrão com título. `acoes` fica à direita do título. */
export function EtapaSecao({
  titulo, icone, acoes, children, semPadding, className,
}: {
  titulo: ReactNode;
  icone?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  semPadding?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("bg-card rounded-xl border border-border shadow-sm overflow-hidden", className)}>
      <header className="flex items-center gap-2 px-5 h-11 border-b border-border bg-card">
        {icone && <span className="text-muted-foreground [&_svg]:w-4 [&_svg]:h-4">{icone}</span>}
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
      </header>
      <div className={cn(!semPadding && "p-5")}>{children}</div>
    </section>
  );
}

/** Grade de campos (padrão 4 colunas; 2 no celular). */
export function EtapaCampos({ children, colunas = 4 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-4",
        colunas === 4 && "md:grid-cols-4",
        colunas === 3 && "md:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/** Um campo: rótulo pequeno em cima, valor embaixo. Vazio vira "—". */
export function EtapaCampo({ rotulo, children, span, className }: { rotulo: ReactNode; children?: ReactNode; span?: 2 | 3 | 4; className?: string }) {
  const vazio = children == null || children === "" || children === false;
  return (
    <div className={cn("min-w-0", span === 2 && "col-span-2", span === 3 && "col-span-2 md:col-span-3", span === 4 && "col-span-2 md:col-span-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{rotulo}</p>
      <div className="text-sm text-foreground break-words">{vazio ? <span className="text-muted-foreground">—</span> : children}</div>
    </div>
  );
}

/** Classes da tabela padrão (itens, títulos, propostas…). */
export const tabela = {
  table: "w-full text-sm",
  thead: "bg-muted border-b border-border",
  th: "px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap",
  thNum: "px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap",
  tr: "border-b border-border last:border-0",
  td: "px-4 py-2.5 text-foreground",
  tdNum: "px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap",
  tdCodigo: "px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap",
  tfoot: "border-t border-border bg-muted/30 font-semibold",
};

/** Lista vertical "rótulo …… valor" para a coluna lateral (totais, condições…). */
export function EtapaResumo({ linhas }: { linhas: { rotulo: ReactNode; valor: ReactNode; destaque?: boolean }[] }) {
  return (
    <dl className="space-y-2 text-sm">
      {linhas.map((l, i) => (
        <div key={i} className={cn("flex items-baseline justify-between gap-3", l.destaque && "pt-2 border-t border-border font-semibold")}>
          <dt className="text-muted-foreground">{l.rotulo}</dt>
          <dd className="text-right text-foreground tabular-nums">{l.valor ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Esconde o que o cabeçalho da compra já mostra (nº da compra, solicitante,
 * setor, empresa, atalhos para os outros documentos) quando a tela está numa
 * aba da compra; fora dela (tela própria) continua aparecendo.
 */
export function ForaDaCompra({ children }: { children: ReactNode }) {
  return useEmbutidoNaCompra() ? null : <>{children}</>;
}

// ── Formulários (telas de edição) ────────────────────────────────────────────

/** Campo editável: mesmo rótulo do EtapaCampo, com marca de obrigatório e ajuda/erro. */
export function EtapaCampoForm({
  rotulo, obrigatorio, ajuda, erro, span, children, className,
}: {
  rotulo: ReactNode;
  obrigatorio?: boolean;
  ajuda?: ReactNode;
  erro?: ReactNode;
  span?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", span === 2 && "col-span-2", span === 3 && "col-span-2 md:col-span-3", span === 4 && "col-span-2 md:col-span-4", className)}>
      <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        {rotulo}{obrigatorio && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {erro ? <p className="mt-1 text-xs text-danger">{erro}</p> : ajuda ? <p className="mt-1 text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

/** Barra de ações do formulário, presa ao rodapé da área de rolagem. */
export function EtapaRodapeAcoes({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-8 mt-2 px-8 py-3 border-t border-border bg-card/95 backdrop-blur flex items-center gap-3">
      <div className="text-xs text-muted-foreground min-w-0 truncate">{info}</div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
