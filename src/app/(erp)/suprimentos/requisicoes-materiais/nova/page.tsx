"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import RequisicaoCreateForm from "@/components/suprimentos/RequisicaoCreateForm";
import { useTabTitle } from "@/lib/tabs-context";

export default function NovaRequisicaoPage() {
  useTabTitle("Nova Req/Dev de Materiais");
  return (
    <div>
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-gray-500">
        <Link href="/suprimentos/requisicoes-materiais" className="hover:text-gray-800 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Req/Dev de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-800 font-medium">Nova</span>
      </div>
      <div className="px-8 pb-8">
        <RequisicaoCreateForm />
      </div>
    </div>
  );
}
