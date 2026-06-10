"use client";

import CotacaoCreateForm from "@/components/suprimentos/CotacaoCreateForm";
import { useTabTitle } from "@/lib/tabs-context";

export default function NovaCotacaoPage() {
  useTabTitle("Nova Cotação");
  return (
    <div className="px-8 py-6">
      <CotacaoCreateForm />
    </div>
  );
}
