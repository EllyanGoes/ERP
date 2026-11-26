// Página PÚBLICA do processo para advogado/despachante (/externo/processo/<token>) — fase 3 de
// docs/processos-prd.md. Fora do grupo (erp): sem sidebar e sem login (liberada no middleware).
// O token aleatório da URL é a chave (só o hash no banco; revogável e com validade).
// Mostra SÓ: título, número, órgão, situação, andamentos não internos, prazos e documentos
// compartilhados com este link. Nunca credenciais, financeiro, partes, valores ou outros processos.
import type { Metadata } from "next";
import { cache } from "react";
import { dadosProcessoExterno } from "@/lib/processos-externo";
import ProcessoExterno, { LinkInvalido } from "./ProcessoExterno";

export const dynamic = "force-dynamic";

const carregar = cache((token: string) => dadosProcessoExterno(token));

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await carregar(params.token);
  return {
    title: d ? `${d.processo.codigo} — ${d.processo.titulo}` : "Link inválido ou expirado",
    description: d ? `Processo · ${d.processo.empresa}` : undefined,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ProcessoExternoPage({ params }: { params: { token: string } }) {
  const d = await carregar(params.token);
  if (!d) return <LinkInvalido />;
  return <ProcessoExterno token={params.token} dados={d} />;
}
