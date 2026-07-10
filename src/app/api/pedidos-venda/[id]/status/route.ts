export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { mudarStatusPedidoVenda } from "@/lib/pedido-venda-status";
import { z } from "zod";

const schema = z.object({
  // ORCAMENTO só é alcançável via override de admin (reverter cancelamento, etc.).
  status: z.enum(["ORCAMENTO","CONFIRMADO","EM_AGENDAMENTO","CONCLUIDO","CANCELADO"]),
  // Data de conclusão (só usada ao concluir). Ausente → carimba o dia de hoje.
  dataConclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // Override de admin: ignora a máquina de transições (ex.: reverter um pedido
  // cancelado por engano para outro status). Exige perfil ADMIN.
  override: z.boolean().optional(),
});

// Nota: a máquina de transições, a reversão do cancelamento e os espelhos
// intragrupo/triangular vivem em src/lib/pedido-venda-status.ts — compartilhados
// com o PATCH /api/pedidos-venda/[id]. O contas a receber nasce na CONFIRMAÇÃO,
// pelo valor total e condição de pagamento do pedido (faturarPedido).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const r = await mudarStatusPedidoVenda({
    pedidoVendaId: params.id,
    novoStatus: parsed.data.status,
    perfil: auth.session.perfil,
    override: parsed.data.override === true,
    dataConclusao: parsed.data.dataConclusao ?? null,
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, ...(r.pendentes ? { pendentes: r.pendentes } : {}) },
      { status: r.status },
    );
  }
  return NextResponse.json({ data: r.data });
}
