// Parse do XML da NF-e (modelo 55) para o preenchimento automático do
// Documento de Entrada. Aceita tanto o XML distribuído (nfeProc, com protocolo)
// quanto a NFe "crua". Tudo é lido como string (parseTagValue off) para não
// corromper códigos com zeros à esquerda (cProd, cEAN, nNF).
import { XMLParser } from "fast-xml-parser";

export type NfeItemXml = {
  nItem: number;
  cProd: string;
  cEAN: string | null; // GTIN; null quando ausente ou "SEM GTIN"
  xProd: string;
  ncm: string | null;
  cfop: string | null;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  vDesc: number; // desconto da linha em R$
  vIPI: number;
  vICMS: number;
};

export type NfeDuplicataXml = {
  numero: string | null;
  vencimento: string | null; // YYYY-MM-DD
  valor: number;
};

export type NfeXml = {
  chave: string | null;
  numero: string;
  serie: string;
  emissao: string | null; // YYYY-MM-DD (dhEmi ou dEmi)
  emitente: {
    cnpj: string; // só dígitos
    nome: string;
    fantasia: string | null;
    ie: string | null;
    uf: string | null;
  };
  itens: NfeItemXml[];
  totais: {
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vOutro: number;
    vIPI: number;
    vICMS: number;
    vNF: number;
  };
  duplicatas: NfeDuplicataXml[];
};

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function arr<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Lança Error com mensagem amigável quando o XML não é uma NF-e válida. */
export function parseNfeXml(xml: string): NfeXml {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new Error("Arquivo não é um XML válido.");
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const root: any = doc as any;
  const nfe = root?.nfeProc?.NFe ?? root?.NFe ?? root?.enviNFe?.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error("XML não contém uma NF-e (tag infNFe não encontrada).");

  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const total = inf.total?.ICMSTot ?? {};

  // dhEmi (v4, ISO com fuso) ou dEmi (layouts antigos, YYYY-MM-DD)
  const emissaoRaw = str(ide.dhEmi) || str(ide.dEmi);
  const emissao = emissaoRaw ? emissaoRaw.slice(0, 10) : null;

  const chaveRaw = str(inf["@_Id"]); // "NFe3524..." → 44 dígitos
  const chave = chaveRaw ? chaveRaw.replace(/\D/g, "") || null : null;

  const itens: NfeItemXml[] = arr<any>(inf.det).map((det, i) => {
    const prod = det?.prod ?? {};
    const imposto = det?.imposto ?? {};
    // ICMS vem aninhado num grupo variável (ICMS00, ICMS20, ICMSSN102…)
    const icmsGrupo = imposto.ICMS ? (Object.values(imposto.ICMS)[0] as any) : null;
    const ipiTrib = imposto.IPI?.IPITrib;
    const ean = str(prod.cEAN).toUpperCase();
    return {
      nItem: parseInt(str(det?.["@_nItem"]), 10) || i + 1,
      cProd: str(prod.cProd),
      cEAN: ean && ean !== "SEM GTIN" ? ean : null,
      xProd: str(prod.xProd),
      ncm: str(prod.NCM) || null,
      cfop: str(prod.CFOP) || null,
      uCom: str(prod.uCom),
      qCom: num(prod.qCom),
      vUnCom: num(prod.vUnCom),
      vProd: num(prod.vProd),
      vDesc: num(prod.vDesc),
      vIPI: num(ipiTrib?.vIPI),
      vICMS: num(icmsGrupo?.vICMS),
    };
  });
  if (itens.length === 0) throw new Error("NF-e sem itens (tag det não encontrada).");

  const duplicatas: NfeDuplicataXml[] = arr<any>(inf.cobr?.dup).map((d) => ({
    numero: str(d?.nDup) || null,
    vencimento: str(d?.dVenc) || null,
    valor: num(d?.vDup),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const cnpj = str(emit.CNPJ ?? emit.CPF).replace(/\D/g, "");
  if (!cnpj) throw new Error("NF-e sem CNPJ/CPF do emitente.");

  return {
    chave,
    numero: str(ide.nNF),
    serie: str(ide.serie),
    emissao,
    emitente: {
      cnpj,
      nome: str(emit.xNome),
      fantasia: str(emit.xFant) || null,
      ie: str(emit.IE) || null,
      uf: str(emit.enderEmit?.UF) || null,
    },
    itens,
    totais: {
      vProd: num(total.vProd),
      vFrete: num(total.vFrete),
      vSeg: num(total.vSeg),
      vDesc: num(total.vDesc),
      vOutro: num(total.vOutro),
      vIPI: num(total.vIPI),
      vICMS: num(total.vICMS),
      vNF: num(total.vNF),
    },
    duplicatas,
  };
}

/** Normaliza descrição p/ matching: maiúsculas, sem acento, espaços colapsados. */
export function normalizarDescricao(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Score de similaridade por tokens (0..1): proporção dos tokens da descrição
 * da NF encontrados na descrição do item. Tokens curtos (1 char) são ignorados.
 */
export function scoreDescricao(nfDesc: string, itemDesc: string): number {
  const a = normalizarDescricao(nfDesc).split(" ").filter((t) => t.length > 1);
  const b = new Set(normalizarDescricao(itemDesc).split(" ").filter((t) => t.length > 1));
  if (a.length === 0 || b.size === 0) return 0;
  const hits = a.filter((t) => b.has(t)).length;
  return hits / a.length;
}
