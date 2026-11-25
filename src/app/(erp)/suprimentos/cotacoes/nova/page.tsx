"use client";

import CotacaoCreateForm from "@/components/suprimentos/CotacaoCreateForm";
import { useTabTitle } from "@/lib/tabs-context";

export default function NovaCotacaoPage() {
  useTabTitle("Nova Cotação");
  // Cabeçalho, grade e rodapé de ações vêm do próprio formulário (molde EtapaUI).
  return <CotacaoCreateForm />;
}
