export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { geocodificarEndereco } from "@/lib/geocode";

// Cria um concorrente a partir de um cliente existente (copia os dados, vincula
// clienteId → vira Parceiro). Recusa se o cliente já foi importado.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { clienteId } = await req.json().catch(() => ({ clienteId: null }));
  if (!clienteId) return NextResponse.json({ error: "clienteId é obrigatório" }, { status: 400 });

  const cli = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Já importado? Devolve o concorrente existente.
  const existente = await prisma.concorrente.findFirst({
    where: { clienteId },
    select: { id: true },
  });
  if (existente) {
    return NextResponse.json(
      { error: "Este cliente já está cadastrado como concorrente.", concorrenteId: existente.id },
      { status: 409 },
    );
  }

  // Herda a localização do cliente; se não tiver, geocodifica o endereço.
  let latitude = cli.latitude ?? null;
  let longitude = cli.longitude ?? null;
  if (latitude == null || longitude == null) {
    const geo = await geocodificarEndereco(cli);
    if (geo) { latitude = geo.latitude; longitude = geo.longitude; }
  }

  const concorrente = await prisma.concorrente.create({
    data: {
      clienteId: cli.id,
      tipoPessoa: cli.tipoPessoa,
      razaoSocial: cli.razaoSocial,
      nomeFantasia: cli.nomeFantasia,
      cpfCnpj: cli.cpfCnpj,
      // Cliente atendido pelo grupo que também concorre — por padrão, revendedor.
      ehFornecedor: false,
      ehRevendedor: true,
      email: cli.email,
      telefone: cli.telefone,
      celular: cli.celular,
      cep: cli.cep,
      logradouro: cli.logradouro,
      numero: cli.numero,
      complemento: cli.complemento,
      bairro: cli.bairro,
      cidade: cli.cidade,
      estado: cli.estado,
      latitude,
      longitude,
      geoManual: cli.geoManual ?? false,
      geoReferencia: cli.geoReferencia ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({ data: concorrente }, { status: 201 });
}
