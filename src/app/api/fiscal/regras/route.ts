export const dynamic = "force-dynamic";

// RegraTributacao — motor de tributação do módulo Fiscal. Dimensões anuláveis
// (null = "qualquer"); resolução por especificidade em src/lib/fiscal/tributacao.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const operacaoFiscalId = searchParams.get("operacaoFiscalId");

  const regras = await prisma.regraTributacao.findMany({
    where: operacaoFiscalId ? { operacaoFiscalId } : undefined,
    orderBy: [{ operacaoFiscalId: "asc" }, { prioridade: "desc" }, { createdAt: "asc" }],
    include: {
      operacaoFiscal: { select: { codigo: true, descricao: true } },
      grupoTributacao: { select: { codigo: true, nome: true } },
    },
  });
  return NextResponse.json(regras);
}

const opt = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);
const optNum = (v: unknown) => (opt(v) === null ? null : Number(v));
const optStr = (v: unknown) => (opt(v) === null ? null : String(v).trim());

function parseRegra(body: Record<string, unknown>) {
  const cfop = String(body.cfop ?? "").replace(/\D/g, "");
  const cstIcms = String(body.cstIcms ?? "").trim();
  if (cfop.length !== 4) throw new Error("CFOP deve ter 4 dígitos");
  if (!cstIcms) throw new Error("CST/CSOSN do ICMS é obrigatório");

  return {
    cfop,
    cstIcms,
    ufDestino: optStr(body.ufDestino)?.toUpperCase() ?? null,
    dentroEstado: body.dentroEstado === null || body.dentroEstado === undefined || body.dentroEstado === "" ? null : Boolean(body.dentroEstado),
    tipoContribuinte: optStr(body.tipoContribuinte),
    grupoTributacaoId: optStr(body.grupoTributacaoId),
    itemId: optStr(body.itemId),
    aliqIcms: optNum(body.aliqIcms),
    pRedBcIcms: optNum(body.pRedBcIcms),
    modBcIcms: optNum(body.modBcIcms) ?? 3,
    temSt: Boolean(body.temSt ?? false),
    mvaSt: optNum(body.mvaSt),
    cstIpi: optStr(body.cstIpi),
    aliqIpi: optNum(body.aliqIpi),
    cstPis: optStr(body.cstPis),
    aliqPis: optNum(body.aliqPis),
    cstCofins: optStr(body.cstCofins),
    aliqCofins: optNum(body.aliqCofins),
    cClassTrib: optStr(body.cClassTrib),
    cBeneficio: optStr(body.cBeneficio),
    mensagemFiscal: optStr(body.mensagemFiscal),
    prioridade: optNum(body.prioridade) ?? 0,
    ativo: Boolean(body.ativo ?? true),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const operacaoFiscalId = String(body.operacaoFiscalId ?? "");
  if (!operacaoFiscalId) {
    return NextResponse.json({ error: "Operação fiscal é obrigatória" }, { status: 400 });
  }

  let dados;
  try {
    dados = parseRegra(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const regra = await prisma.regraTributacao.create({
    data: { operacaoFiscalId, ...dados },
  });
  return NextResponse.json(regra, { status: 201 });
}
