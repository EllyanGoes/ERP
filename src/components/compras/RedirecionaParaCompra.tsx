"use client";

// Leva a tela de detalhe de uma etapa (SC/CT/PC/DE) para a página única da
// compra, já na aba certa. Só age na rota base do documento (/…/[id]); telas
// auxiliares como /editar e /analise seguem normais. Sem número de compra
// (espelho intragrupo, documento antigo), a tela própria aparece como antes.
import { useEffect, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { EtapaCompra } from "@/lib/compras-processo";

export default function RedirecionaParaCompra({ etapa, children }: { etapa: EtapaCompra; children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const ehBase = !!id && pathname.endsWith(`/${id}`);
  const [resolvido, setResolvido] = useState(!ehBase);

  useEffect(() => {
    if (!ehBase) { setResolvido(true); return; }
    let vivo = true;
    setResolvido(false);
    fetch(`/api/compras/compra/resolver?etapa=${etapa}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { numeroCompra: string | null; empresaId?: string } | null) => {
        if (!vivo) return;
        if (!d?.numeroCompra) { setResolvido(true); return; }
        const qs = new URLSearchParams(searchParams.toString());
        qs.set("empresa", d.empresaId ?? "");
        qs.set("aba", etapa);
        qs.set("doc", id);
        router.replace(`/compras/compra/${encodeURIComponent(d.numeroCompra)}?${qs.toString()}`);
      })
      .catch(() => { if (vivo) setResolvido(true); });
    return () => { vivo = false; };
  }, [ehBase, etapa, id, router, searchParams]);

  if (!resolvido) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" />
      </div>
    );
  }
  return <>{children}</>;
}
