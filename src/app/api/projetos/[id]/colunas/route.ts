export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeGerenciarProjeto, ORDEM_GAP } from "@/lib/projetos";

// POST /api/projetos/[id]/colunas — nova coluna no fim do quadro.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) {
    return NextResponse.json({ error: "Apenas dono/administradores gerenciam colunas." }, { status: 403 });
  }

  const body = await req.json();
  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da coluna." }, { status: 400 });

  const ultima = await prismaSemEscopo.projetoColuna.findFirst({
    where: { projetoId: params.id },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const coluna = await prisma.projetoColuna.create({
    data: {
      projetoId: params.id,
      nome,
      cor: body.cor || null,
      concluiTarefa: !!body.concluiTarefa,
      ordem: (ultima?.ordem ?? 0) + ORDEM_GAP,
    },
  });
  return NextResponse.json({ data: coluna }, { status: 201 });
}

// PATCH /api/projetos/[id]/colunas — reordena: { ordem: [colunaId, ...] }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) {
    return NextResponse.json({ error: "Apenas dono/administradores gerenciam colunas." }, { status: 403 });
  }

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ordem) ? body.ordem : [];
  if (ids.length === 0) return NextResponse.json({ error: "Ordem vazia." }, { status: 400 });

  await prismaSemEscopo.$transaction(
    ids.map((id, i) =>
      prismaSemEscopo.projetoColuna.updateMany({
        where: { id, projetoId: params.id },
        data: { ordem: (i + 1) * ORDEM_GAP },
      }),
    ),
  );
  return NextResponse.json({ ok: true });
}
