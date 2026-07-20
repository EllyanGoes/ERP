import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, type RequireSessionResult } from "@/lib/auth";

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

/**
 * Guard de Route Handler: exige sessão E acesso ao módulo (mesmo critério do
 * canAccess do front — chave exata, prefixo granular ou "*" de ADMIN).
 *
 * Uso:
 *   const auth = await requireModulo("financeiro");
 *   if (!auth.ok) return auth.response;   // 401 ou 403 padronizado
 */
export async function requireModulo(modulo: string): Promise<RequireSessionResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  if (auth.session.perfil === "ADMIN") return auth;
  const modulos = await getUserModulos(auth.session.sub);
  if (!hasModulo(modulos, modulo)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão para este módulo" }, { status: 403 }),
    };
  }
  return auth;
}

/**
 * Guard "qualquer um destes módulos" — para leituras CRUZADAS entre módulos
 * (ex.: o financeiro abre o Documento de Entrada a partir do Contas a Pagar,
 * a tela de produto mostra as movimentações de estoque). Passa se o usuário
 * tem acesso a PELO MENOS UM dos módulos listados.
 */
export async function requireModuloAny(modulosAceitos: string[]): Promise<RequireSessionResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  if (auth.session.perfil === "ADMIN") return auth;
  const modulos = await getUserModulos(auth.session.sub);
  if (!modulosAceitos.some((m) => hasModulo(modulos, m))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão para este módulo" }, { status: 403 }),
    };
  }
  return auth;
}
