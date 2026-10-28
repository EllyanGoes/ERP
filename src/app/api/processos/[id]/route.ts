export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { camposProcesso, carregarProcesso, pendenciasProcesso, podeEditar } from "@/lib/processos";

type Ctx = { params: { id: string } };

// GET — processo completo: linha do tempo, prazos, partes, documentos do GED e pendências.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const base = await carregarProcesso(auth.session, params.id);
  if (!base) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const p = await prismaSemEscopo.processo.findUnique({
    where: { id: params.id },
    include: {
      responsavel: { select: { id: true, nome: true } },
      andamentos: { orderBy: [{ data: "desc" }, { createdAt: "desc" }] },
      prazos: { orderBy: [{ status: "asc" }, { vence: "asc" }] },
      partes: { orderBy: { papel: "asc" } },
      documentos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, titulo: true, numero: true, emissao: true, confidencial: true, createdAt: true, categoria: { select: { nome: true } }, versaoVigente: { select: { nome: true, tamanho: true } } },
      },
    },
  });
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  return NextResponse.json({ data: { ...p, pendencias: pendenciasProcesso(p) }, podeEditar: await podeEditar(auth.session) });
}

// PATCH — edita os campos do processo (só as chaves enviadas).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão para editar processos." }, { status: 403 });
  const base = await carregarProcesso(auth.session, params.id);
  if (!base) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const data = camposProcesso(b);
  if ("titulo" in b && !data.titulo) return NextResponse.json({ error: "O título não pode ficar vazio." }, { status: 400 });
  if ("orgao" in b && !data.orgao) return NextResponse.json({ error: "O órgão não pode ficar vazio." }, { status: 400 });
  await prismaSemEscopo.processo.update({ where: { id: params.id }, data: { ...data, atualizadoPor: auth.session.nome } });
  return NextResponse.json({ ok: true });
}

// DELETE — vai para a lixeira (snapshot completo); documentos ficam no GED sem vínculo.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão para excluir processos." }, { status: 403 });
  const base = await carregarProcesso(auth.session, params.id);
  if (!base) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    const snap = await tx.processo.findUnique({ where: { id: params.id }, include: { andamentos: true, prazos: true, partes: true } });
    await salvarNaLixeira(tx, { empresaId: base.empresaId, tipo: "PROCESSO", origemId: base.id, numero: base.codigo, descricao: base.titulo, snapshot: snap, apagadoPor: auth.session.nome });
    await tx.documento.updateMany({ where: { processoId: params.id }, data: { processoId: null } });
    await tx.processo.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}
