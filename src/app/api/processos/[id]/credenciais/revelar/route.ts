export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { carregarProcesso, podeVerCredenciais } from "@/lib/processos";
import { cofreConfigurado, decifrar } from "@/lib/processos-cofre";
import { registrarLog, type AcaoLog } from "@/lib/processos-externo";

// POST { credencialId, acao: "VER" | "COPIAR_SENHA" | "COPIAR_USUARIO" } — devolve o valor em claro
// (VER: usuário + senha; COPIAR_*: só o campo) e registra no log do processo quem, quando e qual.
const ACOES: Record<string, AcaoLog> = { VER: "CREDENCIAL_VER", COPIAR_SENHA: "CREDENCIAL_COPIAR_SENHA", COPIAR_USUARIO: "CREDENCIAL_COPIAR_USUARIO" };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  if (!(await podeVerCredenciais(auth.session))) return NextResponse.json({ error: "Sem permissão para ver acessos." }, { status: 403 });
  if (!cofreConfigurado()) return NextResponse.json({ error: "Cofre não configurado (PROCESSOS_CRED_KEY)." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const acao = ACOES[String(b.acao)];
  if (!acao) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const cred = await prismaSemEscopo.processoCredencial.findFirst({ where: { id: String(b.credencialId ?? ""), processoId: p.id } });
  if (!cred) return NextResponse.json({ error: "Acesso não encontrado." }, { status: 404 });
  let usuario: string, senha: string;
  try { usuario = decifrar(cred.usuarioCifrado); senha = decifrar(cred.senhaCifrada); }
  catch { return NextResponse.json({ error: "Não foi possível decifrar este acesso (a chave do cofre mudou?)." }, { status: 500 }); }
  await registrarLog({ processoId: p.id, acao, autor: auth.session.nome, usuarioId: auth.session.sub, referenciaId: cred.id, detalhe: cred.portal });
  const data = acao === "CREDENCIAL_VER" ? { usuario, senha } : acao === "CREDENCIAL_COPIAR_SENHA" ? { senha } : { usuario };
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
