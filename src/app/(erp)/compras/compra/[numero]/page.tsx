"use client";

// Página da compra (PC-0430): a aba e o documento ficam na URL (?aba=…&doc=…)
// para o link levar direto a eles. O conteúdo é o CompraDetalhe, o mesmo do
// popup do Fluxo de Compras.
import { useCallback } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import CompraDetalhe, { type NavegacaoCompra } from "@/components/compras/CompraDetalhe";
import { useTabTitle } from "@/lib/tabs-context";

export default function CompraPage() {
  const { numero } = useParams<{ numero: string }>();
  const numeroCompra = decodeURIComponent(numero);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  useTabTitle(`Compra ${numeroCompra}`);

  const onNavegar = useCallback(({ aba, doc }: NavegacaoCompra) => {
    const qs = new URLSearchParams(searchParams.toString());
    if (aba) qs.set("aba", aba);
    if (doc) qs.set("doc", doc); else qs.delete("doc");
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <CompraDetalhe
      numeroCompra={numeroCompra}
      empresa={searchParams.get("empresa")}
      abaParam={searchParams.get("aba")}
      docParam={searchParams.get("doc")}
      onNavegar={onNavegar}
    />
  );
}
