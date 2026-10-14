export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { aplicarRenovacoesAutomaticas, encerrarVencidos, resumoContratos } from "@/lib/contratos";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";
import { sendTelegramDM, escMD } from "@/lib/telegram";

/**
 * Cron diário (dias úteis): aplica renovações automáticas vencidas, encerra
 * vigências terminadas sem renovação e manda um digest das pendências CRÍTICAS/
 * ALTAS ao responsável de cada contrato e a quem tem o módulo contratos —
 * sino + Telegram DM. Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const renovados = await aplicarRenovacoesAutomaticas();
  const encerrados = await encerrarVencidos();
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } });
  const usuarios = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true, convidado: false, permissoes: { some: { modulo: { startsWith: "contratos" } } } },
    select: { id: true, nome: true, colaborador: { select: { telegramChatId: true } }, empresas: { select: { empresaId: true } } },
  });
  const resumo: Record<string, unknown>[] = [];
  for (const emp of empresas) {
    const r = await resumoContratos(emp.id);
    const urgentes = r.pendencias.filter((p) => p.severidade === "CRITICA" || p.severidade === "ALTA");
    resumo.push({ empresa: emp.id, criticas: r.porSeveridade.CRITICA, altas: r.porSeveridade.ALTA });
    if (urgentes.length === 0) continue;
    const nomeEmp = emp.nomeFantasia || emp.razaoSocial;
    // Responsáveis dos contratos com pendência urgente também recebem, mesmo sem o módulo.
    const responsaveis = await prismaSemEscopo.contrato.findMany({ where: { id: { in: urgentes.map((p) => p.contratoId) } }, select: { responsavelId: true } });
    const ids = new Set([...usuarios.filter((u) => u.empresas.some((e) => e.empresaId === emp.id)).map((u) => u.id), ...responsaveis.map((r) => r.responsavelId)]);
    const dest = await prismaSemEscopo.usuario.findMany({ where: { id: { in: Array.from(ids) }, ativo: true }, select: { id: true, colaborador: { select: { telegramChatId: true } } } });
    const titulo = `Contratos ${nomeEmp}: ${r.porSeveridade.CRITICA} crítica(s), ${r.porSeveridade.ALTA} alta(s)`;
    const topo = urgentes.slice(0, 6).map((p) => `• ${p.contratoNumero} ${p.contratoTitulo}: ${p.titulo}`);
    const mensagem = topo.join("\n") + (urgentes.length > 6 ? `\n… e mais ${urgentes.length - 6}` : "");
    for (const u of dest) {
      await marcarNotificacoesLidasPorLink(u.id, "/contratos", "CONTRATOS_PENDENCIAS").catch(() => {});
      await notificarUsuario({ usuarioId: u.id, tipo: "CONTRATOS_PENDENCIAS", titulo, mensagem, link: "/contratos" }).catch(() => {});
      if (u.colaborador?.telegramChatId) {
        const texto = [`📄 *${escMD(titulo)}*`, ``, ...topo.map((l) => escMD(l)), ``, `Abra o painel de contratos para decidir\\.`].join("\n");
        await sendTelegramDM(u.colaborador.telegramChatId, { text: texto }).catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: true, renovados, encerrados, resumo });
}
