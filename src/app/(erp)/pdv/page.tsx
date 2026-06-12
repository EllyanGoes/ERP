"use client";

// Caixa (Cimento e Mix): fila de pedidos abertos à esquerda; cobrança à
// direita. O caixa cobra na maquininha (Sicredi/Caixa/Stone — sem integração
// de API nesta fase), confirma o pagamento aprovado e o sistema executa a
// venda balcão (baixa estoque, conta recebida, lançamento no caixa) e imprime
// o cupom na térmica automaticamente (ESC/POS WebUSB → fallback diálogo 80mm).

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { printEscPosUSB } from "@/lib/webusb-print";
import { buildPedidoEscPos, printPedidoTermicaDialog, type PedidoPrintData } from "@/lib/print-pedido";
import { Search, RefreshCw, Loader2, Receipt, CheckCircle2, Printer } from "lucide-react";

type FilaPedido = {
  id: string;
  numero: string;
  dataEmissao: string;
  valorTotal: unknown;
  formaPagamento: string | null;
  cliente: { razaoSocial: string; nomeFantasia: string | null };
};

type PedidoCompleto = {
  id: string;
  numero: string;
  valorTotal: unknown;
  formaPagamento: string | null;
  cliente: { razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    precoUnitario: unknown;
    valorTotal: unknown;
    item: { codigo: string; descricao: string; unidadeMedida: string | null; unidade: { sigla: string } | null };
  }>;
};

function hojeInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseValor(s: string): number {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
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
  const [formas, setFormas] = useState<{ id: string; nome: string; ativo?: boolean }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string; ativo?: boolean }[]>([]);

  const [localId, setLocalId] = useState("");
  const [forma, setForma] = useState("");
  const [contaId, setContaId] = useState("caixa-geral");
  const [data, setData] = useState(hojeInput());
  const [valorRecebido, setValorRecebido] = useState("");

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
  }, []);

  async function selecionar(id: string) {
    setSelecionadoId(id);
    setSucesso(null);
    setErro("");
    setValorRecebido("");
    setData(hojeInput());
    setPedidoLoading(true);
    try {
      const res = await fetch(`/api/pedidos-venda/${id}`);
      const j = await res.json();
      if (res.ok) {
        setPedido(j.data);
        setForma(j.data?.formaPagamento ?? "");
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
    setConcluindo(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/balcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localEstoqueId: localId,
          formaPagamento: forma || null,
          contaBancariaId: contaId || null,
          dataRecebimento: data || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(j.error ?? "Não foi possível concluir a venda."); return; }

      localStorage.setItem("pdv_local", localId);
      const total = decimalToNumber(pedido.valorTotal);
      const recebido = parseValor(valorRecebido);
      const troco = recebido > 0 ? Math.max(recebido - total, 0) : null;
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
  const recebidoNum = parseValor(valorRecebido);
  const troco = recebidoNum > 0 ? recebidoNum - total : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Caixa"
        subtitle="Cobre na maquininha, confirme o pagamento e o cupom sai na impressora térmica."
        breadcrumbs={[{ label: "Comercial" }, { label: "Caixa" }]}
      />

      <div className="flex-1 min-h-0 px-8 pb-8 grid grid-cols-[340px_1fr] gap-4">
        {/* ── Fila de pedidos abertos ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">Pedidos abertos</h2>
              <button onClick={() => carregarFila(true)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50" title="Atualizar fila">
                <RefreshCw className={cn("w-4 h-4", filaLoading && "animate-spin")} />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número ou cliente..."
                className="w-full h-9 rounded-lg border border-gray-300 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {fila.length === 0 && !filaLoading && (
              <p className="px-4 py-10 text-center text-sm text-gray-400">Nenhum pedido aberto para o caixa.</p>
            )}
            {fila.map((p) => (
              <button
                key={p.id}
                onClick={() => selecionar(p.id)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-colors",
                  selecionadoId === p.id && "bg-blue-50 border-l-2 border-blue-600",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-gray-800">{p.numero}</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{formatBRL(decimalToNumber(p.valorTotal))}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{p.cliente.nomeFantasia || p.cliente.razaoSocial}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Painel de cobrança ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm flex flex-col min-h-0">
          {sucesso ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              <p className="text-lg font-bold text-gray-800">Venda {sucesso.numero} concluída</p>
              {sucesso.troco != null && (
                <p className="text-2xl font-bold text-amber-600">Troco: {formatBRL(sucesso.troco)}</p>
              )}
              <p className="text-sm text-gray-500">Estoque baixado, recebimento lançado no caixa e cupom enviado para impressão.</p>
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
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-300">
              <Receipt className="w-14 h-14" />
              <p className="text-sm text-gray-400">Selecione um pedido na fila para cobrar.</p>
            </div>
          ) : pedidoLoading || !pedido ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando pedido…
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Itens */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-bold text-gray-800">{pedido.numero}</p>
                  <p className="text-xs text-gray-500">{pedido.cliente.nomeFantasia || pedido.cliente.razaoSocial}</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatBRL(total)}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-2">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {pedido.itens.map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5 text-gray-800">{i.item.descricao}</td>
                        <td className="py-1.5 text-right text-xs text-gray-500 whitespace-nowrap">
                          {decimalToNumber(i.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {i.item.unidade?.sigla || i.item.unidadeMedida} × {formatBRL(decimalToNumber(i.precoUnitario))}
                        </td>
                        <td className="py-1.5 text-right font-medium text-gray-800 tabular-nums w-28">{formatBRL(decimalToNumber(i.valorTotal))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cobrança */}
              <div className="border-t border-gray-200 px-5 py-4 space-y-3 bg-gray-50/60 rounded-b-xl">
                {erro && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="space-y-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Forma de pagamento
                    <select value={forma} onChange={(e) => setForma(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm font-normal normal-case bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Selecionar —</option>
                      {formas.filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                      {forma && !formas.some((f) => f.nome === forma) && <option value={forma}>{forma}</option>}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Local de estoque *
                    <select value={localId} onChange={(e) => setLocalId(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm font-normal normal-case bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Selecionar —</option>
                      {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Conta de destino
                    <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm font-normal normal-case bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {!contas.some((c) => c.id === "caixa-geral") && <option value="caixa-geral">Caixa Geral</option>}
                      {contas.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Data do recebimento
                    <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm font-normal bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Valor recebido (dinheiro)
                    <input
                      value={valorRecebido}
                      onChange={(e) => setValorRecebido(e.target.value)}
                      placeholder="opcional"
                      className="block w-36 h-10 rounded-lg border border-gray-300 px-2 text-sm font-normal text-right font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  {troco != null && (
                    <p className={cn("text-sm font-bold pb-2 tabular-nums", troco < 0 ? "text-red-600" : "text-amber-600")}>
                      {troco < 0 ? `Falta ${formatBRL(-troco)}` : `Troco: ${formatBRL(troco)}`}
                    </p>
                  )}
                  <div className="flex-1" />
                  <Button
                    onClick={confirmarPagamento}
                    disabled={concluindo || (troco != null && troco < 0)}
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
