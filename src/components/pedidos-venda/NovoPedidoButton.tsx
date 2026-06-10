"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";

type FormData = {
  clientes: unknown[];
  itens: unknown[];
  itensComodato: { id: string; codigo: string; descricao: string; precoVenda: number }[];
};

/**
 * Botão "+ Novo Pedido" da lista: abre o PedidoForm num painel lateral
 * extra-largo. Os dados de apoio vêm de /api/pedidos-venda/form-data (a
 * página /novo continua buscando no servidor).
 */
export default function NovoPedidoButton({ onCreated }: { onCreated: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<FormData | null>(null);

  useEffect(() => {
    if (!aberto || dados) return;
    fetch("/api/pedidos-venda/form-data")
      .then((r) => r.json())
      .then((j) => setDados(j.data ?? { clientes: [], itens: [], itensComodato: [] }))
      .catch(() => setDados({ clientes: [], itens: [], itensComodato: [] }));
  }, [aberto, dados]);

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Novo Pedido
      </Button>
      <CreateDrawer
        open={aberto}
        onOpenChange={setAberto}
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
