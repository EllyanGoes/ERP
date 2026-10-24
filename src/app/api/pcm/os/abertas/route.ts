export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";

// GET /api/pcm/os/abertas — OS em aberto da empresa ativa, para quem requisita
// material escolher para qual OS ele vai (formulário de requisição). Leitura
// cruzada: Manutenção, Compras e Almoxarifado.
export async function GET() {
  const auth = await requireModuloAny(["pcm", "compras", "almoxarifado"]);
  if (!auth.ok) return auth.response;
  const data = await prisma.manutOrdem.findMany({
    where: { status: { in: STATUS_ABERTOS.filter((s) => s !== "ENCERRADA") } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, numero: true, descricao: true, status: true, centroCustoId: true,
      ativo: { select: { tag: true, nome: true } }, equipe: { select: { nome: true } },
    },
  });
  return NextResponse.json({ data });
}
