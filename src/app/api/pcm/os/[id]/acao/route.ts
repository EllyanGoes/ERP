export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo, temPermissao } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { ACOES_OS, ACOES_PCM, ErroOS, transicionarOrdem, type AcaoOS } from "@/lib/manutencao/ordem";
import { notificarUsuario } from "@/lib/notificacoes";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/pcm/os/[id]/acao { acao, motivo?, programadaPara?, fimParada? }
// Concluir/devolver/reabrir/cancelar/planejar exigem a permissão de validação do
// PCM (pcm.validacao.editar); o técnico só executa e ENCERRA.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const acao = b.acao as AcaoOS;
  if (!ACOES_OS.includes(acao)) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  // garante que a OS é da empresa ativa antes de usar o client sem escopo
  const os = await prisma.manutOrdem.findUnique({ where: { id }, select: { id: true, numero: true, criadoPor: true } });
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (ACOES_PCM.includes(acao) && !(await temPermissao(auth.session.sub, "pcm.validacao.editar"))) {
    return NextResponse.json({ error: "Só o PCM (permissão Validar OS) pode fazer isso." }, { status: 403 });
  }
  try {
    const status = await transicionarOrdem(id, acao, {
      usuario: auth.session.nome,
      motivo: b.motivo,
      programadaPara: b.programadaPara ? new Date(b.programadaPara) : null,
      fimParada: b.fimParada ? new Date(b.fimParada) : null,
    }, prismaSemEscopo);
    if (acao === "encerrar") await avisarValidadores(id, os.numero, auth.session.sub);
    return NextResponse.json({ data: { status } });
  } catch (e) {
    if (e instanceof ErroOS) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** OS encerrada pelo técnico → avisa quem valida (permissão pcm.validacao ou módulo pcm inteiro). */
async function avisarValidadores(ordemId: string, numero: string, exceto: string) {
  const usuarios = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true, id: { not: exceto }, OR: [{ permissoes: { some: { modulo: { in: ["pcm", "pcm.validacao", "pcm.validacao.editar"] } } } }] },
    select: { id: true },
  });
  for (const u of usuarios) {
    await notificarUsuario({ usuarioId: u.id, tipo: "MANUT_OS_ENCERRADA", titulo: `${numero} encerrada`, mensagem: "O técnico encerrou a OS. Confira e conclua.", link: `/pcm/os/${ordemId}` });
  }
}
