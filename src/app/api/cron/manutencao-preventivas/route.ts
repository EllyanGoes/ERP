export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { gerarPreventivas } from "@/lib/manutencao/preventivas";
import { notificarUsuario } from "@/lib/notificacoes";

/**
 * Cron diário: gera as OS preventivas vencendo (todas as empresas) e avisa quem
 * tem o módulo PCM. Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await gerarPreventivas();
  if (r.geradas.length) {
    const usuarios = await prismaSemEscopo.usuario.findMany({
      where: { ativo: true, permissoes: { some: { modulo: { startsWith: "pcm" } } } },
      select: { id: true },
    });
    const lista = r.geradas.slice(0, 8).map((g) => `• ${g.numero} ${g.ativo} — ${g.plano}`).join("\n");
    for (const u of usuarios) {
      await notificarUsuario({
        usuarioId: u.id, tipo: "MANUT_PREVENTIVAS",
        titulo: `${r.geradas.length} preventiva(s) gerada(s)`,
        mensagem: lista + (r.geradas.length > 8 ? `\n… e mais ${r.geradas.length - 8}` : ""),
        link: "/pcm/os",
      }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, geradas: r.geradas.length, puladas: r.puladas });
}
