"use client";

import { BarChart3 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

export default function SpendPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="SPEND"
        subtitle="Análise de gastos e volume de compras por fornecedor, categoria e período"
        breadcrumbs={[
          { label: "Compras" },
          { label: "Relatórios" },
          { label: "SPEND" },
        ]}
      />

      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
          <BarChart3 className="w-7 h-7 text-amber-500" />
        </div>
        <p className="text-sm font-medium text-gray-500">Relatório em construção</p>
        <p className="text-xs text-gray-400">Em breve: análise de spend por fornecedor, categoria e período</p>
      </div>
    </div>
  );
}
