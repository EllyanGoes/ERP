export const dynamic = "force-dynamic";

// Testa a credencial do provedor da empresa ativa: consulta uma ref inexistente.
// 404 do provedor = autenticou (token válido); 401/403 = token inválido.

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FiscalConfigError, getFiscalProvider } from "@/lib/fiscal/provider";

export async function POST() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const config = await prisma.empresaFiscal.findFirst();
  if (!config) return NextResponse.json({ error: "Configuração fiscal não cadastrada" }, { status: 400 });

  try {
    const { provider, credencial } = await getFiscalProvider(config.empresaId);
    const resultado = await provider.consultar(credencial, "teste-conexao-erp");
    const autenticou =
      resultado.situacao !== "ERRO" || /não encontrada/i.test(resultado.mensagem ?? "");
    return NextResponse.json({
      ok: autenticou,
      ambiente: credencial.ambiente,
      detalhe: autenticou
        ? `Conexão OK com ${provider.nome} (${credencial.ambiente.toLowerCase()})`
        : `Falha de autenticação: ${resultado.situacao === "ERRO" ? resultado.mensagem : ""}`,
    });
  } catch (e) {
    const status = e instanceof FiscalConfigError ? 400 : 502;
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status });
  }
}
