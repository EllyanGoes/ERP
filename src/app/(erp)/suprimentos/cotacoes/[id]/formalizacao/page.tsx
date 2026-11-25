"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatBRL, decimalToNumber } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  EtapaLayout, EtapaSecao, EtapaCampos, EtapaCampo, EtapaCampoForm, EtapaResumo, EtapaRodapeAcoes,
} from "@/components/compras/etapa/EtapaUI";

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
  id: string; numero: string; numeroCompra?: string | null; nome: string | null;
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!cotacao || !cf) return <div className="p-8 text-danger">Dados não encontrados.</div>;

  const total = decimalToNumber(cf.totalCalculado);
  const frete = decimalToNumber(cf.frete);
  const desconto = decimalToNumber(cf.desconto);
  const despesas = decimalToNumber(cf.despesas);
  const seguro = decimalToNumber(cf.seguro);

  return (
    <div className="max-w-6xl">
      <div className="px-8 pt-6 pb-5">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
          <Link href="/suprimentos/cotacoes" className="hover:text-foreground">Cotações</Link>
          <span>›</span>
          <Link href={`/suprimentos/cotacoes/${id}/analise`} className="hover:text-foreground">Análise da cotação</Link>
          <span>›</span>
          <span className="text-foreground">Formalização</span>
        </nav>

        <h1 className="text-2xl font-bold text-foreground">
          Formalização da proposta - {cotacao.numeroCompra ? `Compra ${cotacao.numeroCompra}` : cotacao.numero}
        </h1>
      </div>

      <EtapaLayout
        className="pb-3"
        lateral={
          <EtapaSecao titulo="Totais">
            <EtapaResumo
              linhas={[
                { rotulo: "Moeda", valor: "REAL" },
                { rotulo: "Valor ICMS", valor: "0,00" },
                { rotulo: "Valor IPI", valor: "0,00" },
                { rotulo: "Descontos", valor: formatBRL(desconto) },
                { rotulo: "Total frete", valor: formatBRL(frete) },
                ...(despesas > 0 || seguro > 0
                  ? [
                      { rotulo: "Despesas", valor: formatBRL(despesas) },
                      { rotulo: "Seguro", valor: formatBRL(seguro) },
                    ]
                  : []),
                { rotulo: "Total da cotação", valor: formatBRL(total), destaque: true },
              ]}
            />
          </EtapaSecao>
        }
      >
        <EtapaSecao titulo="Documento">
          <EtapaCampos colunas={2}>
            <EtapaCampoForm rotulo="Tipo do documento" obrigatorio span={2}>
              <div className="flex gap-6 pt-1">
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
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </label>
                ))}
              </div>
            </EtapaCampoForm>
          </EtapaCampos>
        </EtapaSecao>

        <EtapaSecao titulo="Fornecedor">
          <EtapaCampos>
            <EtapaCampo rotulo="Código fornecedor">
              <span className="font-mono">{cf.fornecedor.id.slice(-8).toUpperCase()}</span>
            </EtapaCampo>
            <EtapaCampo rotulo="Loja">0001</EtapaCampo>
            <EtapaCampo rotulo="Razão social">{cf.fornecedor.razaoSocial}</EtapaCampo>
            <EtapaCampo rotulo="CNPJ">{cf.fornecedor.cpfCnpj}</EtapaCampo>
          </EtapaCampos>
        </EtapaSecao>

      </EtapaLayout>

      {/* Rodapé fora da grade: ocupa a largura toda (a lateral tem os totais). */}
      <div className="px-8 pb-8">
        {error && <p className="text-danger text-sm mb-2">{error}</p>}

        <EtapaRodapeAcoes>
          <Button variant="outline" onClick={() => router.back()}>Voltar</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleGerarDocumentos}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enviar para aprovação
          </Button>
        </EtapaRodapeAcoes>
      </div>
    </div>
  );
}
