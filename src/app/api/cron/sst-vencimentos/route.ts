export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { conformidadeEmpresa } from "@/lib/sst";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";
import { sendTelegramDM, escMD } from "@/lib/telegram";

/**
 * Cron diário: recalcula a conformidade SST de cada empresa e avisa os
 * responsáveis (usuários com o módulo sst) sobre pendências CRÍTICAS e ALTAS —
 * sino/toast + Telegram DM (quando o colaborador do usuário tem chat).
 * Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } });
  // Destinatários: usuários com permissão no módulo sst (qualquer recurso) + ADMIN não entra automaticamente.
  const destinatarios = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true, convidado: false, permissoes: { some: { modulo: { startsWith: "sst" } } } },
    select: { id: true, nome: true, colaborador: { select: { telegramChatId: true } }, empresas: { select: { empresaId: true } } },
  });

  const resumo: Record<string, unknown>[] = [];
  for (const emp of empresas) {
    const c = await conformidadeEmpresa(emp.id);
    const criticas = c.pendencias.filter((p) => p.severidade === "CRITICA");
    const altas = c.pendencias.filter((p) => p.severidade === "ALTA");
    resumo.push({ empresa: emp.id, criticas: criticas.length, altas: altas.length, medias: c.porSeveridade.MEDIA });
    if (criticas.length === 0 && altas.length === 0) continue;
    const nomeEmp = emp.nomeFantasia || emp.razaoSocial;
    const titulo = `SST ${nomeEmp}: ${criticas.length} crítica(s), ${altas.length} alta(s)`;
    const topo = [...criticas, ...altas].slice(0, 6).map((p) => `• ${p.colaboradorNome ? `${p.colaboradorNome}: ` : ""}${p.titulo}`);
    const mensagem = topo.join("\n") + (criticas.length + altas.length > 6 ? `\n… e mais ${criticas.length + altas.length - 6}` : "");
    for (const u of destinatarios.filter((d) => d.empresas.some((e) => e.empresaId === emp.id))) {
      await marcarNotificacoesLidasPorLink(u.id, "/sst", "SST_PENDENCIAS").catch(() => {});
      await notificarUsuario({ usuarioId: u.id, tipo: "SST_PENDENCIAS", titulo, mensagem, link: "/sst" }).catch(() => {});
      if (u.colaborador?.telegramChatId) {
        const texto = [`🦺 *${escMD(titulo)}*`, ``, ...topo.map((l) => escMD(l)), ``, `Abra o painel SST para resolver\\.`].join("\n");
        await sendTelegramDM(u.colaborador.telegramChatId, { text: texto }).catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: true, resumo });
}
