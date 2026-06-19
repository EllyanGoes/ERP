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
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-info hover:border-info/30 hover:bg-info/10 transition-colors"
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
            <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-4 border-b border-border">
                <div>
                  <h3 className="font-bold text-foreground">Como funciona um pedido de venda</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Todo pedido define duas necessidades independentes: como será o pagamento e como será a entrega.</p>
                </div>
                <button onClick={() => setInfoAberto(false)} className="ml-4 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-muted-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Pagamento */}
                <div className="rounded-xl border border-success/30 bg-success/10 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Wallet className="w-5 h-5 text-success" />
                    <span className="font-semibold text-foreground">Necessidade de pagamento</span>
                  </div>
                  <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
                    <li><span className="font-medium text-foreground">À vista</span>: o cliente paga na hora (no Caixa ou em &quot;Registrar Recebimento&quot;) — o dinheiro entra na conta no momento e a conta a receber já nasce <span className="font-medium">paga</span>.</li>
                    <li><span className="font-medium text-foreground">A prazo</span>: gera uma <span className="font-medium">conta a receber em aberto</span> — o recebimento fica para o futuro.</li>
                  </ul>
                </div>

                {/* Entrega */}
                <div className="rounded-xl border border-info/30 bg-info/10 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CalendarClock className="w-5 h-5 text-info" />
                    <span className="font-semibold text-foreground">Forma de entrega</span>
                  </div>
                  <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
                    <li><span className="font-medium text-foreground">Cliente retirar tudo</span>: após o pagamento no caixa, o sistema gera uma minuta com a <span className="font-medium">baixa total do estoque</span> e conclui.</li>
                    <li><span className="font-medium text-foreground">Controle por minutas manuais</span>: após o pagamento, o vendedor cria as <span className="font-medium">minutas manualmente</span> (pode ser parcial) para controlar o saldo a entregar do cliente.</li>
                    <li>O status fica <span className="font-medium">Pendente/Parcial</span> enquanto houver saldo a entregar e volta automaticamente se uma minuta for editada.</li>
                  </ul>
                </div>

                {/* Resumo */}
                <div className="rounded-xl bg-muted border border-border p-4 text-[13px] text-foreground">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                    <Store className="w-4 h-4 text-muted-foreground" />
                    <span>As duas necessidades são independentes</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>ex.: entrega agendada paga à vista, ou retirada a prazo.</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Acompanhe os pedidos pagos que ainda aguardam entrega em <span className="font-medium text-muted-foreground">Comercial → Saldos</span> (selo <span className="font-medium text-success">Pago</span>).
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
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <PedidoForm clientes={dados.clientes as any} itens={dados.itens as any} itensComodato={dados.itensComodato} />
        )}
      </CreateDrawer>
    </>
  );
}
