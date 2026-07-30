"use client";
// Seção de PAGAMENTOS de RH (folha mensal e diárias): a folha fechada tem UM
// título no financeiro; aqui o pagamento é registrado POR COLABORADOR (data +
// conta), individual ou em lote ("Pagar todos"). Cada registro baixa o título
// parcialmente e posta o contábil da pessoa (D 2.1.6.x / C banco) no servidor.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, CheckCircle2, Banknote, AlertCircle } from "lucide-react";

export type ItemPagamentoRh = {
  id: string;
  nome: string;
  valor: number; // a pagar (líquido / diária)
  dataPagamento: string | null;
  valorPago?: number | null;
  contaBancariaId?: string | null;
};

type ContaBancaria = { id: string; nome: string; ativo?: boolean; compensacao?: boolean };

export default function PagamentosRhSection({
  itens,
  endpoint,
  onDone,
  rotulo = "colaborador",
}: {
  itens: ItemPagamentoRh[];
  /** POST { itemIds, dataPagamento, contaBancariaId } */
  endpoint: string;
  onDone: () => void | Promise<unknown>;
  rotulo?: string;
}) {
  const hoje = new Date().toLocaleDateString("sv-SE");
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [data, setData] = useState(hoje);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pagando, setPagando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/financeiro/contas")
      .then((r) => r.json())
      .then((j) => setContas((Array.isArray(j) ? j : (j.data ?? [])).filter((c: ContaBancaria) => !c.compensacao && c.ativo !== false)))
      .catch(() => {});
  }, []);

  const pendentes = useMemo(() => itens.filter((i) => !i.dataPagamento && i.valor > 0), [itens]);
  const pagos = useMemo(() => itens.filter((i) => i.dataPagamento), [itens]);
  const selecionados = pendentes.filter((i) => sel.has(i.id));
  const totalSel = selecionados.reduce((s, i) => s + i.valor, 0);
  const totalPendente = pendentes.reduce((s, i) => s + i.valor, 0);
  const totalPago = pagos.reduce((s, i) => s + (i.valorPago ?? i.valor), 0);

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function pagar(ids: string[]) {
    if (ids.length === 0) return;
    if (!contaBancariaId) { setErro("Selecione a conta de saída do pagamento."); return; }
    setPagando(true); setErro("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids, dataPagamento: data, contaBancariaId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Falha ao registrar o pagamento."); return; }
      setSel(new Set());
      await onDone();
    } finally { setPagando(false); }
  }

  const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
  const nomeConta = (id?: string | null) => contas.find((c) => c.id === id)?.nome ?? "";

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/40">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Banknote className="w-4 h-4 text-muted-foreground" /> Pagamentos
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {pagos.length}/{itens.length} pagos · pago {formatBRL(totalPago)} · pendente {formatBRL(totalPendente)}
        </span>
        {pendentes.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <DatePicker value={data} onChange={(v) => setData(v || hoje)} triggerClassName="h-8" />
            <div className="w-56">
              <ComboboxWithCreate
                value={contaBancariaId}
                onChange={setContaBancariaId}
                noneLabel="Conta de saída…"
                menuMinWidth={340}
                triggerClassName={cn("h-8 rounded-md", !contaBancariaId && "border-warning/50")}
                options={contas.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </div>
            {selecionados.length > 0 && (
              <Button size="sm" onClick={() => pagar(selecionados.map((i) => i.id))} disabled={pagando}>
                {pagando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Pagar selecionados ({selecionados.length} · {formatBRL(totalSel)})
              </Button>
            )}
            <Button size="sm" variant={selecionados.length > 0 ? "outline" : "default"} onClick={() => pagar(pendentes.map((i) => i.id))} disabled={pagando}>
              {pagando && selecionados.length === 0 ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Pagar todos ({formatBRL(totalPendente)})
            </Button>
          </div>
        )}
      </div>

      {erro && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-danger/10 text-danger text-sm">
          <AlertCircle className="w-4 h-4" /> {erro}
        </div>
      )}

      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {itens.map((i) => {
            const pago = !!i.dataPagamento;
            return (
              <tr key={i.id} className={cn("hover:bg-muted", pago && "bg-success/5")}>
                <td className="w-10 px-4 py-2 text-center">
                  {pago ? (
                    <CheckCircle2 className="w-4 h-4 text-success inline" />
                  ) : i.valor > 0 ? (
                    <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} className="accent-blue-600" />
                  ) : null}
                </td>
                <td className="px-3 py-2 font-medium text-foreground">{i.nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatBRL(i.valor)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground w-64">
                  {pago
                    ? `Pago em ${fmtData(i.dataPagamento!)}${nomeConta(i.contaBancariaId) ? ` — ${nomeConta(i.contaBancariaId)}` : ""}`
                    : i.valor > 0 ? `Pendente` : `Sem valor`}
                </td>
              </tr>
            );
          })}
          {itens.length === 0 && (
            <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>Nenhum {rotulo} na folha.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
