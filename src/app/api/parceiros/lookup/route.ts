export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Lookup de parceiro por CPF/CNPJ: dado um documento, diz se já existe um
// Cliente e/ou um Fornecedor com o mesmo número (comparando só os dígitos, já
// que cada cadastro pode ter guardado o doc com ou sem máscara). Usado nos
// formulários de cadastro para oferecer "copiar dados" e evitar redigitação,
// e nas telas de detalhe para o selo "também é cliente/fornecedor".

type Parceiro = {
  id: string;
  tipoPessoa: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  ie: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const raw = req.nextUrl.searchParams.get("cpfCnpj") ?? "";
  // Quem pode ser excluído do resultado (o próprio registro sendo editado).
  const ignoreClienteId    = req.nextUrl.searchParams.get("ignoreClienteId");
  const ignoreFornecedorId = req.nextUrl.searchParams.get("ignoreFornecedorId");

  const digits = raw.replace(/\D/g, "");
  // CPF tem 11, CNPJ 14 dígitos. Abaixo de 11 não vale a pena buscar.
  if (digits.length < 11) {
    return NextResponse.json({ cliente: null, fornecedor: null });
  }

  const COLS = `id, "tipoPessoa"::text AS "tipoPessoa", "razaoSocial", "nomeFantasia",
    "cpfCnpj", ie, email, telefone, celular, cep, logradouro, numero,
    complemento, bairro, cidade, estado`;

  const [clientes, fornecedores] = await Promise.all([
    prisma.$queryRawUnsafe<Parceiro[]>(
      `SELECT ${COLS} FROM "Cliente"
       WHERE regexp_replace(coalesce("cpfCnpj", ''), '\\D', '', 'g') = $1 LIMIT 1`,
      digits,
    ),
    prisma.$queryRawUnsafe<Parceiro[]>(
      `SELECT ${COLS} FROM "Fornecedor"
       WHERE regexp_replace(coalesce("cpfCnpj", ''), '\\D', '', 'g') = $1 LIMIT 1`,
      digits,
    ),
  ]);

  const cliente    = clientes.find((c) => c.id !== ignoreClienteId) ?? null;
  const fornecedor = fornecedores.find((f) => f.id !== ignoreFornecedorId) ?? null;

  return NextResponse.json({ cliente, fornecedor });
}
