import { prismaSemEscopo } from "@/lib/prisma";

// Notificações in-app por usuário (toast estilo macOS no canto superior direito +
// sino). Best-effort: nunca derruba o fluxo de origem.

export type NovaNotificacao = {
  usuarioId: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link?: string | null;
};

/**
 * Marca como lidas as notificações NÃO lidas de um usuário que apontam para um
 * dado link (best-effort). Usado p/ não acumular: quando a cotação é decidida
 * (aprovada/reprovada) ou re-submetida, a pendência antiga sai do não lidas.
 */
export async function marcarNotificacoesLidasPorLink(usuarioId: string, link: string, tipo?: string): Promise<void> {
  if (!usuarioId || !link) return;
  try {
    await prismaSemEscopo.notificacao.updateMany({
      where: { usuarioId, link, lida: false, ...(tipo ? { tipo } : {}) },
      data: { lida: true },
    });
  } catch (e) {
    console.warn("[marcarNotificacoesLidasPorLink] falhou (não bloqueia):", e);
  }
}

/** Cria uma notificação para um usuário (best-effort, não lança). */
export async function notificarUsuario(n: NovaNotificacao): Promise<void> {
  if (!n.usuarioId) return;
  try {
    await prismaSemEscopo.notificacao.create({
      data: {
        usuarioId: n.usuarioId,
        tipo: n.tipo,
        titulo: n.titulo,
        mensagem: n.mensagem,
        link: n.link ?? null,
      },
    });
  } catch (e) {
    console.warn("[notificarUsuario] falhou (não bloqueia):", e);
  }
}
