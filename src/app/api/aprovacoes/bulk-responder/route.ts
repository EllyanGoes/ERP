export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendWAMessage } from "@/lib/whatsapp";

// POST /api/aprovacoes/bulk-responder
// Body: { ids: string[], acao: "APROVAR" | "REPROVAR", observacao?: string }
// Returns: { results: { id, status, error? }[] }

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[]                      = Array.isArray(body.ids) ? body.ids : [];
  const acao: "APROVAR" | "REPROVAR"       = body.acao;
  const observacao: string | undefined     = body.observacao;

  if (!ids.length)                     return NextResponse.json({ error: "Nenhum id informado" }, { status: 400 });
  if (acao !== "APROVAR" && acao !== "REPROVAR") return NextResponse.json({ error: "acao inválida" }, { status: 400 });

  const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";

  // Process each one, collecting results (non-throwing per item)
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const aprovacao = await prisma.aprovacaoSC.findUnique({
          where: { id },
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

        if (!aprovacao)                   return { id, status: "error", error: "Não encontrada" };
        if (aprovacao.aprovadorId !== session.sub && session.perfil !== "ADMIN")
                                          return { id, status: "error", error: "Sem permissão" };
        if (aprovacao.status !== "PENDENTE") return { id, status: "skip",  error: "Já respondida" };

        await prisma.aprovacaoSC.update({
          where: { id },
          data: { status: novoStatus, observacao: observacao ?? null, respondidoEm: new Date() },
        });

        const sc = aprovacao.necessidade;

        if (novoStatus === "REPROVADO") {
          await prisma.necessidadeCompra.update({
            where: { id: sc.id },
            data: {
              status: "REJEITADA",
              motivoReprovacao: observacao
                ? `Reprovado por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem}): ${observacao}`
                : `Reprovado por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem})`,
            },
          });
        } else {
          // Próxima etapa?
          const proxEtapa = await prisma.aprovacaoEtapa.findFirst({
            where: {
              ordem: { gt: aprovacao.etapaOrdem },
              ...(aprovacao.fluxoId ? { fluxoId: aprovacao.fluxoId } : { fluxo: { ativo: true } }),
            },
            include: { aprovador: true, colaborador: true },
            orderBy: { ordem: "asc" },
          });

          if (proxEtapa) {
            const proxColaborador = proxEtapa.colaborador;
            let proxTelefone = proxColaborador?.telefone ?? proxEtapa.aprovador?.telefone ?? null;
            if (!proxTelefone && proxColaborador?.usuarioId) {
              const u = await prisma.usuario.findUnique({ where: { id: proxColaborador.usuarioId }, select: { telefone: true } });
              proxTelefone = u?.telefone ?? null;
            }
            const proxAprovadorId = proxColaborador?.usuarioId ?? proxEtapa.aprovadorId ?? null;

            if (proxAprovadorId) {
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

              if (proxTelefone) {
                try {
                  const rawPhone = proxTelefone.replace(/\D/g, "");
                  const phone    = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
                  const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
                  const linhasItens = sc.itens.map((it, i) => {
                    const qtd = parseFloat(String(it.quantidade ?? 0));
                    const un  = (it as { unidade?: string | null }).unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
                    return `  ${i + 1}. ${it.item.descricao} — ${qtd.toLocaleString("pt-BR")} ${un}`;
                  });
                  const waResult = await sendWAMessage({
                    to: phone,
                    body: [
                      `*Ordem de Compras Nº ${sc.numero}*`, ``,
                      `• *Filial:* ${filialNome}`,
                      `• *Etapa:* ${proxEtapa.nome ?? `Etapa ${proxEtapa.ordem}`}`, ``,
                      `*Itens (${sc.itens.length}):*`, ...linhasItens, ``,
                      `Responda com um dos botões abaixo:`,
                    ].join("\n"),
                    buttons: [
                      { id: `sc_APPROVE_${nova.id}`, title: "✅ Aprovar" },
                      { id: `sc_REJECT_${nova.id}`,  title: "❌ Reprovar" },
                      { id: `sc_VIEW_${nova.id}`,    title: "🔍 Detalhes" },
                    ],
                  });
                  await prisma.aprovacaoSC.update({ where: { id: nova.id }, data: { waMsgId: waResult.msgId } });
                } catch { /* WA não-bloqueante */ }
              }
            }
          } else {
            // Última etapa → SC aprovada
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

        return { id, status: "ok" };
      } catch (err) {
        return { id, status: "error", error: err instanceof Error ? err.message : "Erro interno" };
      }
    })
  );

  const ok    = results.filter((r) => r.status === "ok").length;
  const erros = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, ok, erros });
}
