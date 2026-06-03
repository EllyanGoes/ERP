import { prisma } from "@/lib/prisma";

// As permissões NÃO ficam no JWT (estouravam o limite de ~4KB do cookie quando o
// usuário tinha muitas permissões granulares). O token carrega só a identidade;
// os módulos são carregados do banco quando necessários.

/** Módulos permitidos de um usuário, lidos do banco. ADMIN → ["*"]. */
export async function getUserModulos(userId: string): Promise<string[]> {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { perfil: true, permissoes: { select: { modulo: true } } },
  });
  if (!user) return [];
  return user.perfil === "ADMIN" ? ["*"] : user.permissoes.map((p) => p.modulo);
}

/** Verifica acesso a um módulo, suportando "*" e chaves granulares ("comercial.clientes.ver"). */
export function hasModulo(modulos: string[], modulo: string): boolean {
  if (modulos.includes("*")) return true;
  return modulos.some((m) => m === modulo || m.startsWith(modulo + "."));
}
