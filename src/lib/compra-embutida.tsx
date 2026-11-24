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
import { useParams } from "next/navigation";

type CompraEmbutida = { docId: string };

const Ctx = createContext<CompraEmbutida | null>(null);

export function CompraEmbutidaProvider({ docId, children }: { docId: string; children: ReactNode }) {
  return <Ctx.Provider value={{ docId }}>{children}</Ctx.Provider>;
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
