export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { requireModulo } from "@/lib/permissions"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EMPRESA_PADRAO_ID } from "@/lib/empresa"
import { sincronizarContasColaborador } from "@/lib/conta-contabil"
import { z } from "zod"

const schema = z.object({
  nome: z.string().min(1),
  cpf: z.string().optional().nullable(),
  matricula: z.string().optional().nullable(),
  rg: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  cargo: z.string().optional().nullable(),
  setorId: z.string().optional().nullable(),
  classificacaoCusto: z.enum(["MOD", "MOI", "ADMIN"]).optional().nullable(),
  dataAdmissao: z.string().optional().nullable(),
  dataDemissao: z.string().optional().nullable(),
  filialIds: z.array(z.string()).optional(),
  empresaIds: z.array(z.string()).optional(),
  usuarioId: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
  observacoes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search")?.trim() ?? ""
  const filialId = searchParams.get("filialId")
  const ativo = searchParams.get("ativo")
  // Filtro por empresa: explícita (?empresaId) ou a ativa da sessão (?daEmpresaAtiva=1).
  let empresaId = searchParams.get("empresaId") || null
  if (!empresaId && searchParams.get("daEmpresaAtiva") === "1") {
    const session = await getSession()
    empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID
  }

  const colaboradores = await prisma.colaborador.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { nome: { contains: search, mode: "insensitive" } },
                { cpf: { contains: search, mode: "insensitive" } },
                { cargo: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        filialId ? { filiais: { some: { id: filialId } } } : {},
        empresaId ? { empresas: { some: { id: empresaId } } } : {},
        ativo !== null && ativo !== "" ? { ativo: ativo === "true" } : {},
      ],
    },
    include: {
      filiais: true,
      empresas: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      usuario: { select: { id: true, nome: true, email: true } },
      setor:   { select: { id: true, nome: true } },
    },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json(colaboradores)
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json())
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    )
  }

  try {
    const { dataAdmissao, dataDemissao, filialIds, empresaIds, ...rest } = body.data
    const colaborador = await prisma.colaborador.create({
      data: {
        ...rest,
        cpf: rest.cpf?.trim() || null,
        dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
        dataDemissao: dataDemissao ? new Date(dataDemissao) : null,
        filiais: { connect: filialIds?.map((id) => ({ id })) ?? [] },
        empresas: { connect: empresaIds?.map((id) => ({ id })) ?? [] },
      },
      include: {
        filiais: true,
        empresas: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        usuario: { select: { id: true, nome: true, email: true } },
        setor:   { select: { id: true, nome: true } },
      },
    })
    // Cria a conta contábil do colaborador (Salários a Pagar) nas empresas onde está presente.
    if (empresaIds?.length) await sincronizarContasColaborador(colaborador.id, empresaIds).catch(() => {})
    return NextResponse.json(colaborador, { status: 201 })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "CPF já cadastrado" }, { status: 409 })
    }
    console.error("[POST /api/empresa/colaboradores]", err)
    return NextResponse.json(
      { error: "Erro ao criar colaborador" },
      { status: 500 },
    )
  }
}
