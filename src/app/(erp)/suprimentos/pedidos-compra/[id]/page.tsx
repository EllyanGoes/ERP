"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { MessageCircle, Copy, ExternalLink, Search, ChevronDown, X, Loader2, Users, CheckCircle2 } from "lucide-react";

type WAUser = { id: string; nome: string; telefone: string | null };

type CotacaoFornecedor = {
  id: string;
  frete: unknown;
  tipoFrete: string | null;
  desconto: unknown;
  vrDesconto: unknown;
  despesas: unknown;
  seguro: unknown;
  condicoesPagamento: string | null;
  prazoEntregaDias: number | null;
  propostaNumero: number;
};

type PedidoCompra = {
  id: string;
  numero: string;
  status: string;
  valorTotal: unknown;
  dataEntregaPrevista: string | null;
  observacoes: string | null;
  cotacaoId: string | null;
  cotacao: { id: string; numero: string; nome: string | null } | null;
  fornecedor: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cpfCnpj: string | null;
    contato: string | null;
    email: string | null;
  };
  itens: Array<{
    id: string;
    quantidade: unknown;
    precoUnitario: unknown;
    valorTotal: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
  conferencia: { id: string; numero: string; status: string } | null;
  cotacaoFornecedor: CotacaoFornecedor | null;
};

const TIPO_FRETE_LABEL: Record<string, string> = {
  C: "C-CIF",
  F: "F-FOB",
  T: "T-CIF/FOB",
  O: "Outro",
};

const STATUS_NEXT: Record<string, { label: string; next: string; variant: "default" | "outline" }[]> = {
  RASCUNHO: [{ label: "Enviar Pedido", next: "ENVIADO", variant: "default" }],
  ENVIADO: [{ label: "Confirmar Recebimento", next: "CONFIRMADO", variant: "default" }],
  CONFIRMADO: [
    { label: "Marcar Em Trânsito", next: "EM_TRANSITO", variant: "outline" },
    { label: "Registrar Chegada", next: "RECEBIDO", variant: "default" },
  ],
  EM_TRANSITO: [{ label: "Registrar Chegada", next: "RECEBIDO", variant: "default" }],
  RECEBIDO: [],
  CANCELADO: [],
};

export default function PedidoCompraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<PedidoCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);

  // ── WA modal state ────────────────────────────────────────────────────────────
  const [showWAModal,    setShowWAModal]    = useState(false);
  const [waAprovadorId,  setWAAprovadorId]  = useState("");
  const [waUserSearch,   setWAUserSearch]   = useState("");
  const [waDropdownOpen, setWADropdownOpen] = useState(false);
  const [waUsers,        setWAUsers]        = useState<WAUser[]>([]);
  const [waUsersLoading, setWAUsersLoading] = useState(false);
  const [waCopied,       setWACopied]       = useState(false);
  const waDropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}`);
      const json = await res.json();
      setPedido(json.data);
    } catch {
      setError("Erro ao carregar pedido");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!waDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (waDropdownRef.current && !waDropdownRef.current.contains(e.target as Node)) {
        setWADropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [waDropdownOpen]);

  async function changeStatus(status: string) {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro na operação"); return; }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function registrarConferencia() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch("/api/suprimentos/conferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: id }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro ao criar conferência"); return; }
      router.push(`/suprimentos/conferencias/${json.data.id}`);
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function openWAModal() {
    setShowWAModal(true);
    setWAAprovadorId("");
    setWAUserSearch("");
    setWADropdownOpen(false);
    setWACopied(false);
    setWAUsersLoading(true);
    try {
      const res  = await fetch("/api/empresa/colaboradores?ativo=true");
      const json = await res.json();
      const list: WAUser[] = (Array.isArray(json) ? json : []).map((c: WAUser) => ({
        id: c.id, nome: c.nome, telefone: c.telefone ?? null,
      }));
      setWAUsers(list);
    } catch { /* ignore */ }
    finally { setWAUsersLoading(false); }
  }

  function buildWAMessage() {
    if (!pedido) return "";
    const cf = pedido.cotacaoFornecedor;
    const itensLines = pedido.itens.map((it, i) => {
      const qtd   = decimalToNumber(it.quantidade);
      const preco = decimalToNumber(it.precoUnitario);
      const tot   = decimalToNumber(it.valorTotal) || qtd * preco;
      return `  ${i + 1}. ${it.item.descricao} — ${qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${it.item.unidadeMedida} × ${formatBRL(preco)} = ${formatBRL(tot)}`;
    });
    const total = calcTotal();
    return [
      `*Pedido de Compra ${pedido.numero}*`,
      ``,
      `• *Fornecedor:* ${pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial}`,
      ...(pedido.cotacao ? [`• *Cotação:* ${pedido.cotacao.numero}`] : []),
      ...(cf?.condicoesPagamento ? [`• *Cond. Pagamento:* ${cf.condicoesPagamento}`] : []),
      ...(cf?.prazoEntregaDias ? [`• *Prazo Entrega:* ${cf.prazoEntregaDias} dias`] : []),
      ...(pedido.dataEntregaPrevista ? [`• *Entrega Prevista:* ${formatDate(pedido.dataEntregaPrevista)}`] : []),
      ``,
      `*Itens (${pedido.itens.length}):*`,
      ...itensLines,
      ``,
      `*Total: ${formatBRL(total)}*`,
      ...(pedido.observacoes ? [``, `_Obs: ${pedido.observacoes}_`] : []),
    ].join("\n");
  }

  async function copyWAMessage() {
    await navigator.clipboard.writeText(buildWAMessage());
    setWACopied(true);
    setTimeout(() => setWACopied(false), 2500);
  }

  function openWhatsApp() {
    const approver = waUsers.find((u) => u.id === waAprovadorId);
    const encoded  = encodeURIComponent(buildWAMessage());
    if (approver?.telefone) {
      const phone = approver.telefone.replace(/\D/g, "");
      const norm  = phone.startsWith("55") ? phone : `55${phone}`;
      window.open(`https://wa.me/${norm}?text=${encoded}`, "_blank");
    } else {
      window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank");
    }
    setShowWAModal(false);
  }

  function calcTotal() {
    if (!pedido) return 0;
    const fromDB = decimalToNumber(pedido.valorTotal);
    if (fromDB > 0) return fromDB;
    return pedido.itens.reduce((sum, it) => {
      const vlItem = decimalToNumber(it.valorTotal);
      const qtd    = decimalToNumber(it.quantidade);
      const preco  = decimalToNumber(it.precoUnitario);
      return sum + (vlItem > 0 ? vlItem : qtd * preco);
    }, 0);
  }

  useTabTitle(pedido ? `PC ${pedido.numero}` : null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!pedido) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const totalGeral  = calcTotal();
  const nextActions = STATUS_NEXT[pedido.status] ?? [];
  const cf          = pedido.cotacaoFornecedor;
  const fornNome    = pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial;
  const codigoForn  = pedido.fornecedor.id.slice(-8).toUpperCase();
  const propostaLabel = cf ? `PROPOSTA ${String(cf.propostaNumero).padStart(2, "0")}` : "—";

  // Financial values from CotacaoFornecedor
  const freteVal    = cf ? decimalToNumber(cf.frete)    : 0;
  const descontoVal = cf ? decimalToNumber(cf.desconto) : 0;
  const vrDescontoVal = cf ? decimalToNumber(cf.vrDesconto) : 0;
  const despesasVal = cf ? decimalToNumber(cf.despesas) : 0;
  const seguroVal   = cf ? decimalToNumber(cf.seguro)   : 0;

  // Total itens (qty sum)
  const totalItensQtd = pedido.itens.reduce((s, i) => s + decimalToNumber(i.quantidade), 0);

  return (
    <div>
      <PageHeader
        title={`Pedido ${pedido.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
          { label: pedido.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={pedido.status} />
            <Button size="sm" variant="outline"
              className="border-green-500 text-green-700 hover:bg-green-50 gap-1.5"
              onClick={openWAModal}>
              <MessageCircle className="w-3.5 h-3.5" /> Encaminhar via WhatsApp
            </Button>
            {nextActions.map((action) => (
              <Button key={action.next} size="sm" variant={action.variant}
                onClick={() => changeStatus(action.next)} disabled={actioning}>
                {actioning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                {action.label}
              </Button>
            ))}
            {(pedido.status === "CONFIRMADO" || pedido.status === "EM_TRANSITO") && !pedido.conferencia && (
              <Button size="sm" onClick={registrarConferencia} disabled={actioning}>
                {actioning ? "Criando..." : "Registrar Conferência"}
              </Button>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* ── Seção Fornecedor ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Código fornecedor</Label>
              <Input value={codigoForn} readOnly className="font-mono bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Loja</Label>
              <Input value="01" readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Nome Fornecedor</Label>
              <Input value={fornNome} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Contato</Label>
              <Input value={pedido.fornecedor.contato ?? "—"} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">E-mail</Label>
              <Input value={pedido.fornecedor.email ?? "—"} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Proposta</Label>
              <Input value={propostaLabel} readOnly className="bg-gray-50 font-mono" />
            </div>
          </div>
        </div>

        {/* ── Seção Cotação / Financeiro ───────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Cotação</h2>
            {pedido.cotacao && (
              <Link
                href={`/suprimentos/cotacoes/${pedido.cotacao.id}`}
                className="text-xs text-blue-600 hover:underline"
              >
                {pedido.cotacao.numero}{pedido.cotacao.nome ? ` — ${pedido.cotacao.nome}` : ""}
              </Link>
            )}
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total itens</Label>
              <Input
                value={totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total Cotação</Label>
              <Input
                value={formatBRL(totalGeral)}
                readOnly
                className="bg-gray-50 text-right font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">% Desconto</Label>
              <Input
                value={descontoVal > 0 ? descontoVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vr Desconto</Label>
              <Input
                value={formatBRL(vrDescontoVal)}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Frete</Label>
              <Input
                value={freteVal > 0 ? freteVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Tipo Frete</Label>
              <Input
                value={cf?.tipoFrete ? (TIPO_FRETE_LABEL[cf.tipoFrete] ?? cf.tipoFrete) : "—"}
                readOnly
                className="bg-gray-50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Condição pagamento</Label>
              <Input
                value={cf?.condicoesPagamento ?? "—"}
                readOnly
                className="bg-gray-50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Despesas</Label>
              <Input
                value={despesasVal > 0 ? despesasVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Seguro</Label>
              <Input
                value={seguroVal > 0 ? seguroVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Entrega Prevista</Label>
              <Input
                value={pedido.dataEntregaPrevista ? formatDate(pedido.dataEntregaPrevista) : cf?.prazoEntregaDias ? `${cf.prazoEntregaDias} dias` : "—"}
                readOnly
                className="bg-gray-50"
              />
            </div>
            {pedido.conferencia && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Conferência</Label>
                <div className="flex items-center h-9 px-3 border border-gray-200 rounded-md bg-gray-50 gap-2">
                  <Link
                    href={`/suprimentos/conferencias/${pedido.conferencia.id}`}
                    className="text-sm text-blue-600 hover:underline font-medium"
                  >
                    {pedido.conferencia.numero}
                  </Link>
                  <StatusBadge status={pedido.conferencia.status} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Itens do Pedido ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Itens da cotação</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Total Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedido.itens.map((item) => {
                  const qtd    = decimalToNumber(item.quantidade);
                  const preco  = decimalToNumber(item.precoUnitario);
                  const vlItem = decimalToNumber(item.valorTotal) || qtd * preco;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.item.codigo}</td>
                      <td className="px-4 py-2 text-gray-800">{item.item.descricao}</td>
                      <td className="px-4 py-2 text-gray-600">{item.item.unidadeMedida}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Considera
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatBRL(preco)}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">{formatBRL(vlItem)}</td>
                    </tr>
                  );
                })}
                {pedido.itens.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center text-gray-400 text-sm">
                      Nenhum item no pedido
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-gray-900">
                    {formatBRL(totalGeral)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {pedido.observacoes && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-sm text-gray-800">Observações</h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{pedido.observacoes}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── WA Modal ─────────────────────────────────────────────────────────── */}
      {showWAModal && pedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Encaminhar via WhatsApp</h2>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{pedido.numero}</p>
                </div>
              </div>
              <button onClick={() => setShowWAModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

              {/* Destinatário */}
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase tracking-wide">Destinatário (opcional)</Label>
                {waUsersLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                  </div>
                ) : (
                  <div className="relative" ref={waDropdownRef}>
                    <button type="button"
                      onClick={() => { setWADropdownOpen((p) => !p); setWAUserSearch(""); }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border bg-white text-left transition-colors",
                        waDropdownOpen ? "border-green-400 ring-1 ring-green-200" : "border-gray-200 hover:border-gray-300"
                      )}>
                      {waAprovadorId ? (
                        <span className="text-gray-900 font-medium">
                          {waUsers.find((u) => u.id === waAprovadorId)?.nome ?? "—"}
                        </span>
                      ) : (
                        <span className="text-gray-400">Selecionar colaborador...</span>
                      )}
                      <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", waDropdownOpen && "rotate-180")} />
                    </button>

                    {waDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="relative border-b border-gray-100">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                          <input type="text" autoFocus
                            value={waUserSearch}
                            onChange={(e) => setWAUserSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent placeholder:text-gray-400"
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {(() => {
                            const q = waUserSearch.toLowerCase();
                            const filtered = waUsers.filter((u) => !q || u.nome.toLowerCase().includes(q));
                            if (filtered.length === 0) return <p className="px-4 py-3 text-sm text-gray-400 italic">Nenhum resultado.</p>;
                            return filtered.map((u) => (
                              <button key={u.id} type="button"
                                onClick={() => { setWAAprovadorId(u.id); setWADropdownOpen(false); setWAUserSearch(""); }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0",
                                  waAprovadorId === u.id && "bg-green-50"
                                )}>
                                <span className={cn("font-medium", waAprovadorId === u.id ? "text-green-700" : "text-gray-900")}>{u.nome}</span>
                                {u.telefone
                                  ? <span className="text-xs text-gray-400 font-mono">{u.telefone}</span>
                                  : <span className="text-xs text-red-400">sem telefone</span>}
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {waAprovadorId && (() => {
                  const a = waUsers.find((u) => u.id === waAprovadorId);
                  return a ? (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {a.telefone ? <span className="font-mono">{a.telefone}</span> : <span className="text-red-400">Sem telefone cadastrado</span>}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase tracking-wide">Mensagem</Label>
                <div className="bg-[#e9ffd9] border border-green-200 rounded-xl p-4 text-sm text-gray-800 font-mono leading-relaxed whitespace-pre-wrap select-all">
                  {buildWAMessage()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-2xl">
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowWAModal(false)}>
                  Fechar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={copyWAMessage}
                  className={cn("gap-1.5", waCopied && "border-green-400 text-green-700 bg-green-50")}>
                  <Copy className="w-3.5 h-3.5" />
                  {waCopied ? "Copiado!" : "Copiar mensagem"}
                </Button>
                <Button type="button" size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  onClick={openWhatsApp}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {waAprovadorId ? "Abrir no WhatsApp" : "Abrir WhatsApp Web"}
                </Button>
              </div>
              {waAprovadorId && (() => {
                const a = waUsers.find((u) => u.id === waAprovadorId);
                return (
                  <p className="text-xs text-gray-400 mt-2 text-right">
                    {a?.telefone
                      ? `Vai abrir conversa com ${a.nome} (${a.telefone})`
                      : `Abrirá o WhatsApp Web — selecione ${a?.nome} manualmente`}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
