export const dynamic = "force-dynamic";

// Status da integração Focus NFe por empresa do grupo (painel de Integrações).
// O master token/webhook secret são globais (Configuracao, salvos pela rota
// /api/configuracoes/integracoes); os tokens de emissão são por empresa
// (EmpresaFiscal, geridos em Fiscal → Configuração). Cross-empresa de
// propósito: usa prismaSemEscopo para listar o grupo inteiro.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const [empresas, configs, master, webhook] = await Promise.all([
    prismaSemEscopo.empresa.findMany({
      where: { ativo: true },
      select: { id: true, razaoSocial: true, cnpj: true },
      orderBy: { createdAt: "asc" },
    }),
    prismaSemEscopo.empresaFiscal.findMany(),
    prisma.configuracao.findUnique({ where: { chave: "fiscal_master_token" } }),
    prisma.configuracao.findUnique({ where: { chave: "fiscal_webhook_secret" } }),
  ]);

  return NextResponse.json({
    masterConfigurado: !!master?.valor,
    webhookConfigurado: !!webhook?.valor,
    empresas: empresas.map((e) => {
      const cfg = configs.find((c) => c.empresaId === e.id);
      return {
        id: e.id,
        razaoSocial: e.razaoSocial,
        cnpj: e.cnpj,
        configurada: !!cfg,
        ambiente: cfg?.ambiente ?? null,
        temTokenHomologacao: !!cfg?.tokenHomologacao,
        temTokenProducao: !!cfg?.tokenProducao,
        sincronizada: !!cfg?.provedorEmpresaRef,
        certificadoStatus: cfg?.certificadoStatus ?? null,
        certificadoValidade: cfg?.certificadoValidade ?? null,
      };
    }),
  });
}
