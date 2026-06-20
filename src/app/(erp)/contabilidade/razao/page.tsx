"use client";

import RazaoView from "@/components/contabilidade/RazaoView";

// Razão (índice): seletor de conta. Cada conta abre em uma aba própria
// (/contabilidade/razao/[contaId]); compat com links antigos via ?contaId=.
export default function RazaoPage() {
  return <RazaoView />;
}
