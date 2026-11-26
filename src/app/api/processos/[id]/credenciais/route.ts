export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { carregarProcesso, podeEditar, podeVerCredenciais, textoOuNull } from "@/lib/processos";
import { cifrar, cofreConfigurado, decifrar, mascarar } from "@/lib/processos-cofre";
import { registrarLog } from "@/lib/processos-externo";

type Ctx = { params: { id: string } };

// Cofre de acessos do processo (fase 2). Ver/copiar: processos.credenciais.ver; gravar: + processos.lista.editar.
// A listagem NUNCA traz a senha nem o usuário inteiro (só mascarado) — revelar é por /revelar, com log.
async function contexto(id: string) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return { ok: false as const, res: auth.response };
  const p = await carregarProcesso(auth.session, id);
  if (!p) return { ok: false as const, res: NextResponse.json({ error: "Processo não encontrado." }, { status: 404 }) };
  const [ver, editar] = await Promise.all([podeVerCredenciais(auth.session), podeEditar(auth.session)]);
  return { ok: true as const, auth, p, ver: !!ver, editar: !!ver && !!editar };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  const configurado = cofreConfigurado();
  if (!c.ver) return NextResponse.json({ data: [], logs: [], configurado, podeVer: false, podeEditar: false });
  const [creds, logs] = await Promise.all([
    prismaSemEscopo.processoCredencial.findMany({ where: { processoId: c.p.id }, orderBy: { portal: "asc" } }),
    prismaSemEscopo.processoLog.findMany({ where: { processoId: c.p.id, acao: { startsWith: "CREDENCIAL_" } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, acao: true, autor: true, detalhe: true, referenciaId: true, createdAt: true } }),
  ]);
  const data = creds.map((x) => {
    let usuarioMascarado = "••••••";
    if (configurado) { try { usuarioMascarado = mascarar(decifrar(x.usuarioCifrado)); } catch { usuarioMascarado = "(não foi possível decifrar — chave trocada?)"; } }
    return { id: x.id, portal: x.portal, url: x.url, observacao: x.observacao, usuarioMascarado, atualizadoPor: x.atualizadoPor ?? x.criadoPor, updatedAt: x.updatedAt };
  });
  return NextResponse.json({ data, logs, configurado, podeVer: true, podeEditar: c.editar });
}

function validar(b: Record<string, unknown>, novo: boolean): string | null {
  if (novo || "portal" in b) { const portal = textoOuNull(b.portal); if (!portal) return "Informe o portal (ex.: SICARF-AP)."; if (portal.length > 120) return "Nome do portal muito longo."; }
  if (novo && !String(b.usuario ?? "").trim()) return "Informe o usuário/login.";
  if (novo && !String(b.senha ?? "")) return "Informe a senha.";
  if (String(b.senha ?? "").length > 500 || String(b.usuario ?? "").length > 300) return "Usuário ou senha muito longos.";
  const url = textoOuNull(b.url);
  if (url && !/^https?:\/\//i.test(url)) return "O endereço do portal deve começar com http:// ou https://.";
  return null;
}

// POST { portal, url?, usuario, senha, observacao? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão para cadastrar acessos." }, { status: 403 });
  if (!cofreConfigurado()) return NextResponse.json({ error: "Cofre não configurado (PROCESSOS_CRED_KEY)." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const erro = validar(b, true);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const cred = await prismaSemEscopo.processoCredencial.create({
    data: { processoId: c.p.id, portal: textoOuNull(b.portal)!, url: textoOuNull(b.url), observacao: textoOuNull(b.observacao), usuarioCifrado: cifrar(String(b.usuario).trim()), senhaCifrada: cifrar(String(b.senha)), criadoPor: c.auth.session.nome },
    select: { id: true, portal: true },
  });
  await registrarLog({ processoId: c.p.id, acao: "CREDENCIAL_CRIAR", autor: c.auth.session.nome, usuarioId: c.auth.session.sub, referenciaId: cred.id, detalhe: cred.portal });
  return NextResponse.json({ data: { id: cred.id } }, { status: 201 });
}

// PATCH { credencialId, portal?, url?, usuario?, senha? (vazio = mantém), observacao? }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão para alterar acessos." }, { status: 403 });
  if (!cofreConfigurado()) return NextResponse.json({ error: "Cofre não configurado (PROCESSOS_CRED_KEY)." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const erro = validar(b, false);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const atual = await prismaSemEscopo.processoCredencial.findFirst({ where: { id: String(b.credencialId ?? ""), processoId: c.p.id }, select: { id: true, portal: true } });
  if (!atual) return NextResponse.json({ error: "Acesso não encontrado." }, { status: 404 });
  const mudou: string[] = [];
  const data: Record<string, unknown> = { atualizadoPor: c.auth.session.nome };
  if ("portal" in b) { data.portal = textoOuNull(b.portal); mudou.push("portal"); }
  if ("url" in b) { data.url = textoOuNull(b.url); mudou.push("endereço"); }
  if ("observacao" in b) { data.observacao = textoOuNull(b.observacao); mudou.push("observação"); }
  if (String(b.usuario ?? "").trim()) { data.usuarioCifrado = cifrar(String(b.usuario).trim()); mudou.push("usuário"); }
  if (String(b.senha ?? "")) { data.senhaCifrada = cifrar(String(b.senha)); mudou.push("senha"); }
  await prismaSemEscopo.processoCredencial.update({ where: { id: atual.id }, data });
  await registrarLog({ processoId: c.p.id, acao: "CREDENCIAL_EDITAR", autor: c.auth.session.nome, usuarioId: c.auth.session.sub, referenciaId: atual.id, detalhe: `${atual.portal}: ${mudou.join(", ") || "sem mudança"}` });
  return NextResponse.json({ ok: true });
}

// DELETE ?credencialId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const c = await contexto(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão para excluir acessos." }, { status: 403 });
  const atual = await prismaSemEscopo.processoCredencial.findFirst({ where: { id: req.nextUrl.searchParams.get("credencialId") ?? "", processoId: c.p.id }, select: { id: true, portal: true } });
  if (!atual) return NextResponse.json({ error: "Acesso não encontrado." }, { status: 404 });
  await prismaSemEscopo.processoCredencial.delete({ where: { id: atual.id } });
  await registrarLog({ processoId: c.p.id, acao: "CREDENCIAL_EXCLUIR", autor: c.auth.session.nome, usuarioId: c.auth.session.sub, referenciaId: atual.id, detalhe: atual.portal });
  return NextResponse.json({ ok: true });
}
