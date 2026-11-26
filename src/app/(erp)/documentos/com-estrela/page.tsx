"use client";

// Documentos marcados com estrela pelo usuário.
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import DocumentosExplorer from "@/components/documentos/DocumentosExplorer";

export default function DocumentosComEstrelaPage() {
  // useSearchParams (pasta na URL) exige Suspense numa rota estática.
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <DocumentosExplorer visao="estrela" />
    </Suspense>
  );
}
