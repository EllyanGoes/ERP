"use client";

import { useTabsContext } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

// Botão "Editar" que reaproveita a aba atual (em vez de abrir uma nova).
// Usado em páginas de detalhe que são server components — onde não dá para
// chamar o hook de abas diretamente.
export default function EditarTabButton({ href, label = "Editar" }: { href: string; label?: string }) {
  const { replaceCurrentTab } = useTabsContext();
  return (
    <Button variant="outline" size="sm" onClick={() => replaceCurrentTab(href)}>
      <Edit className="w-4 h-4 mr-2" />
      {label}
    </Button>
  );
}
