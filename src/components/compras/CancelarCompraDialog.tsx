"use client";

// Cancelamento no processo de compras. Dois usos:
//  • na página da compra ("Cancelar compra"): cancela tudo, pede o motivo;
//  • no pedido (status → Cancelado): pergunta se cancela SÓ O PEDIDO (a compra
//    continua: a cotação volta para análise e pode gerar novo pedido) ou A COMPRA
//    INTEIRA. Regra no servidor: lib/cancelar-compra.ts.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Modo = "so-pedido" | "compra";

export default function CancelarCompraDialog({
  open, onOpenChange, numeroCompra, empresaId, pedidoNumero, onCancelarSoPedido, onConcluido,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  numeroCompra: string;
  empresaId: string;
  /** Informado quando o cancelamento parte do pedido: mostra a escolha. */
  pedidoNumero?: string;
  /** Cancela só o pedido (status do pedido → CANCELADO). */
  onCancelarSoPedido?: () => Promise<void>;
  onConcluido: () => void;
}) {
  const doPedido = !!pedidoNumero;
  const [modo, setModo] = useState<Modo>(doPedido ? "so-pedido" : "compra");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setModo(doPedido ? "so-pedido" : "compra"); setMotivo(""); setErro(null); }
  }, [open, doPedido]);

  async function confirmar() {
    setErro(null);
    if (modo === "compra" && !motivo.trim()) { setErro("Informe o motivo do cancelamento."); return; }
    setEnviando(true);
    try {
      if (modo === "so-pedido") {
        await onCancelarSoPedido?.();
      } else {
        const res = await fetch(`/api/compras/compra/${encodeURIComponent(numeroCompra)}/cancelar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresaId, motivo: motivo.trim() }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setErro(json.error ?? "Não foi possível cancelar a compra."); return; }
      }
      onOpenChange(false);
      onConcluido();
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  const opcoes: { v: Modo; titulo: string; texto: string }[] = [
    {
      v: "so-pedido",
      titulo: "Cancelar só o pedido",
      texto: "A compra continua: a cotação volta para análise e, ao ser aprovada de novo, gera outro pedido.",
    },
    {
      v: "compra",
      titulo: `Cancelar a compra ${numeroCompra} inteira`,
      texto: "Cancela solicitação, cotação e pedido. A compra sai do Fluxo de Compras.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{doPedido ? `Cancelar pedido ${pedidoNumero}` : `Cancelar compra ${numeroCompra}`}</DialogTitle>
          {!doPedido && (
            <DialogDescription>
              Solicitação, cotação e pedido serão cancelados e a compra sai do Fluxo de Compras.
            </DialogDescription>
          )}
        </DialogHeader>

        {doPedido && (
          <div className="space-y-2">
            {opcoes.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setModo(o.v)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                  modo === o.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                )}
              >
                <p className="text-sm font-medium text-foreground">{o.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{o.texto}</p>
              </button>
            ))}
          </div>
        )}

        {modo === "compra" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Motivo do cancelamento</label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: comprado por outro canal, não é mais necessário…"
              rows={3}
              autoFocus
            />
          </div>
        )}

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Voltar</Button>
          <Button variant="destructive" onClick={confirmar} disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {modo === "so-pedido" ? "Cancelar pedido" : "Cancelar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
