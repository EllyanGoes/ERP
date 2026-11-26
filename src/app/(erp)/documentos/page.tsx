"use client";

// Acervo de documentos (GED) no padrão de navegação do Drive: pastas, breadcrumb (?pasta=), lista/grade, envio rápido.
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import DocumentosExplorer from "@/components/documentos/DocumentosExplorer";

export default function DocumentosPage() {
  // useSearchParams (pasta na URL) exige Suspense numa rota estática.
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <DocumentosExplorer visao="acervo" />
    </Suspense>
  );
}
