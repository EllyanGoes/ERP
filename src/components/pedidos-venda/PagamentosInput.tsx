"use client";

// Lista de formas de pagamento (pagamento misto): cada linha tem forma, conta
// de destino e valor. Usado no Caixa e na Venda Balcão. A forma "dinheiro"
// (tipo DINHEIRO do cadastro) libera troco quando a soma excede o total.
import { Plus, Trash2 } from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

export type FormaOpt = { id: string; nome: string; tipo?: string; ativo?: boolean };
export type ContaOpt = { id: string; nome: string; ativo?: boolean };

export type LinhaPagamento = {
  _key: string;
  forma: string;
  contaBancariaId: string;
  valor: string; // texto do input
};

export function novaLinhaPagamento(forma = "", contaBancariaId = "caixa-geral", valor = ""): LinhaPagamento {
  return { _key: crypto.randomUUID(), forma, contaBancariaId, valor };
}

export function parseValorBR(s: string): number {
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** É forma em dinheiro? (libera troco) */
export function formaEhDinheiro(nome: string, formas: FormaOpt[]): boolean {
  const f = formas.find((x) => x.nome === nome);
  if (f?.tipo) return f.tipo === "DINHEIRO";
  return /dinheiro|espécie|especie/i.test(nome);
}

export default function PagamentosInput({
  linhas, setLinhas, formas, contas, total, mostrarConta = true,
}: {
  linhas: LinhaPagamento[];
  setLinhas: (fn: (prev: LinhaPagamento[]) => LinhaPagamento[]) => void;
  formas: FormaOpt[];
  contas: ContaOpt[];
  total: number;
  mostrarConta?: boolean; // no pedido de venda não há conta (intenção) → esconde
}) {
  const pago = linhas.reduce((s, l) => s + parseValorBR(l.valor), 0);
  const temDinheiro = linhas.some((l) => parseValorBR(l.valor) > 0 && formaEhDinheiro(l.forma, formas));
  const falta = Math.max(total - pago, 0);
  const excesso = Math.max(pago - total, 0);
  const trocoValido = excesso > 0 && temDinheiro;

  function up(key: string, campo: keyof LinhaPagamento, valor: string) {
    setLinhas((prev) => prev.map((l) => l._key === key ? { ...l, [campo]: valor } : l));
  }
  function add() {
    // nova linha já sugere o que falta como valor
    setLinhas((prev) => [...prev, novaLinhaPagamento("", "caixa-geral", falta > 0 ? String(falta.toFixed(2)).replace(".", ",") : "")]);
  }
  function rm(key: string) {
    setLinhas((prev) => prev.length > 1 ? prev.filter((l) => l._key !== key) : prev);
  }

  const contasOpts = contas.filter((c) => c.ativo !== false);
  const temCaixaGeral = contasOpts.some((c) => c.id === "caixa-geral");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pagamento</span>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
          <Plus className="w-3.5 h-3.5" /> Forma
        </button>
      </div>

      {linhas.map((l) => (
        <div key={l._key} className={cn("grid gap-2 items-center", mostrarConta ? "grid-cols-[1fr_1fr_5rem_auto]" : "grid-cols-[1fr_5rem_auto]")}>
          <div className="min-w-0">
            <ComboboxWithCreate
              value={l.forma}
              onChange={(v) => up(l._key, "forma", v)}
              placeholder="— Forma —"
              noneLabel="Forma"
              triggerClassName="h-9 rounded-lg w-full min-w-0"
              options={[
                ...formas.filter((f) => f.ativo !== false).map((f) => ({ value: f.nome, label: f.nome })),
                // preserva a forma já escolhida que não está mais na lista ativa
                ...(l.forma && !formas.some((f) => f.nome === l.forma) ? [{ value: l.forma, label: l.forma }] : []),
              ]}
            />
          </div>
          {mostrarConta && (
            <select
              value={l.contaBancariaId}
              onChange={(e) => up(l._key, "contaBancariaId", e.target.value)}
              className="h-9 w-full min-w-0 rounded-lg border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {!temCaixaGeral && <option value="caixa-geral">Caixa Geral</option>}
              {contasOpts.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          <input
            value={l.valor}
            onChange={(e) => up(l._key, "valor", e.target.value)}
            placeholder="0,00"
            className="h-9 w-full min-w-0 rounded-lg border border-gray-300 px-2 text-sm text-right font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => rm(l._key)}
            disabled={linhas.length <= 1}
            className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Remover forma"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between text-sm pt-1">
        <span className="text-gray-500">Pago: <span className="font-semibold text-gray-800 tabular-nums">{formatBRL(pago)}</span></span>
        {falta > 0.001 ? (
          <span className="font-bold text-red-600 tabular-nums">Falta {formatBRL(falta)}</span>
        ) : trocoValido ? (
          <span className="font-bold text-amber-600 tabular-nums">Troco {formatBRL(excesso)}</span>
        ) : excesso > 0.001 ? (
          <span className="font-bold text-red-600 tabular-nums">Excesso sem dinheiro {formatBRL(excesso)}</span>
        ) : (
          <span className="font-bold text-emerald-600">Pagamento fecha ✓</span>
        )}
      </div>
    </div>
  );
}

/** Monta o payload `pagamentos` para a API a partir das linhas. */
export function pagamentosPayload(linhas: LinhaPagamento[], formas: FormaOpt[]) {
  return linhas
    .filter((l) => l.forma && parseValorBR(l.valor) > 0)
    .map((l) => ({
      forma: l.forma,
      contaBancariaId: l.contaBancariaId || "caixa-geral",
      valor: parseValorBR(l.valor),
      troco: formaEhDinheiro(l.forma, formas),
    }));
}

/** Validação client: soma cobre o total e troco só com dinheiro. */
export function pagamentosValidos(linhas: LinhaPagamento[], formas: FormaOpt[], total: number): boolean {
  if (total <= 0) return true;
  const pago = linhas.reduce((s, l) => s + parseValorBR(l.valor), 0);
  if (pago < total - 0.001) return false;
  const excesso = pago - total;
  if (excesso > 0.001) {
    const temDinheiro = linhas.some((l) => parseValorBR(l.valor) > 0 && formaEhDinheiro(l.forma, formas));
    const totalDinheiro = linhas.filter((l) => formaEhDinheiro(l.forma, formas)).reduce((s, l) => s + parseValorBR(l.valor), 0);
    if (!temDinheiro || excesso > totalDinheiro + 0.001) return false;
  }
  return true;
}
