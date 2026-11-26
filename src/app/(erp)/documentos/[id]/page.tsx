"use client";

// Detalhe do documento (abrir em aba): mesmo componente da visualização em
// overlay do Acervo, no modo página.
import { useParams } from "next/navigation";
import DocumentoDetalhe from "@/components/documentos/DocumentoDetalhe";

export default function DocumentoDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DocumentoDetalhe id={id} modo="pagina" />;
}
