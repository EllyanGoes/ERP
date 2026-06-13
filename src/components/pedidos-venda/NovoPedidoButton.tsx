"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Loader2, ChevronDown, Store, CalendarClock, HelpCircle, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";
import ModalPortal from "@/components/shared/ModalPortal";

type FormData = {
  clientes: unknown[];
  itens: unknown[];
  itensComodato: { id: string; codigo: string; descricao: string; precoVenda: number }[];
};

type Modalidade = "BALCAO" | "AGENDADA";

const TITULOS: Record<Modalidade, string> = {
  BALCAO: "Novo Pedido — Balcão",
  AGENDADA: "Novo Pedido — Venda Agendada",
};

/**
 * Botão "+ Novo Pedido" da lista: dropdown para escolher a modalidade —
 * Balcão (retirada na loja, pago no caixa) ou Venda Agendada (entrega via
 * minutas). Abre o PedidoForm num painel lateral com a modalidade definida.
 */
export default function NovoPedidoButton({ onCreated }: { onCreated: () => void }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [infoAberto, setInfoAberto] = useState(false);
  const [drawer, setDrawer] = useState<Modalidade | null>(null);
  const [dados, setDados] = useState<FormData | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [menuAberto]);

  useEffect(() => {
    if (!drawer || dados) return;
    fetch("/api/pedidos-venda/form-data")
      .then((r) => r.json())
      .then((j) => setDados(j.data ?? { clientes: [], itens: [], itensComodato: [] }))
      .catch(() => setDados({ clientes: [], itens: [], itensComodato: [] }));
  }, [drawer, dados]);

  function abrir(modalidade: Modalidade) {
    setMenuAberto(false);
    setDrawer(modalidade);
  }

  return (
    <>
      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setInfoAberto(true)}
        title="Como funcionam os tipos de pedido"
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
      <div ref={ref} className="relative">
        <Button onClick={() => setMenuAberto((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Pedido
          <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-80" />
        </Button>
        {menuAberto && (
          <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border border-gray-200 bg-white shadow-lg py-1">
            <button
              onClick={() => abrir("BALCAO")}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50"
            >
              <Store className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <span className="text-[13px] font-medium block">Venda de Balcão</span>
                <span className="block text-[11px] text-gray-400">retirada na loja, pago no caixa</span>
              </span>
            </button>
            <button
              onClick={() => abrir("AGENDADA")}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50"
            >
              <CalendarClock className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                <span className="text-[13px] font-medium block">Venda Agendada</span>
                <span className="block text-[11px] text-gray-400">entrega via minutas</span>
              </span>
            </button>
          </div>
        )}
      </div>
      </div>

      {infoAberto && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={() => setInfoAberto(false)}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-gray-900">Tipos de pedido e como o sistema funciona</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Escolha a modalidade ao criar o pedido. Cada uma segue um fluxo diferente de entrega e recebimento.</p>
                </div>
                <button onClick={() => setInfoAberto(false)} className="ml-4 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Balcão */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Store className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-gray-900">Venda de Balcão</span>
                    <span className="text-[11px] text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 font-medium">paga e leva na hora</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-800 mb-2">
                    <span>Pedido</span><ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    <span>Recebimento</span><ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    <span>Retirada</span>
                  </div>
                  <ul className="text-[13px] text-gray-600 space-y-1 list-disc pl-5">
                    <li>O cliente <span className="font-medium">paga na hora</span> (no Caixa ou em &quot;Venda Balcão&quot;) — o dinheiro <span className="font-medium">entra na conta no momento</span> e a conta a receber já nasce <span className="font-medium">paga</span>.</li>
                    <li>A retirada <span className="font-medium">baixa o estoque na hora</span>.</li>
                    <li>Dá para separar em dois passos: <span className="font-medium">Registrar Recebimento</span> (recebe agora) e depois <span className="font-medium">Confirmar Saída do Material</span> (quando o cliente busca).</li>
                  </ul>
                </div>

                {/* Agendada */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CalendarClock className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900">Venda Agendada</span>
                    <span className="text-[11px] text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 font-medium">entrega programada</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-800 mb-2">
                    <span>Pedido</span><ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    <span>Entrega(s) / Retirada(s)</span><ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    <span>Recebimento</span>
                  </div>
                  <ul className="text-[13px] text-gray-600 space-y-1 list-disc pl-5">
                    <li>A entrega é feita por <span className="font-medium">minutas</span> (pode ser parcial); cada minuta marcada como <span className="font-medium">Entregue</span> baixa o estoque.</li>
                    <li>Quando o pedido é <span className="font-medium">totalmente entregue</span>, o sistema gera automaticamente a <span className="font-medium">conta a receber em aberto</span> — ou seja, o <span className="font-medium">recebimento fica para o futuro</span>.</li>
                    <li>Se o cliente <span className="font-medium">pagar antes</span> da entrega, use <span className="font-medium">Registrar Recebimento</span> — a conta já nasce paga e a entrega é agendada depois.</li>
                  </ul>
                </div>

                {/* Resumo */}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-[13px] text-gray-700">
                  <span className="font-semibold text-gray-900">Em resumo:</span> no <span className="font-medium text-emerald-700">Balcão</span> o dinheiro entra na conta <span className="font-medium">no momento</span> da venda; na <span className="font-medium text-blue-700">Venda Agendada</span> gera-se uma <span className="font-medium">conta a receber para o futuro</span>, criada quando a entrega é concluída.
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
        open={drawer !== null}
        onOpenChange={(v) => { if (!v) setDrawer(null); }}
        title={drawer ? TITULOS[drawer] : ""}
        width="xl"
        onCreated={onCreated}
      >
        {dados === null ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <PedidoForm clientes={dados.clientes as any} itens={dados.itens as any} itensComodato={dados.itensComodato} modalidade={drawer ?? "AGENDADA"} />
        )}
      </CreateDrawer>
    </>
  );
}
