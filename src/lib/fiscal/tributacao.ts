// Motor de tributação do módulo Fiscal (docs/fiscal-prd.md, seção 3.4).
// Opera SOBRE A NOTA (nunca sobre o pedido): dado (empresa, operação fiscal,
// destino, destinatário, item), resolve a RegraTributacao mais específica e
// calcula os valores sugeridos do item. Tudo é revisável na tela antes de
// transmitir. Sem regra aplicável a resolução FALHA — nunca chuta CST.

import { prismaSemEscopo } from "@/lib/prisma";
import type { RegraTributacao } from "@prisma/client";

export class TributacaoError extends Error {}

export interface ContextoTributacao {
  empresaId: string;
  operacaoFiscalId: string;
  ufEmitente: string; // Empresa.estado
  ufDestino: string;
  tipoContribuinte: "CONTRIBUINTE" | "ISENTO" | "NAO_CONTRIBUINTE";
}

export interface ItemTributavel {
  itemId?: string | null;
  grupoTributacaoId?: string | null;
  quantidade: number;
  vUnitario: number;
  vDesconto: number;
}

export interface TributacaoItem {
  regraAplicadaId: string;
  cfop: string;
  cstIcms: string;
  aliqIcms: number | null;
  vBcIcms: number | null;
  vIcms: number | null;
  cstIpi: string | null;
  vIpi: number | null;
  cstPis: string | null;
  aliqPis: number | null;
  vPis: number | null;
  cstCofins: string | null;
  aliqCofins: number | null;
  vCofins: number | null;
  cClassTrib: string | null;
  mensagemFiscal: string | null;
}

export function tipoContribuinteDeIndIE(indIE: number | null | undefined): ContextoTributacao["tipoContribuinte"] {
  if (indIE === 1) return "CONTRIBUINTE";
  if (indIE === 2) return "ISENTO";
  return "NAO_CONTRIBUINTE";
}

/**
 * Pontuação por especificidade: itemId +8, grupo +4, ufDestino +2
 * (dentroEstado +1), tipoContribuinte +1. Dimensão preenchida que NÃO casa
 * desqualifica a regra; null = "qualquer". Desempate por prioridade.
 */
function pontuar(regra: RegraTributacao, ctx: ContextoTributacao, item: ItemTributavel): number | null {
  let pontos = 0;

  if (regra.itemId != null) {
    if (regra.itemId !== item.itemId) return null;
    pontos += 8;
  }
  if (regra.grupoTributacaoId != null) {
    if (regra.grupoTributacaoId !== item.grupoTributacaoId) return null;
    pontos += 4;
  }
  if (regra.ufDestino != null) {
    if (regra.ufDestino !== ctx.ufDestino) return null;
    pontos += 2;
  } else if (regra.dentroEstado != null) {
    const dentro = ctx.ufDestino === ctx.ufEmitente;
    if (regra.dentroEstado !== dentro) return null;
    pontos += 1;
  }
  if (regra.tipoContribuinte != null) {
    if (regra.tipoContribuinte !== ctx.tipoContribuinte) return null;
    pontos += 1;
  }
  return pontos;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function calcular(regra: RegraTributacao, item: ItemTributavel): TributacaoItem {
  const vTotal = round2(item.quantidade * item.vUnitario - item.vDesconto);

  let vBcIcms: number | null = null;
  let vIcms: number | null = null;
  const aliqIcms = regra.aliqIcms != null ? Number(regra.aliqIcms) : null;
  if (aliqIcms != null) {
    const reducao = regra.pRedBcIcms != null ? Number(regra.pRedBcIcms) / 100 : 0;
    vBcIcms = round2(vTotal * (1 - reducao));
    vIcms = round2(vBcIcms * (aliqIcms / 100));
  }

  const aliqIpi = regra.aliqIpi != null ? Number(regra.aliqIpi) : null;
  const vIpi = aliqIpi != null ? round2(vTotal * (aliqIpi / 100)) : null;

  const aliqPis = regra.aliqPis != null ? Number(regra.aliqPis) : null;
  const vPis = aliqPis != null ? round2(vTotal * (aliqPis / 100)) : null;

  const aliqCofins = regra.aliqCofins != null ? Number(regra.aliqCofins) : null;
  const vCofins = aliqCofins != null ? round2(vTotal * (aliqCofins / 100)) : null;

  return {
    regraAplicadaId: regra.id,
    cfop: regra.cfop,
    cstIcms: regra.cstIcms,
    aliqIcms,
    vBcIcms,
    vIcms,
    cstIpi: regra.cstIpi,
    vIpi,
    cstPis: regra.cstPis,
    aliqPis,
    vPis,
    cstCofins: regra.cstCofins,
    aliqCofins,
    vCofins,
    cClassTrib: regra.cClassTrib,
    mensagemFiscal: regra.mensagemFiscal,
  };
}

/**
 * Resolve a tributação de uma lista de itens da nota. Carrega as regras da
 * operação uma vez e resolve item a item. Lança TributacaoError apontando o
 * item sem regra.
 */
export async function tributarItens(
  ctx: ContextoTributacao,
  itens: (ItemTributavel & { descricao?: string })[],
): Promise<TributacaoItem[]> {
  const regras = await prismaSemEscopo.regraTributacao.findMany({
    where: { empresaId: ctx.empresaId, operacaoFiscalId: ctx.operacaoFiscalId, ativo: true },
  });
  if (regras.length === 0) {
    throw new TributacaoError(
      "Nenhuma regra de tributação cadastrada para esta operação fiscal — cadastre em Fiscal → Regras de Tributação.",
    );
  }

  return itens.map((item, idx) => {
    let melhor: { regra: RegraTributacao; pontos: number } | null = null;
    for (const regra of regras) {
      const pontos = pontuar(regra, ctx, item);
      if (pontos == null) continue;
      if (
        !melhor ||
        pontos > melhor.pontos ||
        (pontos === melhor.pontos && regra.prioridade > melhor.regra.prioridade)
      ) {
        melhor = { regra, pontos };
      }
    }
    if (!melhor) {
      throw new TributacaoError(
        `Nenhuma regra de tributação casa com o item ${idx + 1}${item.descricao ? ` (${item.descricao})` : ""} — destino ${ctx.ufDestino}, ${ctx.tipoContribuinte.toLowerCase().replace("_", " ")}.`,
      );
    }
    return calcular(melhor.regra, item);
  });
}
