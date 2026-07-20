export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { concorrenteSchema } from "@/lib/validations/concorrente";
import { geocodificarEndereco } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const categoria = searchParams.get("categoria") || undefined; // fornecedor | revendedor | construtora | consumidor-final | parceiro | sem-canais
  const ativo = searchParams.get("ativo");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Recorte de cada filtro de categoria. Parceiro = parceria comercial ativa
  // (flag própria, editável no mapa/cadastro); sem-canais = nenhum canal cadastrado.
  const porCategoria: Record<string, object> = {
    fornecedor: { ehFornecedor: true },
    revendedor: { ehRevendedor: true },
    construtora: { ehConstrutora: true },
    "consumidor-final": { ehConsumidorFinal: true },
    parceiro: { ehParceiro: true },
    "sem-canais": { canais: { none: {} } },
  };

  // Base = busca + ativo, sem o recorte de categoria — é sobre ela que os
  // contadores dos chips são calculados.
  const baseAnd: object[] = [
    q
      ? {
          OR: [
            { razaoSocial: { contains: q, mode: "insensitive" } },
            { nomeFantasia: { contains: q, mode: "insensitive" } },
            { cidade: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    ativo === "false" ? {} : { ativo: true },
  ];
  const where: any = { AND: [...baseAnd, (categoria && porCategoria[categoria]) || {}] };

  const chaves = Object.keys(porCategoria);
  const [data, total, totalBase, ...porChave] = await Promise.all([
    prisma.concorrente.findMany({
      where,
      orderBy: { razaoSocial: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { precos: true, canais: true } } },
    }),
    prisma.concorrente.count({ where }),
    prisma.concorrente.count({ where: { AND: baseAnd } }),
    ...chaves.map((c) => prisma.concorrente.count({ where: { AND: [...baseAnd, porCategoria[c]] } })),
  ]);
  const contadores: Record<string, number> = { "": totalBase };
  chaves.forEach((c, i) => { contadores[c] = porChave[i]; });

  return NextResponse.json({ data, total, page, limit, contadores });
}

export async function POST(req: NextRequest) {
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
  let { latitude, longitude } = d;

  // Geocodifica automaticamente quando o usuário não fixou coordenadas manualmente.
  if (latitude == null || longitude == null) {
    const geo = await geocodificarEndereco(d);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }

  const { contatos, canais, ...escalares } = d;
  const concorrente = await prisma.concorrente.create({
    data: {
      ...escalares,
      email: escalares.email || null,
      cpfCnpj: escalares.cpfCnpj?.trim() || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      contatos: contatos?.length ? {
        create: contatos.filter((ct) => ct.nome?.trim()).map((ct) => ({
          nome: ct.nome.trim(), cargo: ct.cargo || null, telefone: ct.telefone || null, email: ct.email || null,
        })),
      } : undefined,
      canais: canais?.length ? {
        create: canais.filter((cn) => cn.tipo?.trim()).map((cn) => ({
          tipo: cn.tipo, valor: cn.valor || null, observacao: cn.observacao || null,
        })),
      } : undefined,
    },
  });

  return NextResponse.json({ data: concorrente }, { status: 201 });
}
