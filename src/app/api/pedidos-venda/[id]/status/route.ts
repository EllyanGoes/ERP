export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getItensPendentesEntrega, recomputarStatusPedido } from "@/lib/pedido-totais";
import { gerarContasReceberDoPedido } from "@/lib/contas-receber";
import { contabilizarPedidoVenda } from "@/lib/contabilidade";
import { espelharConfirmacaoVenda, cancelarEspelhoVenda, espelharEntregaTriangular, cancelarEntregaTriangular } from "@/lib/intragrupo";
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

const TRANSITIONS: Record<string, string[]> = {
  ORCAMENTO:      ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO:     ["EM_AGENDAMENTO", "CANCELADO"],
  EM_AGENDAMENTO: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO:      [],
  CANCELADO:      [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Override só para ADMIN. Quando ativo, pula a validação da máquina de estados.
  const override = parsed.data.override === true;
  if (override && auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem forçar o status." }, { status: 403 });
  }

  if (!override) {
    const allowed = TRANSITIONS[pedido.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json({ error: `Transição inválida: ${pedido.status} → ${parsed.data.status}` }, { status: 422 });
    }
  }
  if (pedido.status === parsed.data.status) {
    return NextResponse.json({ data: pedido });
  }

  // Não permite concluir enquanto houver material pendente de entrega
  // (qtd pedida ainda não totalmente coberta por minutas ENTREGUE). A venda à
  // ordem NÃO tem minuta própria — a entrega é feita no pedido de entrega da
  // origem (Tramontin) e a conclusão da venda é automática quando ela entrega;
  // por isso não bloqueia aqui.
  if (parsed.data.status === "CONCLUIDO" && !pedido.estoqueOrigemEmpresaId) {
    const pendentes = await getItensPendentesEntrega(params.id);
    if (pendentes.length > 0) {
      return NextResponse.json(
        {
          error: "Há material pendente de entrega. Conclua as entregas (minutas marcadas como Entregue) antes de finalizar o pedido.",
          pendentes,
        },
        { status: 422 },
      );
    }
  }

  // Nota: movimentações de estoque são geradas pelas Minutas (SAIU_PARA_ENTREGA),
  // não mais pelo status do pedido. Aqui apenas atualizamos o status.
  // Ao CONCLUIR, carimba a data de conclusão: usa a informada (lançamento passado)
  // ou o dia de hoje em Brasília. Gravada como meia-noite UTC (padrão dos campos
  // de data pura). dataEntrega (data de entrega) NÃO é mais usada para isso.
  const updateData: { status: typeof parsed.data.status; dataConclusao?: Date } = { status: parsed.data.status };
  if (parsed.data.status === "CONCLUIDO") {
    const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const dia = parsed.data.dataConclusao || hojeSP;
    updateData.dataConclusao = new Date(`${dia}T00:00:00.000Z`);
  }

  const updated = await prisma.pedidoVenda.update({
    where: { id: params.id },
    data: updateData,
  });

  // Confirmação → gera o contas a receber conforme a CONDIÇÃO DE PAGAMENTO
  // (à vista vence hoje; a prazo no futuro; parcelado em N). Nasce EM ABERTO e
  // é recebido no Caixa/seção Contas a Receber. Não duplica (guarda) e ignora
  // intragrupo. A entrega segue independente, via minutas. A venda à ordem é a
  // "venda oficial" (adquirente → cliente) e gera a receita normalmente; o
  // financeiro da compra simbólica (origem) é tratado em src/lib/venda-ordem.ts.
  if (parsed.data.status === "CONFIRMADO" && !pedido.intragrupo) {
    const valorTotal = parseFloat(pedido.valorTotal.toString());
    const jaTem = await prisma.contaReceber.count({ where: { pedidoVendaId: params.id } });
    if (valorTotal > 0 && jaTem === 0) {
      const condicao = pedido.condicaoPagamentoId
        ? await prisma.condicaoPagamento.findUnique({ where: { id: pedido.condicaoPagamentoId } })
        : (pedido.condicaoPagamento ? await prisma.condicaoPagamento.findFirst({ where: { nome: pedido.condicaoPagamento } }) : null);
      await prisma.$transaction(async (tx) => {
        await gerarContasReceberDoPedido(tx, pedido, condicao);
        await recomputarStatusPedido(tx, params.id);
      });
    }
  }

  // Intragrupo: venda para empresa do grupo gera/cancela a compra espelhada
  if (parsed.data.status === "CONFIRMADO") await espelharConfirmacaoVenda(params.id);
  if (parsed.data.status === "CANCELADO") await cancelarEspelhoVenda(params.id);

  // Venda à ordem (triangular): ao CONFIRMAR, cria o Pedido de Entrega na empresa
  // de origem (Tramontin) — documento próprio de separação/expedição. A baixa
  // real é pela minuta DESSE pedido (uma vez); a compra virtual + financeiro na
  // empresa da venda disparam quando ele entrega. Cancelar zera o pedido de entrega.
  if (parsed.data.status === "CONFIRMADO") await espelharEntregaTriangular(params.id);
  if (parsed.data.status === "CANCELADO") await cancelarEntregaTriangular(params.id);

  // Contabiliza (best-effort, pós-commit) as contas a receber do pedido.
  await contabilizarPedidoVenda(params.id).catch(() => {});

  return NextResponse.json({ data: updated });
}
