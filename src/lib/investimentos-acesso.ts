// Allowlist do módulo Investimentos (carteira B3 PESSOAL).
// Por decisão do dono (16/08/2026): só estes e-mails acessam, independente de
// perfil ADMIN ou permissão de módulo — a permissão 'investimentos' sozinha
// NÃO basta. Arquivo isomórfico (sem prisma) p/ uso no Sidebar e nas rotas.
export const INVESTIMENTOS_EMAILS = ["ellyan.goes@gmail.com"];

export function podeAcessarInvestimentos(email?: string | null): boolean {
  return INVESTIMENTOS_EMAILS.includes((email ?? "").trim().toLowerCase());
}
