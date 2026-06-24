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
