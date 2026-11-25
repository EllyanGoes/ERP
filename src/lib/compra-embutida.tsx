"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Telas de etapa (Solicitação, Cotação, Pedido, Entrada) dentro da página única
// da compra (/compras/compra/[numero]).
//
// As mesmas telas de detalhe continuam sendo páginas próprias; quando aparecem
// numa aba da compra, este contexto informa o id do documento (no lugar do
// parâmetro da rota), faz o PageHeader mostrar só os botões e impede a tela de
// trocar o título da aba do navegador.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTabsContext } from "@/lib/tabs-context";

/** `abrir(href)` devolve true quando a compra mostra a tela ali mesmo (sem sair). */
type CompraEmbutida = { docId: string; abrir?: (href: string) => boolean };

const Ctx = createContext<CompraEmbutida | null>(null);

export function CompraEmbutidaProvider({ docId, abrir, children }: { docId: string; abrir?: (href: string) => boolean; children: ReactNode }) {
  return <Ctx.Provider value={{ docId, abrir }}>{children}</Ctx.Provider>;
}

/**
 * Navegação das telas de etapa: dentro da compra (página ou popup), editar e
 * analisar abrem ali mesmo; fora dela, navega normalmente.
 */
export function useNavegacaoCompra() {
  const ctx = useContext(Ctx);
  const router = useRouter();
  const { replaceCurrentTab } = useTabsContext();
  return {
    ir: (href: string) => { if (!ctx?.abrir?.(href)) router.push(href); },
    substituir: (href: string) => { if (!ctx?.abrir?.(href)) replaceCurrentTab(href); },
  };
}

/** true quando a tela está dentro de uma aba da página da compra. */
export function useEmbutidoNaCompra(): boolean {
  return useContext(Ctx) !== null;
}

/** Id do documento: o da aba da compra, ou o parâmetro [id] da rota. */
export function useDocumentoId(): string {
  const ctx = useContext(Ctx);
  const params = useParams<{ id?: string }>();
  return ctx?.docId ?? params?.id ?? "";
}
