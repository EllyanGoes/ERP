export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendWAMessage } from "@/lib/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const acao: "APROVAR" | "REPROVAR" = body.acao;
    const observacao: string | undefined = body.observacao;

    if (acao !== "APROVAR" && acao !== "REPROVAR") {
      return NextResponse.json({ error: "acao deve ser APROVAR ou REPROVAR" }, { status: 400 });
    }

    // ── Find aprovacao ─────────────────────────────────────────────────────────
    const aprovacao = await prisma.aprovacaoSC.findUnique({
      where: { id: params.id },
      include: {
        aprovador: true,
        necessidade: {
          include: {
            filial: true,
            itens: {
              include: {
                item: { select: { descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
              },
            },
          },
        },
        fluxo: true,
      },
    });

    if (!aprovacao) {
      return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });
    }

    // Only the assigned approver (or an admin) can respond
    if (aprovacao.aprovadorId !== session.sub && session.perfil !== "ADMIN") {
      return NextResponse.json({ error: "Você não tem permissão para responder esta aprovação" }, { status: 403 });
    }

    if (aprovacao.status !== "PENDENTE") {
      return NextResponse.json({ error: "Esta aprovação já foi respondida" }, { status: 400 });
    }

    const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";

    // ── Update AprovacaoSC ─────────────────────────────────────────────────────
    await prisma.aprovacaoSC.update({
      where: { id: aprovacao.id },
      data: {
        status: novoStatus,
        observacao: observacao ?? null,
        respondidoEm: new Date(),
      },
    });

    const sc = aprovacao.necessidade;

    if (novoStatus === "REPROVADO") {
      // ── Reprovar SC ──────────────────────────────────────────────────────────
      await prisma.necessidadeCompra.update({
        where: { id: sc.id },
        data: {
          status: "REPROVADA",
          motivoReprovacao: observacao
            ? `Reprovado por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem}): ${observacao}`
            : `Reprovado por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem})`,
        },
      });
    } else {
      // ── Aprovado — verificar próxima etapa ───────────────────────────────────
      const proxEtapa = await prisma.aprovacaoEtapa.findFirst({
        where: {
          ordem: { gt: aprovacao.etapaOrdem },
          ...(aprovacao.fluxoId
            ? { fluxoId: aprovacao.fluxoId }
            : { fluxo: { ativo: true } }),
        },
        include: { aprovador: true, colaborador: true },
        orderBy: { ordem: "asc" },
      });

      if (proxEtapa) {
        // Resolve phone and user for next etapa
        const proxColaborador = proxEtapa.colaborador;
        let proxTelefone = proxColaborador?.telefone ?? proxEtapa.aprovador?.telefone ?? null;
        if (!proxTelefone && proxColaborador?.usuarioId) {
          const u = await prisma.usuario.findUnique({ where: { id: proxColaborador.usuarioId }, select: { telefone: true } });
          proxTelefone = u?.telefone ?? null;
        }
        const proxAprovadorId = proxColaborador?.usuarioId ?? proxEtapa.aprovadorId ?? null;

        if (proxAprovadorId) {
          // Remover pendentes anteriores do mesmo aprovador nesta SC
          await prisma.aprovacaoSC.deleteMany({
            where: { necessidadeId: sc.id, aprovadorId: proxAprovadorId, status: "PENDENTE" },
          });

          const nova = await prisma.aprovacaoSC.create({
            data: {
              necessidadeId: sc.id,
              fluxoId: aprovacao.fluxoId,
              etapaOrdem: proxEtapa.ordem,
              etapaNome: proxEtapa.nome ?? null,
              aprovadorId: proxAprovadorId,
              status: "PENDENTE",
            },
          });

          // Try to send WA if phone configured (non-blocking)
          if (proxTelefone) {
            try {
              const rawPhone = proxTelefone.replace(/\D/g, "");
              const phone    = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
              const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
              const linhasItens = sc.itens.map((it, i) => {
                const qtd = parseFloat(String(it.quantidade ?? 0));
                const un  = (it as { unidade?: string | null }).unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
                return `  ${i + 1}. ${it.item.descricao} — ${qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${un}`;
              });

              const msgBody = [
                `*Ordem de Compras Nº ${sc.numero}*`,
                ``,
                `• *Filial:* ${filialNome}`,
                `• *Solicitado por:* ${sc.solicitante ?? "—"}`,
                `• *Etapa:* ${proxEtapa.nome ?? `Etapa ${proxEtapa.ordem}`}`,
                ``,
                `*Itens (${sc.itens.length}):*`,
                ...linhasItens,
                ``,
                `Responda com um dos botões abaixo:`,
              ].join("\n");

              const waResult = await sendWAMessage({
                to: phone,
                body: msgBody,
                buttons: [
                  { id: `sc_APPROVE_${nova.id}`, title: "✅ Aprovar" },
                  { id: `sc_REJECT_${nova.id}`,  title: "❌ Reprovar" },
                  { id: `sc_VIEW_${nova.id}`,    title: "🔍 Detalhes" },
                ],
              });

              await prisma.aprovacaoSC.update({
                where: { id: nova.id },
                data: { waMsgId: waResult.msgId },
              });
            } catch (waErr) {
              console.warn("[responder] WA send failed for next etapa:", waErr);
              // Non-blocking — don't fail the whole request
            }
          }
        }
      } else {
        // Última etapa aprovada → SC aprovada
        await prisma.necessidadeCompra.update({
          where: { id: sc.id },
          data: {
            status: "APROVADA",
            aprovadoPor: aprovacao.aprovador.nome,
            dataAprovacao: new Date().toISOString(),
          },
        });
      }
    }

    return NextResponse.json({ ok: true, status: novoStatus });
  } catch (err) {
    console.error("[POST responder]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
