"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, Store, CalendarClock, HelpCircle, X, Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";
import ModalPortal from "@/components/shared/ModalPortal";

type FormData = {
  clientes: unknown[];
  itens: unknown[];
  itensComodato: { id: string; codigo: string; descricao: string; precoVenda: number }[];
};

/**
 * Botão "+ Novo Pedido" da lista: abre direto o PedidoForm num painel lateral.
 * Não há mais escolha de modalidade — cada pedido define a necessidade de
 * pagamento (à vista/a prazo) e de entrega (retirada/entrega) no formulário.
 */
export default function NovoPedidoButton({ onCreated }: { onCreated: () => void }) {
  const [infoAberto, setInfoAberto] = useState(false);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [dados, setDados] = useState<FormData | null>(null);

  useEffect(() => {
    if (!drawerAberto || dados) return;
    fetch("/api/pedidos-venda/form-data")
      .then((r) => r.json())
      .then((j) => setDados(j.data ?? { clientes: [], itens: [], itensComodato: [] }))
      .catch(() => setDados({ clientes: [], itens: [], itensComodato: [] }));
  }, [drawerAberto, dados]);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setInfoAberto(true)}
          title="Como funcionam os pedidos"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        <Button onClick={() => setDrawerAberto(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Pedido
        </Button>
      </div>

      {infoAberto && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={() => setInfoAberto(false)}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-gray-900">Como funciona um pedido de venda</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Todo pedido define duas necessidades independentes: como será o pagamento e como será a entrega.</p>
                </div>
                <button onClick={() => setInfoAberto(false)} className="ml-4 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Pagamento */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-gray-900">Necessidade de pagamento</span>
                  </div>
                  <ul className="text-[13px] text-gray-600 space-y-1 list-disc pl-5">
                    <li><span className="font-medium text-gray-800">À vista</span>: o cliente paga na hora (no Caixa ou em &quot;Registrar Recebimento&quot;) — o dinheiro entra na conta no momento e a conta a receber já nasce <span className="font-medium">paga</span>.</li>
                    <li><span className="font-medium text-gray-800">A prazo</span>: gera uma <span className="font-medium">conta a receber em aberto</span> — o recebimento fica para o futuro.</li>
                  </ul>
                </div>

                {/* Entrega */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CalendarClock className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900">Necessidade de entrega</span>
                  </div>
                  <ul className="text-[13px] text-gray-600 space-y-1 list-disc pl-5">
                    <li>As duas são feitas por <span className="font-medium">minutas</span> e <span className="font-medium">podem ser parciais</span>; cada minuta marcada como Entregue baixa o estoque.</li>
                    <li><span className="font-medium text-gray-800">Retirada</span>: o cliente retira na loja (minuta de retirada).</li>
                    <li><span className="font-medium text-gray-800">Entrega</span>: levamos ao cliente (minuta de entrega, com motorista/placa).</li>
                    <li>Quando o cliente leva/recebe tudo de uma vez, use o atalho <span className="font-medium">&quot;Entregar tudo agora&quot;</span> no pedido.</li>
                  </ul>
                </div>

                {/* Resumo */}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-[13px] text-gray-700">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium text-gray-800">
                    <Store className="w-4 h-4 text-gray-400" />
                    <span>As duas necessidades são independentes</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    <span>ex.: entrega agendada paga à vista, ou retirada a prazo.</span>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Acompanhe os pedidos pagos que ainda aguardam entrega em <span className="font-medium text-gray-600">Comercial → Saldos</span> (selo <span className="font-medium text-emerald-700">Pago</span>).
                </p>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <CreateDrawer
        open={drawerAberto}
        onOpenChange={(v) => { if (!v) setDrawerAberto(false); }}
        title="Novo Pedido de Venda"
        width="xl"
        onCreated={onCreated}
      >
        {dados === null ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <PedidoForm clientes={dados.clientes as any} itens={dados.itens as any} itensComodato={dados.itensComodato} />
        )}
      </CreateDrawer>
    </>
  );
}
