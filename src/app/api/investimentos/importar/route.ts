export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prismaSemEscopo } from "@/lib/prisma";
import { resolverAtivo, normalizarTicker, requireInvestimentos } from "@/lib/investimentos";

// POST /api/investimentos/importar — extrato XLSX da Área do Investidor da B3.
// Detecta o layout pelas colunas:
//  • Negociação  ("Código de Negociação", Compra/Venda)  → operações
//  • Movimentação ("Movimentação"/"Produto")             → proventos
// Dedup por chaveImport (unique usuarioId+chave, skipDuplicates): reimportar o
// mesmo arquivo não duplica nada.

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[R$\s.]/g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function parseData(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`);
  }
  return null;
}

const PROVENTO_TIPO: Record<string, "DIVIDENDO" | "JCP" | "RENDIMENTO"> = {
  "dividendo": "DIVIDENDO",
  "juros sobre capital próprio": "JCP",
  "juros sobre capital proprio": "JCP",
  "rendimento": "RENDIMENTO",
};

export async function POST(req: NextRequest) {
  const auth = await requireInvestimentos();
  if (!auth.ok) return auth.response;
  const usuarioId = auth.session.sub;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo do extrato (.xlsx)." }, { status: 400 });

  let linhas: Record<string, unknown>[];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  } catch {
    return NextResponse.json({ error: "Não consegui ler o arquivo — exporte o extrato em Excel na Área do Investidor." }, { status: 400 });
  }
  if (linhas.length === 0) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });

  const colunas = Object.keys(linhas[0]);
  const ehNegociacao = colunas.includes("Código de Negociação");
  const ehMovimentacao = colunas.includes("Movimentação") && colunas.includes("Produto");
  if (!ehNegociacao && !ehMovimentacao) {
    return NextResponse.json({ error: "Layout não reconhecido — use o extrato de Negociação ou de Movimentação da B3." }, { status: 400 });
  }

  // Resolve/cria ativos e monta as linhas com chave de dedup (contador para
  // linhas legitimamente idênticas dentro do MESMO arquivo).
  const ativoCache = new Map<string, string | null>();
  async function ativoId(raw: string): Promise<string | null> {
    const t = normalizarTicker(raw);
    if (!ativoCache.has(t)) ativoCache.set(t, (await resolverAtivo(t))?.id ?? null);
    return ativoCache.get(t)!;
  }
  const contador = new Map<string, number>();
  const chave = (base: string) => {
    const n = (contador.get(base) ?? 0) + 1;
    contador.set(base, n);
    return `${base}#${n}`;
  };

  let ignoradas = 0;
  let operacoesNovas = 0, proventosNovos = 0, duplicadas = 0;

  if (ehNegociacao) {
    const ops: { usuarioId: string; ativoId: string; tipo: "COMPRA" | "VENDA"; data: Date; quantidade: number; preco: number; chaveImport: string }[] = [];
    for (const l of linhas) {
      const data = parseData(l["Data do Negócio"]);
      const tipoRaw = String(l["Tipo de Movimentação"] ?? "").toLowerCase();
      const ticker = String(l["Código de Negociação"] ?? "").trim();
      const qtd = parseNum(l["Quantidade"]);
      const preco = parseNum(l["Preço"]);
      const tipo = tipoRaw.includes("compra") ? "COMPRA" : tipoRaw.includes("venda") ? "VENDA" : null;
      if (!data || !tipo || !ticker || !(qtd > 0) || !(preco > 0)) { ignoradas++; continue; }
      const id = await ativoId(ticker);
      if (!id) { ignoradas++; continue; }
      ops.push({
        usuarioId, ativoId: id, tipo, data, quantidade: qtd, preco,
        chaveImport: chave(`neg|${data.toISOString().slice(0, 10)}|${tipo}|${normalizarTicker(ticker)}|${qtd}|${preco}`),
      });
    }
    const r = await prismaSemEscopo.investOperacao.createMany({ data: ops, skipDuplicates: true });
    operacoesNovas = r.count;
    duplicadas += ops.length - r.count;
  }

  if (ehMovimentacao) {
    const prs: { usuarioId: string; ativoId: string; tipo: "DIVIDENDO" | "JCP" | "RENDIMENTO"; data: Date; valor: number; chaveImport: string }[] = [];
    for (const l of linhas) {
      const mov = String(l["Movimentação"] ?? "").trim().toLowerCase();
      const tipo = PROVENTO_TIPO[mov];
      if (!tipo) continue; // só proventos — as demais movimentações são esperadas aqui
      const data = parseData(l["Data"]);
      const produto = String(l["Produto"] ?? "");
      const ticker = produto.split(" - ")[0]?.trim();
      const valor = parseNum(l["Valor da Operação"]);
      if (!data || !ticker || !(valor > 0)) { ignoradas++; continue; }
      const id = await ativoId(ticker);
      if (!id) { ignoradas++; continue; }
      prs.push({
        usuarioId, ativoId: id, tipo, data, valor,
        chaveImport: chave(`mov|${data.toISOString().slice(0, 10)}|${tipo}|${normalizarTicker(ticker)}|${valor}`),
      });
    }
    const r = await prismaSemEscopo.investProvento.createMany({ data: prs, skipDuplicates: true });
    proventosNovos = r.count;
    duplicadas += prs.length - r.count;
  }

  return NextResponse.json({ data: { operacoesNovas, proventosNovos, duplicadas, ignoradas } });
}
