"use client";

import PageHeader from "@/components/shared/PageHeader";
import MinutaCreateForm from "@/components/comercial/MinutaCreateForm";
import { useTabTitle } from "@/lib/tabs-context";

export default function NovaMinutaPage() {
  useTabTitle("Nova Minuta");
  return (
    <div className="px-8 pb-8 space-y-6">
      <PageHeader title="Nova Minuta" />
      <MinutaCreateForm />
    </div>
  );
}
