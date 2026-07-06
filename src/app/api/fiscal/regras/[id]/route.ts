export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const opt = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);
const optNum = (v: unknown) => (opt(v) === null ? null : Number(v));
const optStr = (v: unknown) => (opt(v) === null ? null : String(v).trim());

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const cfop = String(body.cfop ?? "").replace(/\D/g, "");
  const cstIcms = String(body.cstIcms ?? "").trim();
  if (cfop.length !== 4) return NextResponse.json({ error: "CFOP deve ter 4 dígitos" }, { status: 400 });
  if (!cstIcms) return NextResponse.json({ error: "CST/CSOSN do ICMS é obrigatório" }, { status: 400 });

  const regra = await prisma.regraTributacao.update({
    where: { id: params.id },
    data: {
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
    },
  });
  return NextResponse.json(regra);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  await prisma.regraTributacao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
