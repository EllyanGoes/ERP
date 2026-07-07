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

  const body = await req.json().catch(() => ({}));
  const clienteId = body.clienteId;
  if (!clienteId) return NextResponse.json({ error: "clienteId é obrigatório" }, { status: 400 });
  // Categorias escolhidas ao mapear; se nenhuma vier, default = revendedor.
  const ehFornecedor = !!body.ehFornecedor;
  const ehRevendedor = !!body.ehRevendedor;
  const ehConstrutora = !!body.ehConstrutora;
  const ehConsumidorFinal = !!body.ehConsumidorFinal;
  const nenhuma = !ehFornecedor && !ehRevendedor && !ehConstrutora && !ehConsumidorFinal;

  const cli = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Já importado? Devolve o concorrente existente.
  const existente = await prisma.concorrente.findFirst({
    where: { clienteId },
    select: { id: true },
  });
  if (existente) {
    return NextResponse.json(
      { error: "Este cliente já está cadastrado como competidor.", concorrenteId: existente.id },
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
      ehParceiro: true, // veio da base de clientes — já fazemos atividade comercial
      tipoPessoa: cli.tipoPessoa,
      razaoSocial: cli.razaoSocial,
      nomeFantasia: cli.nomeFantasia,
      cpfCnpj: cli.cpfCnpj,
      ehFornecedor,
      ehRevendedor: nenhuma ? true : ehRevendedor,
      ehConstrutora,
      ehConsumidorFinal,
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
