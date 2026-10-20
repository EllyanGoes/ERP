"use client";

// Popup da cautela de EPI — imprime na mesma aba (sem abrir /sst/epis/fichas/[id]
// em outra): copia a cautela para um iframe oculto e chama o print dele.
// Com cadastro incompleto o Imprimir fica bloqueado até completar.
import { useCallback, useState } from "react";
import CautelaEpi from "@/components/sst/CautelaEpi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Printer } from "lucide-react";

function imprimirCautela(fichaId: string, onFim: () => void) {
  const el = document.querySelector<HTMLElement>(`[data-cautela="${fichaId}"]`);
  if (!el) { onFim(); return; }
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/"><title>Cautela de EPI</title>
<style>@page { size: A4 portrait; margin: 9mm; } * { box-sizing: border-box; } body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } p, ol { margin: 0; }</style>
</head><body>${el.outerHTML}</body></html>`);
  doc.close();
  const win = iframe.contentWindow!;
  const fim = () => { setTimeout(() => iframe.remove(), 500); onFim(); };
  // Espera a logo carregar antes de imprimir (senão sai em branco no PDF).
  const imgs = Array.from(doc.images).filter((i) => !i.complete);
  Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(() => {
    win.focus();
    win.addEventListener("afterprint", fim, { once: true });
    win.print();
    // Safari não dispara afterprint em iframe: garante a limpeza.
    setTimeout(fim, 60_000);
  });
}

export default function CautelaEpiDialog({ fichaId, onClose }: { fichaId: string | null; onClose: () => void }) {
  const [faltando, setFaltando] = useState<string[] | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const onFaltando = useCallback((f: string[]) => setFaltando(f), []);
  const bloqueado = faltando === null || faltando.length > 0;
  return (
    <Dialog open={!!fichaId} onOpenChange={(o) => { if (!o) { onClose(); setFaltando(null); } }}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Cautela de EPI</DialogTitle></DialogHeader>
        {fichaId && <div className="overflow-x-auto rounded-lg border border-border"><CautelaEpi key={fichaId} id={fichaId} emDialog onFaltando={onFaltando} /></div>}
        <DialogFooter className="items-center">
          {faltando && faltando.length > 0 && <span className="mr-auto text-xs text-warning">Complete o cadastro para imprimir.</span>}
          <Button variant="outline" onClick={() => { onClose(); setFaltando(null); }}>Fechar</Button>
          <Button className="gap-1.5" disabled={bloqueado || imprimindo} onClick={() => { if (!fichaId) return; setImprimindo(true); imprimirCautela(fichaId, () => setImprimindo(false)); }}>
            {imprimindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
