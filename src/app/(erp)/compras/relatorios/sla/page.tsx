"use client";

import { Clock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

export default function SlaPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="SLA"
        subtitle="Nível de serviço dos fornecedores: prazo de entrega acordado vs. realizado"
        breadcrumbs={[
          { label: "Compras" },
          { label: "Relatórios" },
          { label: "SLA" },
        ]}
      />

      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
          <Clock className="w-7 h-7 text-amber-500" />
        </div>
        <p className="text-sm font-medium text-gray-500">Relatório em construção</p>
        <p className="text-xs text-gray-400">Em breve: desempenho de SLA por fornecedor e categoria</p>
      </div>
    </div>
  );
}
