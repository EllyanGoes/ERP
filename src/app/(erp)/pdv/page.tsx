"use client";

// Caixa (Cimento e Mix): fila de pedidos abertos à esquerda; cobrança à
// direita. O caixa cobra na maquininha (Sicredi/Caixa/Stone — sem integração
// de API nesta fase), confirma o pagamento aprovado e o sistema executa a
// venda balcão (baixa estoque, conta recebida, lançamento no caixa) e imprime
// o cupom na térmica automaticamente (ESC/POS WebUSB → fallback diálogo 80mm).

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { cn, formatBRL, decimalToNumber, parseDecimal } from "@/lib/utils";
import { printEscPosUSB } from "@/lib/webusb-print";
import { buildPedidoEscPos, printPedidoTermicaDialog, type PedidoPrintData } from "@/lib/print-pedido";
import PagamentosInput, {
  novaLinhaPagamento, parseValorBR, pagamentosPayload, pagamentosValidos,
  contaPadraoParaForma, pagamentoContaInvalida,
  type LinhaPagamento, type FormaOpt,
} from "@/components/pedidos-venda/PagamentosInput";
import { Search, RefreshCw, Loader2, Receipt, CheckCircle2, Printer } from "lucide-react";

type FilaPedido = {
  id: string;
  numero: string;
  dataEmissao: string;
  valorTotal: unknown;
  formaPagamento: string | null;
  condicaoPagamento: string | null;
  necessidadePagamento?: string | null;
  cliente: { razaoSocial: string; nomeFantasia: string | null };
};

type PedidoCompleto = {
  id: string;
  numero: string;
  valorTotal: unknown;
  formaPagamento: string | null;
  condicaoPagamento?: string | null;
  necessidadePagamento?: string | null;
  pagamentos?: { forma: string; valor: unknown }[];
  estoqueOrigemEmpresa?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    precoUnitario: unknown;
    valorTotal: unknown;
    item: { codigo: string; descricao: string; unidadeMedida: string | null; unidade: { sigla: string } | null };
  }>;
};

// Rótulo da condição de pagamento: usa a condição cadastrada; senão cai no
// "À vista / A prazo" derivado da necessidade de pagamento do pedido.
function condPagamentoLabel(p: { condicaoPagamento?: string | null; necessidadePagamento?: string | null }): string | null {
  if (p.condicaoPagamento && p.condicaoPagamento.trim()) return p.condicaoPagamento.trim();
  if (p.necessidadePagamento === "A_VISTA") return "À vista";
  if (p.necessidadePagamento === "A_PRAZO") return "A prazo";
  return null;
}

function hojeInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Data (Date|string) → "YYYY-MM-DD" para o <input type=date>. Os campos de data
// pura (ex.: dataEmissao) são gravados como meia-noite UTC, então lê-se em UTC
// para não recuar um dia em fusos negativos (SP = UTC-3).
function dataInput(value: Date | string | null | undefined) {
  if (!value) return hojeInput();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return hojeInput();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}


export default function PdvPage() {
  useTabTitle("Caixa");

  // ── Fila ──────────────────────────────────────────────────────────────────
  const [fila, setFila] = useState<FilaPedido[]>([]);
  const [filaLoading, setFilaLoading] = useState(true);
  const [busca, setBusca] = useState("");

  // ── Pedido selecionado / cobrança ────────────────────────────────────────
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [pedido, setPedido] = useState<PedidoCompleto | null>(null);
  const [pedidoLoading, setPedidoLoading] = useState(false);

  const [locais, setLocais] = useState<{ id: string; nome: string }[]>([]);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string; tipo?: string; ativo?: boolean }[]>([]);

  const [localId, setLocalId] = useState("");
  const [data, setData] = useState(hojeInput());
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);

  // Venda à ordem: o pedido pode já vir marcado (estoqueOrigemEmpresa) ou ser
  // marcado aqui no caixa (origemSel). O estoque sai de outra empresa do grupo.
  const { user } = useSession();
  const activeEmpresaId = user?.activeEmpresaId;
  // Origem da venda à ordem = qualquer empresa ativa do grupo (não só as do
  // caixa). Ex.: caixa da Cimento aciona o estoque da Tramontin.
  const [grupoEmpresas, setGrupoEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [origemSel, setOrigemSel] = useState("");      // A2: marcar à ordem no caixa
  const [precoTransf, setPrecoTransf] = useState("");  // preço de transferência (total)
  // Crédito (vale) do cliente: saldo disponível + quanto abater nesta venda.
  const [creditoSaldo, setCreditoSaldo] = useState(0);
  const [creditoUsadoStr, setCreditoUsadoStr] = useState("");

  const [concluindo, setConcluindo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<{ numero: string; troco: number | null; print: PedidoPrintData | null } | null>(null);

  const buscaRef = useRef(busca);
  buscaRef.current = busca;

  const carregarFila = useCallback(async (comSpinner = false) => {
    if (comSpinner) setFilaLoading(true);
    try {
      const res = await fetch(`/api/pedidos-venda?pdv=1&limit=100&q=${encodeURIComponent(buscaRef.current)}`);
      const j = await res.json();
      if (res.ok) setFila(j.data ?? []);
    } catch { /* mantém a fila atual */ }
    finally { if (comSpinner) setFilaLoading(false); }
  }, []);

  // primeira carga + busca (debounce) + poll leve
  useEffect(() => {
    const t = setTimeout(() => carregarFila(true), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, carregarFila]);
  useEffect(() => {
    const i = setInterval(() => carregarFila(false), 15000);
    return () => clearInterval(i);
  }, [carregarFila]);

  // cadastros (uma vez)
  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque").then((r) => r.json()).then((j) => {
      const ls = Array.isArray(j) ? j : (j.data ?? []);
      setLocais(ls);
      const salvo = localStorage.getItem("pdv_local");
      if (salvo && ls.some((l: { id: string }) => l.id === salvo)) setLocalId(salvo);
      else if (ls.length === 1) setLocalId(ls[0].id);
    }).catch(() => {});
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => setContas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/empresa/grupo").then((r) => r.json()).then((j) => setGrupoEmpresas(j.data ?? [])).catch(() => {});
  }, []);

  async function selecionar(id: string) {
    setSelecionadoId(id);
    setSucesso(null);
    setErro("");
    setData(hojeInput());
    setOrigemSel("");
    setPrecoTransf("");
    setCreditoUsadoStr("");
    setCreditoSaldo(0);
    setPedidoLoading(true);
    try {
      const res = await fetch(`/api/pedidos-venda/${id}`);
      const j = await res.json();
      if (res.ok) {
        setPedido(j.data);
        // Saldo de crédito (vale) do cliente — pode ser abatido nesta venda.
        const cliId = j.data?.cliente?.id;
        if (cliId) fetch(`/api/comercial/creditos?clienteId=${cliId}`).then((r) => r.json()).then((cj) => setCreditoSaldo(cj.saldo ?? 0)).catch(() => {});
        // Recebimento puxa a data de emissão (pagamento na hora); editável.
        setData(dataInput(j.data?.dataEmissao));
        const tot = decimalToNumber(j.data?.valorTotal ?? 0);
        const pags: { forma: string; valor: unknown }[] = j.data?.pagamentos ?? [];
        if (pags.length > 0) {
          // Pré-carrega as formas previstas no pedido (vendedor já definiu); o
          // caixa só confirma. A conta default segue a forma: dinheiro → Caixa;
          // eletrônica fica vazia para o caixa escolher o banco de destino.
          setPagamentos(pags.map((p) =>
            novaLinhaPagamento(p.forma, contaPadraoParaForma(p.forma, formas, contas), decimalToNumber(p.valor).toFixed(2).replace(".", ",")),
          ));
        } else {
          // Sem pagamentos previstos: 1 linha com o total e a forma do pedido.
          const forma = j.data?.formaPagamento ?? "";
          setPagamentos([novaLinhaPagamento(
            forma,
            contaPadraoParaForma(forma, formas, contas),
            tot > 0 ? tot.toFixed(2).replace(".", ",") : "",
          )]);
        }
      }
    } finally { setPedidoLoading(false); }
  }

  async function imprimir(print: PedidoPrintData) {
    try {
      await printEscPosUSB(buildPedidoEscPos(print, 48));
    } catch {
      // qualquer falha do WebUSB → diálogo do navegador formatado em 80mm
      try { printPedidoTermicaDialog(print); } catch { /* reimpressão disponível no pedido */ }
    }
  }

  async function confirmarPagamento() {
    if (!pedido) return;
    if (!localId) { setErro("Informe o local de estoque da retirada."); return; }
    const total = decimalToNumber(pedido.valorTotal);
    if (!pagamentosValidos(pagamentos, formas, total)) {
      setErro("Confira as formas de pagamento — a soma precisa cobrir o total (troco só em dinheiro).");
      return;
    }
    const contaRuim = pagamentoContaInvalida(pagamentos, formas, contas);
    if (contaRuim) {
      setErro(`Selecione a conta bancária de destino para "${contaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem cair no Caixa em Dinheiro.`);
      return;
    }
    setConcluindo(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/balcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localEstoqueId: localId,
          pagamentos: pagamentosPayload(pagamentos, formas),
          dataRecebimento: data || null,
          // Venda à ordem marcada aqui no caixa (se o pedido ainda não era).
          ...(origemSel && !jaAOrdem ? {
            estoqueOrigemEmpresaId: origemSel,
            precoTransferencia: precoTransf ? parseDecimal(precoTransf) : undefined,
          } : {}),
          // Crédito (vale) do cliente abatido nesta venda.
          ...(creditoUsadoNum > 0 ? { creditoUsado: creditoUsadoNum } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(j.error ?? "Não foi possível concluir a venda."); return; }

      localStorage.setItem("pdv_local", localId);
      const pago = pagamentos.reduce((s, l) => s + parseValorBR(l.valor), 0);
      const troco = pago > total ? pago - total : null;
      const print: PedidoPrintData | null = j.data?.print ?? null;

      setSucesso({ numero: pedido.numero, troco, print });
      setPedido(null);
      setSelecionadoId(null);
      setFila((prev) => prev.filter((p) => p.id !== pedido.id));

      if (print) await imprimir(print); // cupom sai automaticamente
    } finally {
      setConcluindo(false);
    }
  }

  const total = pedido ? decimalToNumber(pedido.valorTotal) : 0;
  // Crédito abatido (limitado ao saldo e ao total) → o caixa cobre o restante.
  const creditoUsadoNum = Math.min(Math.max(0, parseValorBR(creditoUsadoStr) || 0), creditoSaldo, total);
  const alvoCash = Math.max(0, Math.round((total - creditoUsadoNum) * 100) / 100);
  const pagoNum = pagamentos.reduce((s, l) => s + parseValorBR(l.valor), 0);
  const pagamentoOk = alvoCash <= 0.001 ? true : pagamentosValidos(pagamentos, formas, alvoCash);

  // Venda à ordem: marcada no pedido OU escolhida aqui no caixa (origemSel).
  const aOrdemEmpresa = pedido?.estoqueOrigemEmpresa ?? null;
  const jaAOrdem = !!aOrdemEmpresa;
  const origemEfetivaId = aOrdemEmpresa?.id || origemSel || "";
  const aOrdem = !!origemEfetivaId;
  const origemNome = aOrdemEmpresa
    ? (aOrdemEmpresa.nomeFantasia || aOrdemEmpresa.razaoSocial)
    : (grupoEmpresas.find((e) => e.id === origemSel)?.nome ?? "");

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Caixa"
        subtitle="Cobre na maquininha, confirme o pagamento e o cupom sai na impressora térmica."
        breadcrumbs={[{ label: "Faturamento" }, { label: "Caixa" }]}
      />

      <div className="flex-1 min-h-0 px-8 pb-8 grid grid-cols-[340px_1fr] gap-4">
        {/* ── Fila de pedidos abertos ─────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col min-h-0">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Pedidos abertos</h2>
              <button onClick={() => carregarFila(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-muted-foreground hover:bg-muted" title="Atualizar fila">
                <RefreshCw className={cn("w-4 h-4", filaLoading && "animate-spin")} />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número ou cliente..."
                className="w-full h-9 rounded-lg border border-border pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {fila.length === 0 && !filaLoading && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum pedido aberto para o caixa.</p>
            )}
            {fila.map((p) => (
              <button
                key={p.id}
                onClick={() => selecionar(p.id)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-info/10 transition-colors",
                  selecionadoId === p.id && "bg-info/10 border-l-2 border-blue-600",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-foreground">{p.numero}</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">{formatBRL(decimalToNumber(p.valorTotal))}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{p.cliente.nomeFantasia || p.cliente.razaoSocial}</p>
                {condPagamentoLabel(p) && (
                  <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{condPagamentoLabel(p)}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Painel de cobrança ──────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col min-h-0">
          {sucesso ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              <p className="text-lg font-bold text-foreground">Venda {sucesso.numero} concluída</p>
              {sucesso.troco != null && (
                <p className="text-2xl font-bold text-warning">Troco: {formatBRL(sucesso.troco)}</p>
              )}
              <p className="text-sm text-muted-foreground">Estoque baixado, recebimento lançado no caixa e cupom enviado para impressão.</p>
              <div className="flex gap-2 mt-2">
                {sucesso.print && (
                  <Button variant="outline" size="sm" onClick={() => sucesso.print && imprimir(sucesso.print)}>
                    <Printer className="w-4 h-4 mr-1.5" /> Reimprimir cupom
                  </Button>
                )}
                <Button size="sm" onClick={() => setSucesso(null)}>Próxima venda</Button>
              </div>
            </div>
          ) : !selecionadoId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/60">
              <Receipt className="w-14 h-14" />
              <p className="text-sm text-muted-foreground">Selecione um pedido na fila para cobrar.</p>
            </div>
          ) : pedidoLoading || !pedido ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando pedido…
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Itens */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-bold text-foreground">{pedido.numero}</p>
                  <p className="text-xs text-muted-foreground">{pedido.cliente.nomeFantasia || pedido.cliente.razaoSocial}</p>
                  {condPagamentoLabel(pedido) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground">Cond. pagamento:</span> {condPagamentoLabel(pedido)}
                    </p>
                  )}
                </div>
                <p className="text-3xl font-bold text-foreground tabular-nums">{formatBRL(total)}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-2">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {pedido.itens.map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5 text-foreground">{i.item.descricao}</td>
                        <td className="py-1.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {decimalToNumber(i.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {i.item.unidade?.sigla || i.item.unidadeMedida} × {formatBRL(decimalToNumber(i.precoUnitario))}
                        </td>
                        <td className="py-1.5 text-right font-medium text-foreground tabular-nums w-28">{formatBRL(decimalToNumber(i.valorTotal))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cobrança */}
              <div className="border-t border-border px-5 py-4 space-y-3 bg-muted/60 rounded-b-xl">
                {erro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{erro}</p>}

                {/* Venda à ordem: estoque sai de outra empresa do grupo. */}
                {aOrdem && (
                  <div className="rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/15 px-3 py-2 text-xs text-violet-800 dark:text-violet-300">
                    <span className="font-semibold">Venda à ordem</span> — o estoque sai de <span className="font-semibold">{origemNome}</span>.
                    O local abaixo é só onde os movimentos são registrados nesta empresa.
                  </div>
                )}
                {/* A2: marcar à ordem aqui no caixa (se o pedido ainda não era). */}
                {!jaAOrdem && grupoEmpresas.length > 1 && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Estoque de outra empresa (à ordem)
                      <ComboboxWithCreate
                        value={origemSel}
                        onChange={(v) => setOrigemSel(v)}
                        noneLabel="— Esta empresa (normal) —"
                        triggerClassName="h-10 rounded-lg font-normal normal-case"
                        options={grupoEmpresas.filter((e) => e.id !== activeEmpresaId).map((e) => ({ value: e.id, label: e.nome }))}
                      />
                    </label>
                    {origemSel && (
                      <label className="space-y-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Preço de transferência (total) <span className="font-normal normal-case text-muted-foreground">(opcional)</span>
                        <input inputMode="decimal" value={precoTransf} onChange={(e) => setPrecoTransf(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" className="w-full h-10 rounded-lg border border-border px-2 text-sm font-normal text-right bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {aOrdem ? `Local p/ registro${origemNome ? "" : ""} *` : "Local de estoque *"}
                    <ComboboxWithCreate
                      value={localId}
                      onChange={(v) => setLocalId(v)}
                      noneLabel="— Selecionar —"
                      triggerClassName="h-10 rounded-lg font-normal normal-case"
                      options={locais.map((l) => ({ value: l.id, label: l.nome }))}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Data do recebimento
                    <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full h-10 rounded-lg border border-border px-2 text-sm font-normal bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                </div>

                {/* Crédito (vale) do cliente: abate do total; o caixa cobre o restante. */}
                {creditoSaldo > 0 && (
                  <div className="rounded-lg border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/15 px-3 py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">Crédito do cliente — saldo {formatBRL(creditoSaldo)}</p>
                      <p className="text-[11px] text-teal-600 dark:text-teal-400">Abater nesta venda (o caixa cobre o restante).</p>
                    </div>
                    <input inputMode="decimal" value={creditoUsadoStr} onChange={(e) => setCreditoUsadoStr(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" className="w-28 h-9 rounded-lg border border-teal-300 px-2 text-sm text-right bg-card" />
                    <button type="button" onClick={() => setCreditoUsadoStr(Math.min(creditoSaldo, total).toFixed(2).replace(".", ","))} className="text-xs text-teal-700 dark:text-teal-300 font-medium hover:underline whitespace-nowrap">usar máx.</button>
                  </div>
                )}

                {/* Formas de pagamento (misto: PIX + dinheiro etc.) */}
                <PagamentosInput linhas={pagamentos} setLinhas={setPagamentos} formas={formas} contas={contas} total={alvoCash} />

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-sm text-muted-foreground">
                    Total <span className="font-bold text-foreground tabular-nums">{formatBRL(total)}</span>
                    {creditoUsadoNum > 0 && <span className="ml-2 text-teal-700 dark:text-teal-300">− crédito {formatBRL(creditoUsadoNum)} = <span className="font-semibold">{formatBRL(alvoCash)}</span></span>}
                  </span>
                  <div className="flex-1" />
                  <Button
                    onClick={confirmarPagamento}
                    disabled={concluindo || !pagamentoOk || (pagoNum <= 0 && creditoUsadoNum <= 0)}
                    className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700 text-base font-bold"
                  >
                    {concluindo ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Printer className="w-5 h-5 mr-2" />}
                    {concluindo ? "Concluindo..." : "Pagamento aprovado — concluir e imprimir"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
