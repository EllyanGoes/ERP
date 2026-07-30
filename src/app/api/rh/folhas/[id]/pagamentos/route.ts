export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { pagarItensFolha, RhPagamentoErro } from "@/lib/rh-pagamentos";

// POST /api/rh/folhas/[id]/pagamentos — paga o líquido dos colaboradores
// selecionados (folha FECHADA): baixa parcial no título único + contábil por
// pessoa (D conta do colaborador / C banco).
// Body: { itemIds: string[], dataPagamento: "YYYY-MM-DD", contaBancariaId }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => null);
  const itemIds: string[] = Array.isArray(b?.itemIds) ? b.itemIds.filter((x: unknown) => typeof x === "string") : [];
  const dataPagamento = typeof b?.dataPagamento === "string" ? b.dataPagamento : "";
  const contaBancariaId = typeof b?.contaBancariaId === "string" ? b.contaBancariaId : "";
  if (itemIds.length === 0 || !/^\d{4}-\d{2}-\d{2}/.test(dataPagamento) || !contaBancariaId) {
    return NextResponse.json({ error: "Informe itens, data e conta do pagamento." }, { status: 400 });
  }

  try {
    const r = await pagarItensFolha(params.id, { itemIds, dataPagamento, contaBancariaId });
    return NextResponse.json({ data: r });
  } catch (e) {
    if (e instanceof RhPagamentoErro) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao registrar o pagamento" }, { status: 500 });
  }
}
