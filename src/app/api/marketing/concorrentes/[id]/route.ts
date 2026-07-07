export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { concorrenteSchema } from "@/lib/validations/concorrente";
import { geocodificarEndereco } from "@/lib/geocode";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const concorrente = await prisma.concorrente.findUnique({
    where: { id: params.id },
    include: {
      precos: {
        orderBy: [{ produtoNome: "asc" }, { dataColeta: "desc" }],
        include: { item: { select: { id: true, codigo: true, descricao: true, precoVenda: true } } },
      },
      contatos: { orderBy: { createdAt: "asc" } },
      canais: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!concorrente) return NextResponse.json({ error: "Competidor não encontrado" }, { status: 404 });
  return NextResponse.json({ data: concorrente });
}

// Atualização pontual (sem o payload completo do PUT). Hoje só a parceria
// comercial — usada pelo balão do mapa e pelo cabeçalho do cadastro.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  if (typeof body.ehParceiro !== "boolean") {
    return NextResponse.json({ error: "ehParceiro (boolean) é obrigatório" }, { status: 400 });
  }

  const existe = await prisma.concorrente.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Competidor não encontrado" }, { status: 404 });

  const concorrente = await prisma.concorrente.update({
    where: { id: params.id },
    data: { ehParceiro: body.ehParceiro },
    select: { id: true, ehParceiro: true },
  });
  return NextResponse.json({ data: concorrente });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = concorrenteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;

  const existente = await prisma.concorrente.findUnique({
    where: { id: params.id },
    select: { latitude: true, longitude: true, geoManual: true },
  });

  let latitude = d.latitude ?? null;
  let longitude = d.longitude ?? null;
  let geoManual = existente?.geoManual ?? false;

  if (geoManual && existente?.latitude != null && existente?.longitude != null) {
    // Coordenadas fixadas manualmente — preserva (não re-geocodifica).
    latitude = existente.latitude;
    longitude = existente.longitude;
  } else if (latitude == null || longitude == null) {
    // Modo automático: recalcula pelo endereço atual.
    const geo = await geocodificarEndereco(d);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
    geoManual = false;
  }

  // Contatos e canais são relações — fora do update direto; substitui em lote.
  const { contatos, canais, ...escalares } = d;

  const concorrente = await prisma.$transaction(async (tx) => {
    const c = await tx.concorrente.update({
      where: { id: params.id },
      data: {
        ...escalares,
        email: escalares.email || null,
        cpfCnpj: escalares.cpfCnpj?.trim() || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        geoManual,
      },
    });
    if (contatos !== undefined) {
      await tx.concorrenteContato.deleteMany({ where: { concorrenteId: params.id } });
      if (contatos.length) await tx.concorrenteContato.createMany({
        data: contatos.filter((ct) => ct.nome?.trim()).map((ct) => ({
          concorrenteId: params.id, empresaId: c.empresaId,
          nome: ct.nome.trim(), cargo: ct.cargo || null, telefone: ct.telefone || null, email: ct.email || null,
        })),
      });
    }
    if (canais !== undefined) {
      await tx.concorrenteCanal.deleteMany({ where: { concorrenteId: params.id } });
      if (canais.length) await tx.concorrenteCanal.createMany({
        data: canais.filter((cn) => cn.tipo?.trim()).map((cn) => ({
          concorrenteId: params.id, empresaId: c.empresaId,
          tipo: cn.tipo, valor: cn.valor || null, observacao: cn.observacao || null,
        })),
      });
    }
    return c;
  });

  return NextResponse.json({ data: concorrente });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  // Soft delete (mantém histórico de preços coletados).
  await prisma.concorrente.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { ok: true } });
}
