export const dynamic = "force-dynamic";

// Registra/atualiza a empresa ativa no provedor fiscal (o certificado A1 fica
// hospedado lá) e grava os tokens de emissão devolvidos. Requer o master token
// da conta do provedor em Configuracao (chave: fiscal_master_token).

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { focusNfeProvider } from "@/lib/fiscal/providers/focus-nfe";
import { mascararSecret, somenteDigitos } from "@/lib/fiscal/provider";

export async function POST() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const config = await prisma.empresaFiscal.findFirst();
  if (!config) {
    return NextResponse.json({ error: "Salve a configuração fiscal antes de sincronizar" }, { status: 400 });
  }
  const empresa = await prisma.empresa.findUnique({ where: { id: config.empresaId } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  const master = await prisma.configuracao.findUnique({ where: { chave: "fiscal_master_token" } });
  if (!master?.valor) {
    return NextResponse.json(
      { error: "Master token do provedor não configurado (Configuracao: fiscal_master_token)" },
      { status: 400 },
    );
  }

  const faltando = [
    !empresa.logradouro && "logradouro",
    !empresa.numero && "número",
    !empresa.bairro && "bairro",
    !empresa.cidade && "cidade",
    !empresa.estado && "UF",
    !empresa.cep && "CEP",
    !config.codigoMunicipioIBGE && "código IBGE do município (config fiscal)",
  ].filter(Boolean);
  if (faltando.length) {
    return NextResponse.json(
      { error: `Complete o endereço da empresa antes de sincronizar: falta ${faltando.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    // Gestão de empresas do provedor roda no ambiente de produção da API
    // (os tokens devolvidos é que separam homologação × produção).
    const resultado = await focusNfeProvider.sincronizarEmpresa(master.valor, "PRODUCAO", {
      cnpj: somenteDigitos(empresa.cnpj),
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      ie: empresa.ie,
      im: empresa.im,
      crt: config.crt,
      email: empresa.email,
      telefone: empresa.telefone,
      endereco: {
        logradouro: empresa.logradouro!,
        numero: empresa.numero!,
        complemento: empresa.complemento,
        bairro: empresa.bairro!,
        municipio: empresa.cidade!,
        uf: empresa.estado!,
        cep: empresa.cep!,
        codigoMunicipioIBGE: config.codigoMunicipioIBGE!,
      },
    });

    const atualizada = await prisma.empresaFiscal.update({
      where: { id: config.id },
      data: {
        provedorEmpresaRef: resultado.provedorEmpresaRef,
        ...(resultado.tokenHomologacao ? { tokenHomologacao: resultado.tokenHomologacao } : {}),
        ...(resultado.tokenProducao ? { tokenProducao: resultado.tokenProducao } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      provedorEmpresaRef: atualizada.provedorEmpresaRef,
      tokenHomologacao: mascararSecret(atualizada.tokenHomologacao),
      tokenProducao: mascararSecret(atualizada.tokenProducao),
      aviso: "Envie o certificado A1 (.pfx) e a senha no painel do provedor, se ainda não enviou.",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
