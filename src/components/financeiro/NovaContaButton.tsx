"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import LancamentoForm from "@/components/financeiro/LancamentoForm";

type Opcao = { id: string; razaoSocial: string };

/**
 * Botão "+ Nova Conta" das listas de contas a pagar/receber: abre o formulário
 * num painel lateral (CreateDrawer). As listas são server components, então o
 * refresh pós-criação é um router.refresh(). Os dados de apoio (fornecedores/
 * clientes) vêm das APIs — a página /nova continua buscando no servidor.
 */
export default function NovaContaButton({ tipo }: { tipo: "pagar" | "receber" }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);

  useEffect(() => {
    if (!aberta || opcoes) return;
    const url = tipo === "pagar" ? "/api/suprimentos/fornecedores?ativo=1" : "/api/clientes?limit=500";
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const lista = Array.isArray(j) ? j : (j.data ?? []);
        setOpcoes(lista.map((o: Opcao) => ({ id: o.id, razaoSocial: o.razaoSocial })));
      })
      .catch(() => setOpcoes([]));
  }, [aberta, opcoes, tipo]);

  return (
    <>
      <Button onClick={() => setAberta(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Novo Lançamento
      </Button>
      <CreateDrawer
        open={aberta}
        onOpenChange={setAberta}
        title="Novo Lançamento"
        width="lg"
        onCreated={() => router.refresh()}
      >
        {opcoes === null ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <LancamentoForm tipo={tipo} contatos={opcoes} />
        )}
      </CreateDrawer>
    </>
  );
}
