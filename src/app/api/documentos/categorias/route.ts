export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { caminhosPastas, ehPastaSistema, slugPasta } from "@/lib/documentos";

// GET — pastas do GED (categorias com hierarquia). Ativas para todos; inativas
// também para ADMIN. Cada pasta vem com caminho ("SST › PGR (NR-01)"), flag de
// sistema e contagens (documentos da empresa ativa + subpastas).
export async function GET() {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const [pastas, porPasta] = await Promise.all([
    prismaSemEscopo.documentoCategoria.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.documento.groupBy({ by: ["categoriaId"], _count: { _all: true } }),
  ]);
  const caminhos = caminhosPastas(pastas);
  const nDocs = new Map(porPasta.map((g) => [g.categoriaId, g._count._all]));
  const visiveis = auth.session.perfil === "ADMIN" ? pastas : pastas.filter((p) => p.ativo);
  const data = visiveis.map((p) => ({
    ...p,
    caminho: caminhos.get(p.id) ?? p.nome,
    sistema: ehPastaSistema(p),
    nDocumentos: nDocs.get(p.id) ?? 0,
    nSubpastas: visiveis.filter((f) => f.paiId === p.id).length,
  }));
  return NextResponse.json({ data });
}

// POST — nova pasta { nome, paiId?, exigeValidade?, diasAlerta? }. Qualquer
// usuário do módulo cria (decisão do dono: pastas da equipe). Subpasta herda
// exigeValidade/diasAlerta da pai como padrão.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return NextResponse.json({ error: "Informe o nome da pasta." }, { status: 400 });
  if (nome.length > 120) return NextResponse.json({ error: "Nome muito longo (máx. 120)." }, { status: 400 });
  const paiId = body.paiId ? String(body.paiId) : null;

  const pai = paiId ? await prismaSemEscopo.documentoCategoria.findUnique({ where: { id: paiId } }) : null;
  if (paiId && !pai) return NextResponse.json({ error: "Pasta de destino não encontrada." }, { status: 400 });

  const irma = await prismaSemEscopo.documentoCategoria.findFirst({
    where: { paiId, nome: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (irma) return NextResponse.json({ error: `Já existe uma pasta "${nome}" aqui.` }, { status: 409 });

  // Slug único (o slug identifica a pasta no Drive/Blob e para os módulos).
  const base = slugPasta(pai ? `${pai.slug}-${nome}` : nome);
  let slug = base;
  for (let i = 2; await prismaSemEscopo.documentoCategoria.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`;
  }

  const ultima = await prismaSemEscopo.documentoCategoria.findFirst({
    where: { paiId }, orderBy: { ordem: "desc" }, select: { ordem: true },
  });
  const pasta = await prismaSemEscopo.documentoCategoria.create({
    data: {
      nome, slug, paiId,
      diasAlerta: body.diasAlerta !== undefined && body.diasAlerta !== "" ? parseInt(String(body.diasAlerta)) || 30 : pai?.diasAlerta ?? 30,
      exigeValidade: body.exigeValidade !== undefined ? !!body.exigeValidade : pai?.exigeValidade ?? false,
      ordem: (ultima?.ordem ?? 0) + 1,
      criadoPorId: auth.session.sub,
    },
  });
  return NextResponse.json({ data: pasta }, { status: 201 });
}
