"use client";

// Detalhe da OS em página própria (link direto, notificações). O mesmo componente
// abre como cartão por cima do quadro em /pcm/os?os=<id>.
import { useParams } from "next/navigation";
import OrdemServicoDetalhe from "@/components/manutencao/OrdemServicoDetalhe";

export default function OrdemServicoPage() {
  const { id } = useParams<{ id: string }>();
  return <OrdemServicoDetalhe id={id} modo="pagina" />;
}
