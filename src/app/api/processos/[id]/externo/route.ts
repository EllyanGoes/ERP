export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { carregarProcesso, dataOuNull, podeEditar, textoOuNull } from "@/lib/processos";
import { gerarTokenExterno, registrarLog } from "@/lib/processos-externo";

type Ctx = { params: { id: string } };

// Links externos do processo (fase 3): um por pessoa (advogado/despachante), token aleatório
// de 32 bytes mostrado UMA vez (no banco só o hash), validade opcional, revogável.
async function contexto(id: string, exigeEditar: boolean) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return { ok: false as const, res: auth.response };
  const p = await carregarProcesso(auth.session, id);
  if (!p) return { ok: false as const, res: NextResponse.json({ error: "Processo não encontrado." }, { status: 404 }) };
  const editar = !!(await podeEditar(auth.session));
  if (exigeEditar && !editar) return { ok: false as const, res: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { ok: true as const, auth, p, editar };
}

// Validade é um DIA (meia-noite UTC): vale até 23:59:59 de Brasília desse dia.
const FIM_DO_DIA_BRT_MS = 27 * 3_600_000 - 1000;
const urlDoLink = (req: NextRequest, token: string) => `${req.nextUrl.origin}/externo/processo/${token}`;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id, false);
  if (!c.ok) return c.res;
  const [acessos, logs] = await Promise.all([
    prismaSemEscopo.processoAcessoExterno.findMany({
      where: { processoId: c.p.id }, orderBy: { createdAt: "desc" },
      select: { id: true, nome: true, email: true, telefone: true, validoAte: true, revogadoEm: true, revogadoPor: true, documentoIds: true, podeLancar: true, ultimoAcessoEm: true, criadoPor: true, createdAt: true },
    }),
    prismaSemEscopo.processoLog.findMany({ where: { processoId: c.p.id, acao: { startsWith: "EXTERNO_" } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, acao: true, autor: true, detalhe: true, referenciaId: true, createdAt: true } }),
  ]);
  const agora = new Date();
  return NextResponse.json({
    data: acessos.map((a) => ({ ...a, ativo: !a.revogadoEm && (!a.validoAte || a.validoAte > agora) })),
    logs, podeEditar: c.editar,
  });
}

async function docsDoProcesso(processoId: string, ids: unknown): Promise<string[]> {
  const lista = Array.isArray(ids) ? ids.map(String).slice(0, 200) : [];
  if (!lista.length) return [];
  const ok = await prismaSemEscopo.documento.findMany({ where: { id: { in: lista }, processoId }, select: { id: true } });
  return ok.map((d) => d.id);
}

// POST { nome, email?, telefone?, validoAte?, documentoIds?, podeLancar? } → { token, url } (só agora)
export async function POST(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id, true);
  if (!c.ok) return c.res;
  const b = await req.json().catch(() => ({}));
  const nome = textoOuNull(b.nome);
  if (!nome) return NextResponse.json({ error: "Informe o nome de quem vai usar o link." }, { status: 400 });
  if (nome.length > 80) return NextResponse.json({ error: "Nome muito longo (máx. 80)." }, { status: 400 });
  const validoAte = dataOuNull(b.validoAte);
  if (validoAte && validoAte.getTime() + FIM_DO_DIA_BRT_MS < Date.now()) return NextResponse.json({ error: "A validade precisa ser uma data futura." }, { status: 400 });
  const { token, hash } = gerarTokenExterno();
  const a = await prismaSemEscopo.processoAcessoExterno.create({
    data: {
      processoId: c.p.id, nome, email: textoOuNull(b.email), telefone: textoOuNull(b.telefone), tokenHash: hash,
      validoAte: validoAte ? new Date(validoAte.getTime() + FIM_DO_DIA_BRT_MS) : null,
      documentoIds: await docsDoProcesso(c.p.id, b.documentoIds), podeLancar: b.podeLancar !== false, criadoPor: c.auth.session.nome,
    },
    select: { id: true },
  });
  await registrarLog({ processoId: c.p.id, acao: "EXTERNO_LINK_CRIAR", autor: c.auth.session.nome, usuarioId: c.auth.session.sub, referenciaId: a.id, detalhe: nome });
  return NextResponse.json({ data: { id: a.id, token, url: urlDoLink(req, token) } }, { status: 201 });
}

// PATCH { acessoId, documentoIds?, validoAte?, podeLancar?, revogar?, regenerar? }
// regenerar → novo token (o antigo para de funcionar) e devolve a URL nova (só agora).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id, true);
  if (!c.ok) return c.res;
  const b = await req.json().catch(() => ({}));
  const a = await prismaSemEscopo.processoAcessoExterno.findFirst({ where: { id: String(b.acessoId ?? ""), processoId: c.p.id }, select: { id: true, nome: true, revogadoEm: true } });
  if (!a) return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  if (b.revogar) {
    await prismaSemEscopo.processoAcessoExterno.update({ where: { id: a.id }, data: { revogadoEm: new Date(), revogadoPor: c.auth.session.nome } });
    await registrarLog({ processoId: c.p.id, acao: "EXTERNO_LINK_REVOGAR", autor: c.auth.session.nome, usuarioId: c.auth.session.sub, referenciaId: a.id, detalhe: a.nome });
    return NextResponse.json({ ok: true });
  }
  const data: Record<string, unknown> = {};
  if ("documentoIds" in b) data.documentoIds = await docsDoProcesso(c.p.id, b.documentoIds);
  if ("podeLancar" in b) data.podeLancar = !!b.podeLancar;
  if ("validoAte" in b) { const v = dataOuNull(b.validoAte); data.validoAte = v ? new Date(v.getTime() + FIM_DO_DIA_BRT_MS) : null; }
  let novo: { token: string; url: string } | null = null;
  if (b.regenerar) {
    const t = gerarTokenExterno();
    data.tokenHash = t.hash; data.revogadoEm = null; data.revogadoPor = null;
    novo = { token: t.token, url: urlDoLink(req, t.token) };
    await registrarLog({ processoId: c.p.id, acao: "EXTERNO_LINK_CRIAR", autor: c.auth.session.nome, usuarioId: c.auth.session.sub, referenciaId: a.id, detalhe: `${a.nome} (link novo; o anterior deixou de valer)` });
  }
  await prismaSemEscopo.processoAcessoExterno.update({ where: { id: a.id }, data });
  return NextResponse.json({ ok: true, data: novo });
}
