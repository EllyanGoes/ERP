export const dynamic = "force-dynamic";
// Opções de maquineta para o picker de pagamento com cartão (PDV / venda
// balcão): maquinetas ATIVAS da empresa ativa, com a administradora (conta
// tipo CARTAO que recebe o líquido) e as taxas por tipo (crédito/débito).
// GET leve, sem escrita — acessível a quem tem "comercial" OU "financeiro".
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getUserModulos, hasModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    const modulos = await getUserModulos(auth.session.sub);
    if (!hasModulo(modulos, "comercial") && !hasModulo(modulos, "financeiro")) {
      return NextResponse.json({ error: "Sem permissão para este módulo" }, { status: 403 });
    }
  }

  // Maquineta NÃO é modelo escopado pelo proxy — filtra explicitamente pela
  // empresa ativa da sessão.
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const maquinetas = await prisma.maquineta.findMany({
    where: { empresaId, ativo: true, administradora: { ativo: true } },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      administradora: { select: { id: true, nome: true, contaBancariaId: true } },
      taxas: { select: { tipoForma: true, taxaPct: true, diasCompensacao: true } },
    },
  });

  return NextResponse.json({
    data: maquinetas.map((m) => ({
      ...m,
      taxas: m.taxas.map((t) => ({ ...t, taxaPct: Number(t.taxaPct) })),
    })),
  });
}
