export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Prisma } from "@prisma/client";

// PATCH /api/admin/empresas/[id] — edita uma empresa do grupo (ADMIN).
// Razão social / nome fantasia / CNPJ são propagados para o Cliente e o
// Fornecedor vinculados (são o "espelho" da empresa no cadastro compartilhado,
// usados pelo intragrupo).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const dados: Record<string, unknown> = {};
  for (const campo of ["razaoSocial", "nomeFantasia", "cnpj", "ie", "slug", "email", "telefone", "cidade", "estado"] as const) {
    if (body[campo] !== undefined) dados[campo] = body[campo] === "" ? null : body[campo];
  }
  if (body.ativo !== undefined) dados.ativo = Boolean(body.ativo);
  if (dados.razaoSocial === null) {
    return NextResponse.json({ error: "Razão social é obrigatória" }, { status: 400 });
  }
  if (dados.cnpj === null) {
    return NextResponse.json({ error: "CNPJ é obrigatório" }, { status: 400 });
  }

  const empresa = await prismaSemEscopo.empresa.findUnique({ where: { id: params.id } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  try {
    const atualizada = await prismaSemEscopo.$transaction(async (tx) => {
      const emp = await tx.empresa.update({ where: { id: params.id }, data: dados as never });

      // Propaga identidade para os cadastros vinculados (intragrupo)
      const espelho = {
        razaoSocial: emp.razaoSocial,
        nomeFantasia: emp.nomeFantasia,
        cpfCnpj: emp.cnpj,
      };
      if (emp.clienteId) {
        await tx.cliente.update({ where: { id: emp.clienteId }, data: espelho });
      }
      if (emp.fornecedorId) {
        await tx.fornecedor.update({ where: { id: emp.fornecedorId }, data: espelho });
      }

      // Sincroniza a filial MATRIZ (espelho automático do cadastro da empresa)
      const matrizDados = {
        razaoSocial: emp.razaoSocial,
        nomeFantasia: emp.nomeFantasia,
        cnpj: emp.cnpj,
        ie: emp.ie,
        email: emp.email,
        telefone: emp.telefone,
        cep: emp.cep,
        logradouro: emp.logradouro,
        numero: emp.numero,
        complemento: emp.complemento,
        bairro: emp.bairro,
        cidade: emp.cidade,
        estado: emp.estado,
      };
      const matriz = await tx.filial.findFirst({ where: { empresaId: emp.id, matriz: true } });
      if (matriz) {
        await tx.filial.update({ where: { id: matriz.id }, data: matrizDados });
      } else {
        await tx.filial.create({
          data: { ...matrizDados, empresaId: emp.id, matriz: true, ativo: true },
        });
      }
      return emp;
    });
    return NextResponse.json({ data: atualizada });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "CNPJ ou slug já usado por outra empresa/cadastro" },
        { status: 409 }
      );
    }
    throw e;
  }
}
