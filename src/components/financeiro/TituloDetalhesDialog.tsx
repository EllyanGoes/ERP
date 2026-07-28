"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { Autoria } from "@/components/shared/Autoria";
import AnexosSection from "@/components/shared/AnexosSection";
import { cn } from "@/lib/utils";

// Popup de detalhes de um título (Contas a Pagar/Receber): mostra os dados e as
// ações disponíveis. Genérico — cada tabela compõe seus `campos` e `acoes`.

export type TituloCampo = { label: string; valor: ReactNode; full?: boolean };
export type TituloAcao = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  tone?: "primary" | "outline" | "ghost" | "danger";
};

export default function TituloDetalhesDialog({
  open, onOpenChange, numero, status, campos, acoes, criadoPor, atualizadoPor, anexosApiBase,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  numero: string;
  status: string;
  campos: TituloCampo[];
  acoes: TituloAcao[];
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  /** Base da API de anexos do título (ex.: /api/contas-pagar/<id>/anexos) —
      quando presente, o popup ganha a seção de documentos anexados. */
  anexosApiBase?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Largo o bastante p/ QUATRO colunas de campos curtos — o conteúdo cabe
          sem rolagem na maioria dos títulos (a rolagem fica só de segurança). */}
      <DialogContent className="w-[min(64rem,calc(100vw-2rem))] sm:max-w-none max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-info">{numero}</span>
            <StatusBadge status={status} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2.5 py-1">
          {campos.map((c, i) => (
            <div key={i} className={cn("min-w-0", c.full && "col-span-2 sm:col-span-4")}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="text-sm text-foreground break-words">{c.valor}</div>
            </div>
          ))}
        </div>

        {/* Documentos do título (fatura, boleto, comprovante…). */}
        {anexosApiBase && (
          <div className="pt-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Documentos</div>
            <AnexosSection apiBase={anexosApiBase} />
          </div>
        )}

        <Autoria criadoPor={criadoPor} atualizadoPor={atualizadoPor} />

        {acoes.length > 0 && (
          <DialogFooter className="gap-2 sm:justify-end">
            {acoes.map((a, i) => (
              <Button
                key={i}
                variant={a.tone === "primary" ? "default" : a.tone === "ghost" ? "ghost" : "outline"}
                onClick={a.onClick}
                className={cn(
                  "gap-1.5",
                  a.tone === "primary" && "bg-emerald-600 hover:bg-emerald-700 text-white",
                  a.tone === "danger" && "text-danger border-danger/30 hover:bg-danger/10",
                )}
              >
                {a.icon}{a.label}
              </Button>
            ))}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
