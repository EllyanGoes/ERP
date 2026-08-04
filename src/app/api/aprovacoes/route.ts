export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/aprovacoes?status=PENDENTE&page=1&limit=20
export async function GET(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "PENDENTE"; // PENDENTE | APROVADO | REPROVADO | all
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit  = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
  const skip   = (page - 1) * limit;

  const validStatuses = ["PENDENTE", "APROVADO", "REPROVADO"] as const;
  type AprovStatus = typeof validStatuses[number];
  const statusFilter = validStatuses.includes(status as AprovStatus) ? (status as AprovStatus) : undefined;

  const where = {
    aprovadorId: session.sub,
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.aprovacaoSC.count({ where }),
    prisma.aprovacaoSC.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        necessidade: {
          select: {
            id: true,
            numero: true,
            status: true,
            prioridade: true,
            justificativa: true,
            motivo: true,
            solicitante: true,
            createdAt: true,
            filial: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
            itens: {
              select: {
                quantidade: true,
                unidade: true,
                item: { select: { descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
              },
            },
          },
        },
        cotacao: {
          select: {
            id: true,
            numero: true,
            nome: true,
            createdAt: true,
            necessidade: { select: { numero: true } },
            fornecedores: {
              where: { melhorOpcao: true },
              select: { totalCalculado: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } },
            },
          },
        },
      },
    }),
  ]);

  // Also return the total count of PENDENTE for badge
  const pendingCount = status === "PENDENTE"
    ? total
    : await prisma.aprovacaoSC.count({ where: { aprovadorId: session.sub, status: "PENDENTE" } });

  // solicitadoPor guarda só o id do usuário — resolve os nomes p/ o card
  // mostrar quem encaminhou p/ aprovação.
  const solicitanteIds = Array.from(
    new Set(items.map((i) => i.solicitadoPor).filter((v): v is string => !!v))
  );
  const solicitantes = solicitanteIds.length > 0
    ? await prisma.usuario.findMany({ where: { id: { in: solicitanteIds } }, select: { id: true, nome: true } })
    : [];
  const nomePorId = new Map(solicitantes.map((u) => [u.id, u.nome]));
  const data = items.map((i) => ({
    ...i,
    solicitadoPorNome: i.solicitadoPor ? nomePorId.get(i.solicitadoPor) ?? null : null,
  }));

  return NextResponse.json({ data, total, page, limit, pendingCount });
}
