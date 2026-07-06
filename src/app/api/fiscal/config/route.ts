export const dynamic = "force-dynamic";

// Configuração fiscal da EMPRESA ATIVA (EmpresaFiscal 1:1). Tokens são secrets:
// nunca voltam no GET (mascarados) e o PUT ignora valores mascarados/vazios.

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { mascararSecret } from "@/lib/fiscal/provider";

export async function GET() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const config = await prisma.empresaFiscal.findFirst();
  const empresa = await prisma.empresa.findFirst({
    where: config ? { id: config.empresaId } : undefined,
    select: { id: true, razaoSocial: true, cnpj: true, ie: true, cidade: true, estado: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    empresa,
    config: config
      ? {
          ...config,
          tokenHomologacao: mascararSecret(config.tokenHomologacao),
          tokenProducao: mascararSecret(config.tokenProducao),
          cscToken: mascararSecret(config.cscToken),
        }
      : null,
  });
}

const ehMascarado = (v: unknown) => typeof v !== "string" || v.trim() === "" || v.includes("••");

export async function PUT(req: NextRequest) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const crt = Number(body.crt ?? 3);
  if (![1, 2, 3, 4].includes(crt)) {
    return NextResponse.json({ error: "CRT inválido (1, 2, 3 ou 4)" }, { status: 400 });
  }
  const ambiente = body.ambiente === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";

  const dados = {
    crt,
    regimeApuracao: body.regimeApuracao?.trim() || null,
    cnaePrincipal: body.cnaePrincipal?.trim() || null,
    codigoMunicipioIBGE: body.codigoMunicipioIBGE?.trim() || null,
    provedor: body.provedor?.trim() || "FOCUS_NFE",
    ambiente,
    cscId: body.cscId?.trim() || null,
    manifestacaoAutomatica: Boolean(body.manifestacaoAutomatica ?? true),
    emiteIbsCbs: Boolean(body.emiteIbsCbs ?? false),
    // secrets: só grava quando o usuário digitou um valor novo (não mascarado)
    ...(!ehMascarado(body.tokenHomologacao) ? { tokenHomologacao: body.tokenHomologacao.trim() } : {}),
    ...(!ehMascarado(body.tokenProducao) ? { tokenProducao: body.tokenProducao.trim() } : {}),
    ...(!ehMascarado(body.cscToken) ? { cscToken: body.cscToken.trim() } : {}),
  };

  const existente = await prisma.empresaFiscal.findFirst();
  const config = existente
    ? await prisma.empresaFiscal.update({ where: { id: existente.id }, data: dados })
    : await prisma.empresaFiscal.create({ data: dados });

  return NextResponse.json({
    ...config,
    tokenHomologacao: mascararSecret(config.tokenHomologacao),
    tokenProducao: mascararSecret(config.tokenProducao),
    cscToken: mascararSecret(config.cscToken),
  });
}
