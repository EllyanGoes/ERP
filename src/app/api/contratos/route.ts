export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { camposContrato } from "@/lib/contratos-campos";
import { CONTRATO_SELECT, pendenciasContrato, proximoEvento, proximoNumeroContrato, registrarEvento, semaforo, sincronizarEventosProjetados, valorMensal, fimVigente } from "@/lib/contratos";

// GET /api/contratos?status=&lado=&tipo=&parte=<fornecedorId|clienteId>&responsavelId=&q=&encerrados=1
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const encerrados = sp.get("encerrados") === "1";
  const parte = sp.get("parte");
  const lista = await prisma.contrato.findMany({
    where: {
      ...(sp.get("status") ? { status: sp.get("status") as never } : encerrados ? { status: { in: ["ENCERRADO", "RESCINDIDO"] } } : { status: { notIn: ["ENCERRADO", "RESCINDIDO"] } }),
      ...(sp.get("lado") ? { lado: sp.get("lado") as never } : {}),
      ...(sp.get("tipo") ? { tipo: sp.get("tipo") as never } : {}),
      ...(sp.get("responsavelId") ? { responsavelId: sp.get("responsavelId")! } : {}),
      ...(parte ? { OR: [{ fornecedorId: parte }, { clienteId: parte }] } : {}),
    },
    orderBy: [{ status: "asc" }, { fim: "asc" }, { numero: "desc" }],
    select: CONTRATO_SELECT,
  });
  const hoje = new Date();
  const data = lista.map((c) => {
    const pend = pendenciasContrato(c, hoje);
    return { ...c, pendencias: pend, semaforo: semaforo(pend), proximoEvento: proximoEvento(c, hoje), valorMensal: valorMensal(c, hoje), fimVigente: fimVigente(c) };
  });
  return NextResponse.json({ data });
}

// POST /api/contratos — cria (MINUTA, ou VIGENTE quando { ativar: true }).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const campos = camposContrato(b);
  if (!campos.titulo) return NextResponse.json({ error: "Informe o título do contrato." }, { status: 400 });
  if (campos.lado === "DESPESA" && !campos.fornecedorId) return NextResponse.json({ error: "Informe o fornecedor (contraparte)." }, { status: 400 });
  if (campos.lado === "RECEITA" && !campos.clienteId) return NextResponse.json({ error: "Informe o cliente (contraparte)." }, { status: 400 });
  if (campos.renovacao === "AUTOMATICA" && !campos.fim) return NextResponse.json({ error: "Renovação automática exige data de fim do período." }, { status: 400 });
  const responsavelId = b.responsavelId ? String(b.responsavelId) : auth.session.sub;
  const ativar = b.ativar === true;
  try {
    const criado = await prismaSemEscopo.$transaction(async (tx) => {
      const numero = await proximoNumeroContrato(tx, empresaId);
      const c = await tx.contrato.create({
        data: { ...campos, empresaId, numero, responsavelId, status: ativar ? "VIGENTE" : "MINUTA", criadoPor: auth.session.nome },
        select: CONTRATO_SELECT,
      });
      await registrarEvento(tx, c.id, "CRIADO", `Contrato criado por ${auth.session.nome}`, auth.session.sub);
      if (ativar) { await registrarEvento(tx, c.id, "ATIVADO", "Ativado na criação", auth.session.sub); await sincronizarEventosProjetados(tx, c); }
      return c;
    });
    return NextResponse.json({ data: criado }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao criar contrato" }, { status: 400 });
  }
}
