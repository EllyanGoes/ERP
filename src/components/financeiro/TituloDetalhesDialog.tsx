"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
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
  open, onOpenChange, numero, status, campos, acoes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  numero: string;
  status: string;
  campos: TituloCampo[];
  acoes: TituloAcao[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-info">{numero}</span>
            <StatusBadge status={status} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-1">
          {campos.map((c, i) => (
            <div key={i} className={cn("min-w-0", c.full && "col-span-2")}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="text-sm text-foreground break-words">{c.valor}</div>
            </div>
          ))}
        </div>

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
