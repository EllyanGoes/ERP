"use client";

import { useParams, useRouter } from "next/navigation";
import PropostaForm from "@/components/suprimentos/PropostaForm";

// A proposta agora abre em popup na tela da cotação; esta rota permanece para
// links diretos/antigos e renderiza o mesmo formulário em modo página.
export default function EditPropostaPage() {
  const { id: cotacaoId, cfId } = useParams<{ id: string; cfId: string }>();
  const router = useRouter();
  const voltar = () => router.push(`/suprimentos/cotacoes/${cotacaoId}`);
  return (
    <PropostaForm
      cotacaoId={cotacaoId}
      cfId={cfId}
      mode="page"
      onClose={voltar}
      onSaved={voltar}
    />
  );
}
