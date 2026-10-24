export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { criarOrdem, ErroOS } from "@/lib/manutencao/ordem";
import { notificarUsuario } from "@/lib/notificacoes";

type Ctx = { params: Promise<{ id: string }> };

// POST — triagem da SS pelo PCM:
//   { acao: "converter", ativoId, tipoId, descricao?, prioridade?, equipeId?, responsavelId?, programadaPara?, prazo? }
//   { acao: "anexar", ordemId }      (duplicada de uma OS aberta)
//   { acao: "recusar", motivo }
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const ss = await prisma.manutSolicitacao.findUnique({ where: { id } });
  if (!ss) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (ss.status !== "ABERTA") return NextResponse.json({ error: "Solicitação já triada." }, { status: 422 });
  const b = await req.json().catch(() => ({}));
  const triagem = { triadoPor: auth.session.nome, triadoEm: new Date() };
  let aviso = "";
  let ordemId: string | null = null;

  if (b.acao === "converter") {
    const ativoId = b.ativoId || ss.ativoId;
    if (!ativoId) return NextResponse.json({ error: "Escolha o ativo da OS." }, { status: 400 });
    if (!b.tipoId) return NextResponse.json({ error: "Escolha o tipo de manutenção." }, { status: 400 });
    try {
      const ordem = await criarOrdem({
        empresaId: ss.empresaId, ativoId, tipoId: b.tipoId,
        descricao: String(b.descricao ?? "").trim() || ss.descricao,
        prioridade: b.prioridade || ss.prioridade, equipeId: b.equipeId, responsavelId: b.responsavelId,
        programadaPara: b.programadaPara ? new Date(b.programadaPara) : null, prazo: b.prazo ? new Date(b.prazo) : null,
        paradaInicio: ss.ativoParado ? ss.paradoDesde ?? ss.createdAt : null,
        usuario: auth.session.nome, origem: `${ss.numero} de ${ss.solicitanteNome ?? "—"}`,
      }, prismaSemEscopo);
      ordemId = ordem.id;
      await prismaSemEscopo.manutSolicitacao.update({ where: { id }, data: { status: "CONVERTIDA", ordemId, ativoId, ...triagem } });
      aviso = `virou a ${ordem.numero}`;
    } catch (e) {
      if (e instanceof ErroOS) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  } else if (b.acao === "anexar") {
    const os = await prisma.manutOrdem.findUnique({ where: { id: b.ordemId ?? "" }, select: { id: true, numero: true, status: true } });
    if (!os || ["CONCLUIDA", "CANCELADA"].includes(os.status)) return NextResponse.json({ error: "Escolha uma OS em aberto." }, { status: 400 });
    ordemId = os.id;
    await prismaSemEscopo.manutSolicitacao.update({ where: { id }, data: { status: "ANEXADA", ordemId, ...triagem } });
    await prismaSemEscopo.manutOrdemEvento.create({ data: { ordemId, tipo: "SS_ANEXADA", detalhe: `${ss.numero} de ${ss.solicitanteNome ?? "—"}`, usuario: auth.session.nome } });
    aviso = `foi anexada à ${os.numero} (já em andamento)`;
  } else if (b.acao === "recusar") {
    const motivo = String(b.motivo ?? "").trim();
    if (!motivo) return NextResponse.json({ error: "Informe o motivo da recusa." }, { status: 400 });
    await prismaSemEscopo.manutSolicitacao.update({ where: { id }, data: { status: "RECUSADA", motivoRecusa: motivo, ...triagem } });
    aviso = `foi recusada: ${motivo}`;
  } else {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  if (ss.solicitanteId && ss.solicitanteId !== auth.session.sub) {
    await notificarUsuario({ usuarioId: ss.solicitanteId, tipo: "MANUT_SS_TRIADA", titulo: `Sua ${ss.numero} ${aviso}`, mensagem: ss.descricao.slice(0, 160), link: "/pcm/solicitacoes" });
  }
  return NextResponse.json({ data: { ordemId } });
}
