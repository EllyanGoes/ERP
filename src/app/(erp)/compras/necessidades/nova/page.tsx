"use client";

import PageHeader from "@/components/shared/PageHeader";
import SolicitacaoCreateForm from "@/components/compras/SolicitacaoCreateForm";

export default function NovaSolicitacaoPage() {
  return (
    <div>
      <PageHeader
        title="Nova Solicitação de Compras"
        breadcrumbs={[{ label: "Compras" }, { label: "Solicitações de Compras", href: "/compras/necessidades" }, { label: "Nova" }]}
      />
      <div className="px-8 pb-8">
        <SolicitacaoCreateForm />
      </div>
    </div>
  );
}
