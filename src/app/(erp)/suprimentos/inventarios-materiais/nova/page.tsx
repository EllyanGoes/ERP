"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import InventarioCreateForm from "@/components/suprimentos/InventarioCreateForm";
import { useTabTitle } from "@/lib/tabs-context";

export default function NovoInventarioPage() {
  useTabTitle("Novo Inventário de Materiais");
  return (
    <div>
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-muted-foreground">
        <Link href="/suprimentos/inventarios-materiais" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Inventário de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-foreground font-medium">Novo</span>
      </div>
      <div className="px-8 pb-8">
        <InventarioCreateForm />
      </div>
    </div>
  );
}
