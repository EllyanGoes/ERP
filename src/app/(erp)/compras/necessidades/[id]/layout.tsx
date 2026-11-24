"use client";

import type { ReactNode } from "react";
import RedirecionaParaCompra from "@/components/compras/RedirecionaParaCompra";

// A tela deste documento vive como aba da página única da compra.
export default function Layout({ children }: { children: ReactNode }) {
  return <RedirecionaParaCompra etapa="solicitacao">{children}</RedirecionaParaCompra>;
}
