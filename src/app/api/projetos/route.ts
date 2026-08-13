export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { registrarAtividade } from "@/lib/projetos";

// GET /api/projetos — home: projetos do usuário (dono/membro) + públicos.
export async function GET() {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const userId = auth.session.sub;
  const isAdmin = auth.session.perfil === "ADMIN";

  const projetos = await prismaSemEscopo.projeto.findMany({
    where: isAdmin
      ? {}
      : {
          OR: [
            { donoId: userId },
            { membros: { some: { usuarioId: userId } } },
            { visibilidade: "PUBLICO" },
          ],
        },
    select: {
      id: true, nome: true, descricao: true, cor: true, icone: true,
      visibilidade: true, status: true, donoId: true, updatedAt: true,
      dono: { select: { id: true, nome: true } },
      membros: { select: { usuarioId: true, favorito: true, papel: true, usuario: { select: { id: true, nome: true } } } },
      _count: { select: { tarefas: { where: { arquivada: false, concluidaEm: null } } } },
      tarefas: {
        where: { arquivada: false, concluidaEm: null, prazo: { lt: new Date() } },
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const data = projetos.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    cor: p.cor,
    icone: p.icone,
    visibilidade: p.visibilidade,
    status: p.status,
    donoId: p.donoId,
    donoNome: p.dono.nome,
    souMembro: p.donoId === userId || p.membros.some((m) => m.usuarioId === userId),
    favorito: p.membros.find((m) => m.usuarioId === userId)?.favorito ?? false,
    membros: p.membros.map((m) => ({ id: m.usuario.id, nome: m.usuario.nome, papel: m.papel })),
    tarefasAbertas: p._count.tarefas,
    tarefasAtrasadas: p.tarefas.length,
    atualizadoEm: p.updatedAt,
  }));

  return NextResponse.json({ data });
}

// POST /api/projetos — cria projeto com colunas padrão; criador vira dono+membro ADMIN.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const body = await req.json();

  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do projeto." }, { status: 400 });

  const membroIds: string[] = Array.isArray(body.membroIds) ? body.membroIds.filter((m: unknown) => typeof m === "string") : [];

  const projeto = await prisma.projeto.create({
    data: {
      nome,
      descricao: body.descricao?.trim() || null,
      cor: body.cor || null,
      icone: body.icone || null,
      visibilidade: body.visibilidade === "PUBLICO" ? "PUBLICO" : "PRIVADO",
      donoId: auth.session.sub,
      colunas: {
        create: [
          { nome: "A fazer", ordem: 1024 },
          { nome: "Em andamento", ordem: 2048 },
          { nome: "Concluído", ordem: 3072, concluiTarefa: true },
        ],
      },
      membros: {
        create: [
          { usuarioId: auth.session.sub, papel: "ADMIN" },
          ...membroIds.filter((id) => id !== auth.session.sub).map((id) => ({ usuarioId: id })),
        ],
      },
    },
    select: { id: true, nome: true },
  });

  await registrarAtividade({ projetoId: projeto.id, autorId: auth.session.sub, tipo: "CRIOU_PROJETO" });
  return NextResponse.json({ data: projeto }, { status: 201 });
}
