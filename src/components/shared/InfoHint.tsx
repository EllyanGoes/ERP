"use client";

// Ícone ⓘ compacto ao lado de um label: o texto explicativo abre num tooltip ao
// passar o mouse, em vez de ocupar espaço fixo embaixo do campo.
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function InfoHint({ children, side = "top", className }: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={<span className={cn("inline-flex shrink-0 align-middle text-muted-foreground/70 hover:text-muted-foreground cursor-help", className)} />}
        >
          <Info className="w-3.5 h-3.5" />
        </TooltipTrigger>
        {/* span block: o TooltipContent é inline-flex — sem isso, texto com <b>
            vira "colunas" (cada nó de texto é um flex item separado). */}
        <TooltipContent side={side} className="max-w-[290px] text-xs leading-snug">
          <span className="block">{children}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
