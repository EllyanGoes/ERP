export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { novoLinkToken } from "@/lib/manutencao/os-publica";
import { formatarTelefone, mensagemPadraoOS, telefoneValido } from "@/lib/manutencao/whatsapp";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/pcm/os/[id]/link { renovar?, registrarEnvio?: { nome, telefone } }
// Link público da OS (/os/<linkToken>) para mandar por WhatsApp aos mecânicos.
// - gera o token na primeira vez (depois reaproveita o mesmo link);
// - `renovar: true` troca o token — o link antigo para de funcionar na hora;
// - `registrarEnvio` grava o evento ENVIADA_WHATSAPP no histórico da OS.
// Devolve a URL (origem da requisição), o texto padrão da mensagem e os
// colaboradores sugeridos (responsável + membros da equipe da OS).
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  // client com escopo: garante que a OS é da empresa ativa antes de qualquer gravação
  const o = await prisma.manutOrdem.findUnique({
    where: { id },
    select: {
      id: true, numero: true, prioridade: true, descricao: true, programadaPara: true, prazo: true, localTexto: true, linkToken: true,
      responsavelId: true,
      tipo: { select: { nome: true } },
      ativo: { select: { tag: true, nome: true, localizacao: true, pai: { select: { nome: true } } } },
      equipe: { select: { membros: { select: { colaboradorId: true } } } },
    },
  });
  if (!o) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });

  let token = o.linkToken;
  if (!token || b.renovar === true) {
    token = novoLinkToken();
    // sem escopo/autoria: trocar o link não é "editar a OS"
    await prismaSemEscopo.manutOrdem.update({ where: { id: o.id }, data: { linkToken: token } });
  }

  if (b.registrarEnvio && typeof b.registrarEnvio === "object") {
    const nome = String(b.registrarEnvio.nome ?? "").trim().slice(0, 120);
    const telefone = String(b.registrarEnvio.telefone ?? "");
    if (!telefoneValido(telefone)) return NextResponse.json({ error: "Telefone inválido — informe DDD + número." }, { status: 400 });
    const detalhe = `para ${nome ? `${nome} ` : ""}${formatarTelefone(telefone)}`;
    await prismaSemEscopo.manutOrdemEvento.create({ data: { ordemId: o.id, tipo: "ENVIADA_WHATSAPP", detalhe, usuario: auth.session.nome } });
  }

  const url = `${req.nextUrl.origin}/os/${token}`;
  const mensagem = mensagemPadraoOS({
    numero: o.numero, tipoNome: o.tipo.nome, prioridade: o.prioridade,
    ativo: o.ativo ? { tag: o.ativo.tag, nome: o.ativo.nome } : null,
    local: o.ativo ? (o.ativo.localizacao || o.ativo.pai?.nome || null) : o.localTexto,
    descricao: o.descricao,
    programadaPara: o.programadaPara?.toISOString() ?? null,
    prazo: o.prazo?.toISOString() ?? null,
  }, url);
  const sugeridos = Array.from(new Set([o.responsavelId, ...(o.equipe?.membros.map((m) => m.colaboradorId) ?? [])].filter((x): x is string => !!x)));
  return NextResponse.json({ data: { url, numero: o.numero, mensagem, sugeridos } });
}
