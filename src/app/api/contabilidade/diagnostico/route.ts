export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

// Health-check contábil: aponta contas analíticas com saldo de natureza ERRADA —
// ATIVO/Resultado-devedor com saldo CREDOR (ex.: Clientes a Receber ou Estoque
// negativo) e PASSIVO/Resultado-credor com saldo DEVEDOR. São sinais de
// divergência (recebimento concentrado, edição sem re-contabilizar, valoração de
// estoque, etc.). Saldo = Σ débito − Σ crédito; "anormal" foge da natureza da conta.
type Anormal = {
  id: string; codigo: string; nome: string;
  natureza: "DEVEDORA" | "CREDORA"; grupo: string;
  saldo: number; tipo: "CREDOR" | "DEVEDOR";
};

export async function GET() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const rows = await prisma.$queryRaw<Array<{ id: string; codigo: string; nome: string; natureza: "DEVEDORA" | "CREDORA"; grupo: string; saldo: number }>>`
    SELECT cc.id, cc.codigo, cc.nome, cc.natureza::text AS natureza, cc.grupo::text AS grupo,
           COALESCE(SUM(CASE WHEN p.tipo = 'DEBITO' THEN p.valor ELSE -p.valor END), 0)::float8 AS saldo
    FROM "ContaContabil" cc
    JOIN "PartidaContabil" p ON p."contaId" = cc.id
    WHERE cc."empresaId" = ${empresaId} AND cc.tipo = 'ANALITICA'
    GROUP BY cc.id, cc.codigo, cc.nome, cc.natureza, cc.grupo
    HAVING (cc.natureza = 'DEVEDORA' AND COALESCE(SUM(CASE WHEN p.tipo = 'DEBITO' THEN p.valor ELSE -p.valor END), 0) < -0.01)
        OR (cc.natureza = 'CREDORA' AND COALESCE(SUM(CASE WHEN p.tipo = 'DEBITO' THEN p.valor ELSE -p.valor END), 0) >  0.01)
    ORDER BY cc.codigo
  `;

  const contas: Anormal[] = rows.map((r) => ({
    id: r.id, codigo: r.codigo, nome: r.nome, natureza: r.natureza, grupo: r.grupo,
    saldo: Math.round(r.saldo * 100) / 100,
    tipo: r.natureza === "DEVEDORA" ? "CREDOR" : "DEVEDOR",
  }));

  return NextResponse.json({ contas, total: contas.length });
}
