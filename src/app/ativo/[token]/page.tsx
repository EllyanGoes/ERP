// Página PÚBLICA da etiqueta QR do ativo (/ativo/<qrToken>) — fora do grupo
// (erp): sem sidebar/abas e sem login (liberada no middleware). Renderiza no
// servidor direto da lib (sem ida e volta à API) e entrega ao componente
// cliente, que cuida das seções e do formulário de solicitação.
import type { Metadata } from "next";
import { cache } from "react";
import { dadosAtivoPublico } from "@/lib/manutencao/publico";
import { getSession } from "@/lib/auth";
import { getUserModulos, hasModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import AtivoPublico, { EtiquetaInvalida, type MedidorInterno } from "./AtivoPublico";

export const dynamic = "force-dynamic";

// metadata + página na mesma requisição → uma consulta só.
const carregar = cache((token: string) => dadosAtivoPublico(token));

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await carregar(params.token);
  return {
    title: d ? `${d.ativo.tag} — ${d.ativo.nome}` : "Etiqueta inválida",
    description: d ? `Manutenção · ${d.empresa}` : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function AtivoPublicoPage({ params }: { params: { token: string } }) {
  const d = await carregar(params.token);
  if (!d) return <EtiquetaInvalida />;
  return <AtivoPublico token={params.token} dados={d} agoraIso={new Date().toISOString()} medidores={await medidoresParaEquipe(params.token)} />;
}

/**
 * Leitura de horímetro direto da etiqueta: só para quem está logado com o módulo
 * Manutenção (o resto do público nem vê a seção). A gravação vai pela API interna
 * /api/pcm/medidores, que exige a sessão de novo.
 */
async function medidoresParaEquipe(token: string): Promise<MedidorInterno[] | null> {
  const sessao = await getSession().catch(() => null);
  if (!sessao) return null;
  if (sessao.perfil !== "ADMIN" && !hasModulo(await getUserModulos(sessao.sub), "pcm")) return null;
  const ativo = await prismaSemEscopo.manutAtivo.findUnique({ where: { qrToken: token }, select: { id: true, empresaId: true } });
  if (!ativo || !(sessao.perfil === "ADMIN" || (sessao.empresaIds ?? []).includes(ativo.empresaId))) return null;
  const meds = await prismaSemEscopo.manutMedidor.findMany({
    where: { ativoId: ativo.id, ativo: true },
    select: { id: true, nome: true, unidade: true, acumulado: true, leituras: { orderBy: { data: "desc" }, take: 1, select: { data: true } } },
    orderBy: { nome: "asc" },
  });
  return meds.map((m) => ({ id: m.id, nome: m.nome, unidade: m.unidade, acumulado: Number(m.acumulado), ultimaLeitura: m.leituras[0]?.data.toISOString() ?? null }));
}
