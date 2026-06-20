"use client";

import RazaoView from "@/components/contabilidade/RazaoView";

// Razão de uma conta numa ABA própria: o caminho carrega o contaId, então o
// sistema de abas trata cada conta como uma aba distinta.
export default function RazaoContaPage({ params }: { params: { contaId: string } }) {
  return <RazaoView contaId={params.contaId} />;
}
