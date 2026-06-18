"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, ChevronDown, FileText, Receipt, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printEscPosUSB } from "@/lib/webusb-print";
import {
  buildPedidoEscPos,
  printPedidoA4,
  printPedidoTermicaDialog,
  type PedidoPrintData,
} from "@/lib/print-pedido";
import { enviarPedidoWhatsAppPDF } from "@/lib/pdf-pedido";

/**
 * Botão "Imprimir / Enviar" do pedido de venda:
 *  • Bobina térmica: ESC/POS via WebUSB; sem aparelho/WebUSB, cai para o
 *    diálogo do navegador formatado em 80mm (mesmo caminho da minuta).
 *  • Folha A4: Documento Auxiliar de Venda no diálogo de impressão.
 *  • WhatsApp: abre o app/web com o orçamento pronto para o cliente.
 */
export default function ImprimirPedidoButton({ pedido }: { pedido: PedidoPrintData }) {
  const [aberto, setAberto] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [erro, setErro] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  async function termica() {
    setAberto(false);
    setImprimindo(true);
    setErro("");
    try {
      await printEscPosUSB(buildPedidoEscPos(pedido, 48));
    } catch {
      // qualquer falha do WebUSB → diálogo do navegador formatado em 80mm
      try { printPedidoTermicaDialog(pedido); }
      catch (e2) { setErro(e2 instanceof Error ? e2.message : "Não foi possível imprimir."); }
    } finally {
      setImprimindo(false);
    }
  }

  function a4() {
    setAberto(false);
    setErro("");
    try { printPedidoA4(pedido); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível imprimir."); }
  }

  async function whatsapp() {
    setAberto(false);
    setImprimindo(true);
    setErro("");
    try { await enviarPedidoWhatsAppPDF(pedido); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível gerar o PDF do orçamento."); }
    finally { setImprimindo(false); }
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setAberto((v) => !v)} disabled={imprimindo}>
        {imprimindo ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Printer className="w-4 h-4 mr-1.5" />}
        {imprimindo ? "Imprimindo..." : "Imprimir / Enviar"}
        <ChevronDown className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
      </Button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-card shadow-lg py-1">
          <button
            onClick={termica}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left text-foreground hover:bg-muted"
          >
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <span>
              Bobina térmica
              <span className="block text-[11px] text-muted-foreground">cupom 80mm (WebUSB ou diálogo)</span>
            </span>
          </button>
          <button
            onClick={a4}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left text-foreground hover:bg-muted"
          >
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span>
              Folha A4
              <span className="block text-[11px] text-muted-foreground">Documento Auxiliar de Venda</span>
            </span>
          </button>
          <div className="my-1 border-t border-border" />
          <button
            onClick={whatsapp}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left text-foreground hover:bg-muted"
          >
            <MessageCircle className="w-4 h-4 text-emerald-500" />
            <span>
              Enviar por WhatsApp
              <span className="block text-[11px] text-muted-foreground">orçamento em PDF para o cliente</span>
            </span>
          </button>
        </div>
      )}
      {erro && <p className="absolute right-0 top-full mt-10 text-xs text-danger whitespace-nowrap">{erro}</p>}
    </div>
  );
}
