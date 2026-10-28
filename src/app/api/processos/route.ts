export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { PROCESSO_LISTA_SELECT, SITUACOES_ABERTAS, camposProcesso, filtroVisibilidade, pendenciasProcesso, podeEditar, proximoCodigoProcesso, situacaoPorAndamento, TIPOS_ANDAMENTO } from "@/lib/processos";

// GET /api/processos?encerrados=1&tipo=&situacao=&responsavelId= — processos visíveis da empresa ativa
// com pendências (prazos, parado, aguardando a empresa), próximo prazo e último andamento.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const visivel = await filtroVisibilidade(auth.session);
  const lista = await prisma.processo.findMany({
    where: {
      AND: [visivel],
      ...(sp.get("situacao") ? { situacao: sp.get("situacao")! } : sp.get("encerrados") === "1" ? { situacao: { notIn: SITUACOES_ABERTAS } } : { situacao: { in: SITUACOES_ABERTAS } }),
      ...(sp.get("tipo") ? { tipo: sp.get("tipo")! } : {}),
      ...(sp.get("responsavelId") ? { responsavelId: sp.get("responsavelId")! } : {}),
    },
    orderBy: [{ codigo: "desc" }],
    select: PROCESSO_LISTA_SELECT,
  });
  const hoje = new Date();
  const data = lista.map((p) => ({ ...p, pendencias: pendenciasProcesso(p, hoje), proximoPrazo: p.prazos[0] ?? null, ultimoAndamento: p.andamentos[0] ?? null }));
  return NextResponse.json({ data, podeEditar: await podeEditar(auth.session) });
}

// POST — novo processo. Body: campos do processo + andamentoInicial? { data, tipo, descricao }.
// Interessado pessoa física nasce confidencial (decisão do dono, PRD §9).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão para cadastrar processos." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const campos = camposProcesso(b);
  if (!campos.titulo) return NextResponse.json({ error: "Informe o título do processo." }, { status: 400 });
  if (!campos.orgao) return NextResponse.json({ error: "Informe o órgão (ou vara/tribunal)." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const pessoa = campos.interessadoTipo === "PESSOA";
  const ini = b.andamentoInicial as { data?: string; tipo?: string; descricao?: string } | undefined;
  const criado = await prismaSemEscopo.$transaction(async (tx) => {
    const codigo = await proximoCodigoProcesso(tx, empresaId);
    const p = await tx.processo.create({
      data: {
        ...(campos as object), empresaId, codigo, titulo: String(campos.titulo), orgao: String(campos.orgao), tipo: String(campos.tipo ?? "OUTRO"),
        responsavelId: (campos.responsavelId as string | null | undefined) ?? auth.session.sub,
        confidencial: "confidencial" in b ? !!b.confidencial : pessoa,
        situacao: ini?.tipo ? situacaoPorAndamento(ini.tipo) ?? String(campos.situacao ?? "EM_ANDAMENTO") : String(campos.situacao ?? "EM_ANDAMENTO"),
        criadoPor: auth.session.nome,
      },
      select: { id: true, codigo: true },
    });
    if (ini?.descricao?.trim()) {
      await tx.processoAndamento.create({ data: { processoId: p.id, data: ini.data ? new Date(ini.data) : new Date(), tipo: TIPOS_ANDAMENTO[String(ini.tipo)] ? String(ini.tipo) : "PROTOCOLO", descricao: ini.descricao.trim(), usuario: auth.session.nome } });
    }
    return p;
  });
  return NextResponse.json({ data: criado }, { status: 201 });
}
