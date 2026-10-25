// Página PÚBLICA da OS (/os/<linkToken>) — o link que vai por WhatsApp para os
// mecânicos. Fora do grupo (erp): sem sidebar/abas e sem login (liberada no
// middleware). Só leitura → renderiza tudo no servidor, direto da lib.
import type { Metadata } from "next";
import { cache } from "react";
import { dadosOSPublica } from "@/lib/manutencao/os-publica";
import OSPublica, { LinkInvalido } from "./OSPublica";

export const dynamic = "force-dynamic";

// metadata + página na mesma requisição → uma consulta só.
const carregar = cache((token: string) => dadosOSPublica(token));

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await carregar(params.token);
  return {
    title: d ? `${d.numero} — ${d.ativo ? `${d.ativo.tag} ${d.ativo.nome}` : d.tipoNome}` : "Link inválido ou expirado",
    description: d ? `Ordem de serviço · ${d.empresa}` : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function OSPublicaPage({ params }: { params: { token: string } }) {
  const d = await carregar(params.token);
  if (!d) return <LinkInvalido />;
  return <OSPublica dados={d} />;
}
