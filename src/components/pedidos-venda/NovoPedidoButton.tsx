"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Loader2, ChevronDown, Store, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";

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
