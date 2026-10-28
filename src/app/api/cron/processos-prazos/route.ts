export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { SITUACOES_ABERTAS, pendenciasProcesso, type PendenciaProcesso } from "@/lib/processos";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";
import { sendTelegramDM, escMD } from "@/lib/telegram";

/**
 * Cron diário (dias úteis): um RESUMO por responsável dos processos externos —
 * prazos vencidos/da semana, aguardando a empresa e parados — no sino e no
 * Telegram (docs/processos-prd.md §5). Um aviso por pessoa, não por item.
 * Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hoje = new Date();
  const processos = await prismaSemEscopo.processo.findMany({
    where: { situacao: { in: SITUACOES_ABERTAS } },
    select: {
      id: true, codigo: true, titulo: true, situacao: true, responsavelId: true, diasSemAndamentoAlerta: true, createdAt: true,
      prazos: { where: { status: "PENDENTE" }, select: { descricao: true, vence: true, avisoDias: true, status: true, responsavelId: true } },
      andamentos: { orderBy: { data: "desc" }, take: 1, select: { data: true } },
    },
  });
  // Por responsável (do processo ou do prazo): só o que pede ação (prazos e aguardando a empresa
  // sempre; "parado" entra no resumo, mas sozinho não dispara aviso todo dia).
  const porUsuario = new Map<string, { codigo: string; titulo: string; p: PendenciaProcesso }[]>();
  for (const pr of processos) {
    for (const pend of pendenciasProcesso(pr, hoje)) {
      if (pend.tipo === "SEM_RESPONSAVEL") continue;
      const prazo = pend.tipo.startsWith("PRAZO") ? pr.prazos.find((x) => pend.titulo.endsWith(x.descricao)) : null;
      const dest = prazo?.responsavelId ?? pr.responsavelId;
      if (!dest) continue;
      porUsuario.set(dest, [...(porUsuario.get(dest) ?? []), { codigo: pr.codigo, titulo: pr.titulo, p: pend }]);
    }
  }
  let avisados = 0;
  for (const [usuarioId, itens] of Array.from(porUsuario)) {
    const urgentes = itens.filter((i) => i.p.tipo !== "SEM_ANDAMENTO");
    if (!urgentes.length && hoje.getDay() !== 1) continue; // parados: lembrete só às segundas
    const u = await prismaSemEscopo.usuario.findUnique({ where: { id: usuarioId }, select: { ativo: true, colaborador: { select: { telegramChatId: true } } } });
    if (!u?.ativo) continue;
    const vencidos = itens.filter((i) => i.p.tipo === "PRAZO_VENCIDO").length, breve = itens.filter((i) => i.p.tipo === "PRAZO_VENCE_EM_BREVE").length;
    const titulo = `Processos: ${vencidos ? `${vencidos} prazo(s) vencido(s), ` : ""}${breve ? `${breve} prazo(s) próximo(s), ` : ""}${itens.length} pendência(s)`;
    const linhas = itens.sort((a, b) => (a.p.severidade === "ALTA" ? 0 : 1) - (b.p.severidade === "ALTA" ? 0 : 1)).slice(0, 8).map((i) => `• ${i.codigo} ${i.titulo}: ${i.p.titulo}`);
    const mensagem = linhas.join("\n") + (itens.length > 8 ? `\n… e mais ${itens.length - 8}` : "");
    await marcarNotificacoesLidasPorLink(usuarioId, "/processos", "PROCESSOS_PRAZOS").catch(() => {});
    await notificarUsuario({ usuarioId, tipo: "PROCESSOS_PRAZOS", titulo, mensagem, link: "/processos" }).catch(() => {});
    if (u.colaborador?.telegramChatId) {
      await sendTelegramDM(u.colaborador.telegramChatId, { text: [`⚖️ *${escMD(titulo)}*`, ``, ...linhas.map((l) => escMD(l))].join("\n") }).catch(() => {});
    }
    avisados++;
  }
  return NextResponse.json({ ok: true, processos: processos.length, avisados });
}
