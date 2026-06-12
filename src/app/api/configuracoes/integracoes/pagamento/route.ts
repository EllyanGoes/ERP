export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Integração de pagamento (maquininha) por empresa. Restrito a ADMIN — lida com
// credenciais sensíveis das adquirentes. O accessToken nunca volta no GET:
// devolve a máscara quando há valor salvo; o POST ignora a máscara (mantém o
// que está no banco) e só sobrescreve quando o usuário digita um valor novo.
const SECRET_MASK = "••••••••";

const PROVEDORES = ["STONE"] as const;
const AMBIENTES = ["PRODUCAO", "SANDBOX"] as const;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const empresas = await prismaSemEscopo.empresa.findMany({
    where: { ativo: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, razaoSocial: true, nomeFantasia: true },
  });
  const configs = await prismaSemEscopo.integracaoPagamento.findMany({
    where: { empresaId: { in: empresas.map((e) => e.id) } },
  });

  const data = empresas.map((e) => {
    const c = configs.find((x) => x.empresaId === e.id);
    return {
      empresaId: e.id,
      empresaNome: e.nomeFantasia ?? e.razaoSocial,
      provedor: c?.provedor ?? "STONE",
      ambiente: c?.ambiente ?? "PRODUCAO",
      pontoVendaId: c?.pontoVendaId ?? "",
      ativo: c?.ativo ?? false,
      // secret: só sinaliza se há token salvo, sem expor o valor
      accessToken: c?.accessToken ? SECRET_MASK : "",
      temToken: !!c?.accessToken,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const empresaId = String(body.empresaId ?? "");
  if (!empresaId) return NextResponse.json({ error: "Empresa obrigatória" }, { status: 400 });

  const empresa = await prismaSemEscopo.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  const provedor = PROVEDORES.includes(body.provedor) ? body.provedor : "STONE";
  const ambiente = AMBIENTES.includes(body.ambiente) ? body.ambiente : "PRODUCAO";
  const pontoVendaId = body.pontoVendaId?.trim() || null;
  const ativo = Boolean(body.ativo);

  // accessToken: a máscara significa "não mudou"; string vazia limpa; outro
  // valor sobrescreve.
  const tokenRaw: string | undefined = body.accessToken;
  const atualiza: { accessToken?: string | null } = {};
  if (tokenRaw !== undefined && tokenRaw !== SECRET_MASK) {
    atualiza.accessToken = tokenRaw.trim() || null;
  }

  const salvo = await prismaSemEscopo.integracaoPagamento.upsert({
    where: { empresaId_provedor: { empresaId, provedor } },
    create: { empresaId, provedor, ambiente, pontoVendaId, ativo, accessToken: atualiza.accessToken ?? null },
    update: { ambiente, pontoVendaId, ativo, ...atualiza },
  });

  return NextResponse.json({
    data: { empresaId, provedor, ambiente, pontoVendaId: salvo.pontoVendaId ?? "", ativo: salvo.ativo, temToken: !!salvo.accessToken },
  });
}
