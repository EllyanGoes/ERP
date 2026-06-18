"use client";

import { Printer } from "lucide-react";

/** Botão de impressão do relatório (usa o @media print do globals.css). */
export default function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`no-print inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 ${className ?? ""}`}
      title="Imprimir"
    >
      <Printer className="w-4 h-4" /> Imprimir
    </button>
  );
}
