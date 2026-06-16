"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatBRL, decimalToNumber } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type CotacaoFornecedor = {
  id: string;
  status: string;
  totalCalculado: unknown;
  frete: unknown;
  desconto: unknown;
  despesas: unknown;
  seguro: unknown;
  condicoesPagamento: string | null;
  melhorOpcao?: boolean;
  fornecedor: {
    id: string; razaoSocial: string; nomeFantasia: string | null;
    cpfCnpj: string | null;
  };
  itens: Array<{
    id: string; itemId: string; quantidade: unknown; precoUnitario: unknown; subtotal: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
};

type Cotacao = {
  id: string; numero: string; nome: string | null;
  fornecedores: CotacaoFornecedor[];
};

export default function FormalizacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cfId = searchParams.get("cfId");

  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipoDoc, setTipoDoc] = useState<"pedido" | "contrato">("pedido");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/suprimentos/cotacoes/${id}`);
    const json = await res.json();
    setCotacao(json.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const cf = cotacao?.fornecedores.find(f => f.id === cfId)
    ?? cotacao?.fornecedores.find(f => f.melhorOpcao)
    ?? cotacao?.fornecedores[0];

  async function handleGerarDocumentos() {
    setSubmitting(true);
    setError("");
    try {
      // Formalizar = escolher o vencedor e ENCAMINHAR para o aprovador. A geração
      // do Pedido de Compras acontece quando o aprovador confirma (WEB ou Telegram).
      const res = await fetch(`/api/suprimentos/cotacoes/${id}/submeter-aprovacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao enviar para aprovação");
      // Volta para a cotação (agora AGUARDANDO_APROVACAO). O aprovador confirma na
      // tela Aprovações, na própria cotação ou pelo Telegram.
      router.push(`/suprimentos/cotacoes/${id}?enviada=1${json.semAprovador ? "&semAprovador=1" : ""}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!cotacao || !cf) return <div className="p-8 text-red-600">Dados não encontrados.</div>;

  const total = decimalToNumber(cf.totalCalculado);
  const frete = decimalToNumber(cf.frete);
  const desconto = decimalToNumber(cf.desconto);
  const despesas = decimalToNumber(cf.despesas);
  const seguro = decimalToNumber(cf.seguro);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/suprimentos/cotacoes" className="hover:text-gray-700">Cotações</Link>
        <span>›</span>
        <Link href={`/suprimentos/cotacoes/${id}/analise`} className="hover:text-gray-700">Análise da cotação</Link>
        <span>›</span>
        <span className="text-gray-700">Formalização</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Formalização da proposta - {cotacao.numero}
      </h1>

      <div className="bg-white border rounded-lg p-6 space-y-6">
        {/* Tipo do documento */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tipo do documento</h3>
          <div className="flex gap-6">
            {[
              { value: "pedido", label: "Pedido de compras" },
              { value: "contrato", label: "Contrato" },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={opt.value}
                  checked={tipoDoc === opt.value}
                  onChange={() => setTipoDoc(opt.value as "pedido" | "contrato")}
                  className="accent-red-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <hr />

        {/* Fornecedor */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Fornecedor</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Código fornecedor</p>
              <p className="font-medium text-gray-800">{cf.fornecedor.id.slice(-8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Loja</p>
              <p className="font-medium text-gray-800">0001</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Razão social</p>
              <p className="font-medium text-gray-800">{cf.fornecedor.razaoSocial}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">CNPJ</p>
              <p className="font-medium text-gray-800">{cf.fornecedor.cpfCnpj || "—"}</p>
            </div>
          </div>
        </div>

        <hr />

        {/* Produtos */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Produtos</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Moeda</p>
              <p className="font-medium text-gray-800">REAL</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Valor ICMS</p>
              <p className="font-medium text-gray-800">0,00</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Valor IPI</p>
              <p className="font-medium text-gray-800">0,00</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Descontos</p>
              <p className="font-medium text-gray-800">{formatBRL(desconto)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Total Frete</p>
              <p className="font-medium text-gray-800">{formatBRL(frete)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Total da cotação</p>
              <p className="font-semibold text-gray-900 text-base">{formatBRL(total)}</p>
            </div>
          </div>
          {(despesas > 0 || seguro > 0) && (
            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Despesas</p>
                <p className="font-medium text-gray-800">{formatBRL(despesas)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Seguro</p>
                <p className="font-medium text-gray-800">{formatBRL(seguro)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={() => router.back()}>Voltar</Button>
        <Button
          className="bg-red-600 hover:bg-red-700 text-white"
          onClick={handleGerarDocumentos}
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Enviar para aprovação
        </Button>
      </div>
    </div>
  );
}
