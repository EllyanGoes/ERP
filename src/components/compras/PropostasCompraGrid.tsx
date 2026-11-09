"use client";

// Grade de propostas da Nova compra: uma coluna por fornecedor, uma linha por
// produto. Um fornecedor só já basta; o aprovador julga se a comparação foi
// suficiente.
import { useMemo } from "react";
import { Check, Plus, X } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  numeroDigitado, propostaCompleta, subtotalDaProposta, totalDaProposta, vencedorDaCompra,
  type ItemCompra, type PropostaCompra,
} from "@/lib/compras-processo";
import { cn, formatBRL } from "@/lib/utils";

export type PropostaForm = {
  chave: string;
  fornecedorId: string;
  precos: Record<string, string>;
  frete: string;
  vrDesconto: string;
  condicoesPagamento: string;
  prazoEntregaDias: string;
};

export const novaPropostaForm = (): PropostaForm => ({
  chave: crypto.randomUUID(),
  fornecedorId: "", precos: {}, frete: "", vrDesconto: "", condicoesPagamento: "", prazoEntregaDias: "",
});

export function paraProposta(p: PropostaForm): PropostaCompra {
  const precos: PropostaCompra["precos"] = {};
  for (const [itemId, texto] of Object.entries(p.precos)) precos[itemId] = numeroDigitado(texto);
  return {
    fornecedorId: p.fornecedorId,
    precos,
    frete: numeroDigitado(p.frete),
    vrDesconto: numeroDigitado(p.vrDesconto),
    condicoesPagamento: p.condicoesPagamento.trim() || null,
    prazoEntregaDias: numeroDigitado(p.prazoEntregaDias),
  };
}

const MAX_FORNECEDORES = 5;
const soNumero = (v: string) => v.replace(/[^0-9.,]/g, "");

export default function PropostasCompraGrid({
  itens, nomeItem, fornecedores, propostas, onChange, vencedorId, onVencedor,
}: {
  itens: ItemCompra[];
  nomeItem: (itemId: string) => string;
  fornecedores: { value: string; label: string }[];
  propostas: PropostaForm[];
  onChange: (propostas: PropostaForm[]) => void;
  vencedorId: string;
  onVencedor: (fornecedorId: string) => void;
}) {
  const calculadas = useMemo(() => propostas.map(paraProposta), [propostas]);
  const vencedor = vencedorDaCompra(itens, calculadas.filter((p) => p.fornecedorId), vencedorId || null);

  const alterar = (chave: string, mudanca: Partial<PropostaForm>) =>
    onChange(propostas.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p)));

  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Escolha os produtos acima para informar os preços.</p>;
  }

  const linhaCampo = (rotulo: string, campo: "frete" | "vrDesconto" | "condicoesPagamento" | "prazoEntregaDias", numerico = true) => (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-3 text-muted-foreground" colSpan={2}>{rotulo}</td>
      {propostas.map((p) => (
        <td key={p.chave} className="py-1.5 px-1">
          <Input
            aria-label={rotulo}
            inputMode={numerico ? "decimal" : undefined}
            value={p[campo]}
            onChange={(e) => alterar(p.chave, { [campo]: numerico ? soNumero(e.target.value) : e.target.value })}
            className="h-8 text-sm"
          />
        </td>
      ))}
      <td />
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2 pr-3 font-medium text-muted-foreground min-w-[220px]">Produto</th>
            <th className="pb-2 pr-3 font-medium text-muted-foreground text-right">Qtd.</th>
            {propostas.map((p) => (
              <th key={p.chave} className="pb-2 px-1 font-normal w-48 min-w-[180px]">
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <ComboboxWithCreate
                      value={p.fornecedorId}
                      onChange={(fornecedorId) => alterar(p.chave, { fornecedorId })}
                      allowNone={false}
                      placeholder="Fornecedor..."
                      triggerClassName="h-8 rounded-lg"
                      options={fornecedores.filter((f) => f.value === p.fornecedorId || !propostas.some((o) => o.fornecedorId === f.value))}
                    />
                  </div>
                  <button
                    type="button"
                    title="Remover fornecedor"
                    onClick={() => onChange(propostas.filter((o) => o.chave !== p.chave))}
                    className="text-muted-foreground hover:text-danger shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </th>
            ))}
            <th className="pb-2 pl-2 w-10">
              {propostas.length > 0 && propostas.length < MAX_FORNECEDORES && (
                <Button type="button" variant="outline" size="sm" title="Adicionar fornecedor" onClick={() => onChange([...propostas, novaPropostaForm()])}>
                  <Plus className="w-4 h-4" />
                </Button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.itemId} className="border-t border-border">
              <td className="py-1.5 pr-3 max-w-[280px] truncate" title={nomeItem(i.itemId)}>{nomeItem(i.itemId)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{i.quantidade.toLocaleString("pt-BR")}</td>
              {propostas.map((p) => (
                <td key={p.chave} className="py-1.5 px-1">
                  <Input
                    aria-label={`Preço unitário de ${nomeItem(i.itemId)}`}
                    inputMode="decimal"
                    placeholder="Preço unit."
                    value={p.precos[i.itemId] ?? ""}
                    onChange={(e) => alterar(p.chave, { precos: { ...p.precos, [i.itemId]: soNumero(e.target.value) } })}
                    className="h-8 text-sm text-right"
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
          {propostas.length > 0 && (
            <>
              {linhaCampo("Frete (R$)", "frete")}
              {linhaCampo("Desconto (R$)", "vrDesconto")}
              {linhaCampo("Condição de pagamento", "condicoesPagamento", false)}
              {linhaCampo("Prazo de entrega (dias)", "prazoEntregaDias")}
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3" colSpan={2}>Total</td>
                {calculadas.map((p, idx) => (
                  <td key={propostas[idx].chave} className="py-2 px-1 text-right tabular-nums">
                    {subtotalDaProposta(itens, p) > 0 ? formatBRL(totalDaProposta(itens, p)) : "—"}
                  </td>
                ))}
                <td />
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-muted-foreground" colSpan={2}>Fornecedor indicado</td>
                {calculadas.map((p, idx) => {
                  const completa = !!p.fornecedorId && propostaCompleta(itens, p);
                  const indicado = completa && p.fornecedorId === vencedor;
                  return (
                    <td key={propostas[idx].chave} className="py-1.5 px-1">
                      <button
                        type="button"
                        disabled={!completa}
                        onClick={() => onVencedor(p.fornecedorId)}
                        className={cn(
                          "w-full h-8 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors disabled:opacity-40",
                          indicado ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {indicado && <Check className="w-3.5 h-3.5" />}
                        {indicado ? "Indicado" : "Indicar"}
                      </button>
                    </td>
                  );
                })}
                <td />
              </tr>
            </>
          )}
        </tbody>
      </table>
      {propostas.length === 0 && (
        <div className="flex justify-center py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([novaPropostaForm()])}>
            <Plus className="w-4 h-4 mr-1" />Adicionar fornecedor
          </Button>
        </div>
      )}
    </div>
  );
}
