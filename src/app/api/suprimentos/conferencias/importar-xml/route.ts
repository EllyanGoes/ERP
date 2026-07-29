export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseNfeXml, normalizarDescricao, scoreDescricao } from "@/lib/nfe-xml";

// Importação de NF-e (XML) para preencher o Documento de Entrada: faz o parse
// do XML, casa o emitente com um Fornecedor (por CNPJ, só dígitos) e cada item
// da nota com um Item do cadastro — por GTIN, depois código, depois descrição
// (match exato ou sugestão por similaridade). Não grava nada: devolve os dados
// prontos para a tela de novo DE preencher o formulário.

type ItemCadastro = {
  id: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  gtin: string | null;
  gtinTributavel: string | null;
};

type Confianca = "GTIN" | "CODIGO" | "DESCRICAO" | "DESCRICAO_PARCIAL";

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const xml = typeof body?.xml === "string" ? body.xml : "";
  if (!xml.trim()) {
    return NextResponse.json({ error: "Envie o conteúdo do XML no campo 'xml'." }, { status: 400 });
  }

  let nfe;
  try {
    nfe = parseNfeXml(xml);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "XML inválido." }, { status: 400 });
  }

  // ── Fornecedor pelo CNPJ do emitente (comparando só dígitos) ──────────────
  const fornecedores = await prisma.$queryRawUnsafe<
    { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null }[]
  >(
    `SELECT id, "razaoSocial", "nomeFantasia", "cpfCnpj" FROM "Fornecedor"
     WHERE regexp_replace(coalesce("cpfCnpj", ''), '\\D', '', 'g') = $1 LIMIT 1`,
    nfe.emitente.cnpj,
  );
  const fornecedor = fornecedores[0] ?? null;

  // ── Matching dos itens ────────────────────────────────────────────────────
  const cadastro: ItemCadastro[] = await prisma.item.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, descricao: true, unidadeMedida: true, gtin: true, gtinTributavel: true },
  });
  const porGtin = new Map<string, ItemCadastro>();
  const porCodigo = new Map<string, ItemCadastro>();
  const porDescricao = new Map<string, ItemCadastro>();
  for (const it of cadastro) {
    if (it.gtin) porGtin.set(it.gtin.replace(/\D/g, ""), it);
    if (it.gtinTributavel) porGtin.set(it.gtinTributavel.replace(/\D/g, ""), it);
    porCodigo.set(it.codigo.toUpperCase(), it);
    porDescricao.set(normalizarDescricao(it.descricao), it);
  }

  const itens = nfe.itens.map((det) => {
    let match: ItemCadastro | null = null;
    let confianca: Confianca | null = null;

    if (det.cEAN) {
      match = porGtin.get(det.cEAN.replace(/\D/g, "")) ?? null;
      if (match) confianca = "GTIN";
    }
    if (!match && det.cProd) {
      match = porCodigo.get(det.cProd.toUpperCase()) ?? null;
      if (match) confianca = "CODIGO";
    }
    if (!match && det.xProd) {
      match = porDescricao.get(normalizarDescricao(det.xProd)) ?? null;
      if (match) confianca = "DESCRICAO";
    }
    if (!match && det.xProd) {
      // Sugestão por similaridade de tokens — só acima de 0.6 e sem empate.
      let melhor: ItemCadastro | null = null;
      let melhorScore = 0;
      let empate = false;
      for (const it of cadastro) {
        const s = scoreDescricao(det.xProd, it.descricao);
        if (s > melhorScore) {
          melhor = it;
          melhorScore = s;
          empate = false;
        } else if (s === melhorScore && s > 0) {
          empate = true;
        }
      }
      if (melhor && melhorScore >= 0.6 && !empate) {
        match = melhor;
        confianca = "DESCRICAO_PARCIAL";
      }
    }

    return {
      ...det,
      match: match
        ? {
            itemId: match.id,
            codigo: match.codigo,
            descricao: match.descricao,
            unidadeMedida: match.unidadeMedida,
            confianca,
          }
        : null,
    };
  });

  return NextResponse.json({
    data: {
      chave: nfe.chave,
      numero: nfe.numero,
      serie: nfe.serie,
      emissao: nfe.emissao,
      emitente: nfe.emitente,
      fornecedor,
      itens,
      totais: nfe.totais,
      duplicatas: nfe.duplicatas,
    },
  });
}
