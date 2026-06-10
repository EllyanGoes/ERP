"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Copy, ExternalLink, Search, ChevronDown, X, Loader2, Users, CheckCircle2, FileInput, Link2, FileText } from "lucide-react";

const STATUS_FLOW: { value: string; label: string }[] = [
  { value: "AGUARDANDO_PAGAMENTO", label: "Aguard. Pagamento" },
  { value: "EM_TRANSITO",          label: "Em Trânsito"       },
  { value: "RECEBIDO",             label: "Recebido"          },
  { value: "CANCELADO",            label: "Cancelado"         },
];

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

type NecessidadeMin = {
  id: string; numero: string; solicitante: string | null;
  justificativa: string | null;
  motivo: string | null;
  centroCusto:  { nome: string } | null;
  localEstoque: { nome: string } | null;
  setor:        { nome: string } | null;
};

type PedidoCompra = {
  id: string;
  numero: string;
  status: string;
  descricao: string | null;
  valorTotal: unknown;
  dataEntregaPrevista: string | null;
  observacoes: string | null;
  cotacaoId: string | null;
  necessidadeId: string | null;
  necessidade: NecessidadeMin | null;
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cotacao: {
    id: string; numero: string; nome: string | null;
    necessidade: {
      id: string; numero: string; solicitante: string | null;
      justificativa: string | null;
      motivo: string | null;
      centroCusto:  { nome: string } | null;
      localEstoque: { nome: string } | null;
      setor:        { nome: string } | null;
      itens: Array<{ quantidade: unknown; item: { descricao: string } }>;
    } | null;
  } | null;
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


export default function PedidoCompraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useSession();
  const isAdmin  = user?.perfil === "ADMIN";
  const [pedido, setPedido] = useState<PedidoCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);

  // ── Vincular Cotação popover ──────────────────────────────────────────────────
  const [ctPopoverOpen,  setCtPopoverOpen]  = useState(false);
  const [ctSearch,       setCtSearch]       = useState("");
  const [ctOptions,      setCtOptions]      = useState<{ id: string; numero: string; nome: string | null; necessidade: { numero: string } | null }[]>([]);
  const [ctSearching,    setCtSearching]    = useState(false);
  const ctPopoverRef = useRef<HTMLDivElement>(null);

  // ── Vincular SC popover ───────────────────────────────────────────────────────
  const [scPopoverOpen,  setScPopoverOpen]  = useState(false);
  const [scSearch,       setScSearch]       = useState("");
  const [scOptions,      setScOptions]      = useState<NecessidadeMin[]>([]);
  const [scSearching,    setScSearching]    = useState(false);
  const scPopoverRef = useRef<HTMLDivElement>(null);

  // ── Descrição inline edit ─────────────────────────────────────────────────────
  const [editingDescricao, setEditingDescricao] = useState(false);
  const [descricaoEdit,    setDescricaoEdit]    = useState("");
  const [savingDescricao,  setSavingDescricao]  = useState(false);

  async function saveDescricao() {
    if (!pedido) return;
    setSavingDescricao(true);
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricaoEdit.trim() || null }),
      });
      if (res.ok) { await load(); setEditingDescricao(false); }
    } catch { /* ignore */ }
    finally { setSavingDescricao(false); }
  }

  // ── WA modal state ────────────────────────────────────────────────────────────
  const [showWAModal,    setShowWAModal]    = useState(false);
  const [waAprovadorId,  setWAAprovadorId]  = useState("");
  const [waUserSearch,   setWAUserSearch]   = useState("");
  const [waDropdownOpen, setWADropdownOpen] = useState(false);
  const [waUsers,        setWAUsers]        = useState<WAUser[]>([]);
  const [waUsersLoading, setWAUsersLoading] = useState(false);
  const [waCopied,       setWACopied]       = useState(false);
  const waDropdownRef = useRef<HTMLDivElement>(null);

  // Close CT popover on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ctPopoverRef.current && !ctPopoverRef.current.contains(e.target as Node))
        setCtPopoverOpen(false);
    }
    if (ctPopoverOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ctPopoverOpen]);

  // Close SC popover on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (scPopoverRef.current && !scPopoverRef.current.contains(e.target as Node))
        setScPopoverOpen(false);
    }
    if (scPopoverOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [scPopoverOpen]);

  // Search cotações while typing (or show all on open)
  useEffect(() => {
    if (!ctPopoverOpen) return;
    const t = setTimeout(async () => {
      setCtSearching(true);
      try {
        const res  = await fetch(`/api/suprimentos/cotacoes`);
        const json = await res.json();
        const q    = ctSearch.toLowerCase().trim();
        const list = (json.data ?? []).filter((c: { numero: string; nome: string | null }) =>
          !q || c.numero.toLowerCase().includes(q) || (c.nome ?? "").toLowerCase().includes(q)
        );
        setCtOptions(list.slice(0, 15));
      } catch { /* ignore */ }
      finally { setCtSearching(false); }
    }, ctSearch.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [ctSearch, ctPopoverOpen]);

  // Search necessidades (SC) while typing (or show all on open)
  useEffect(() => {
    if (!scPopoverOpen) return;
    const t = setTimeout(async () => {
      setScSearching(true);
      try {
        const res  = await fetch(`/api/suprimentos/necessidades`);
        const json = await res.json();
        const q    = scSearch.toLowerCase().trim();
        const list = ((json.data ?? []) as NecessidadeMin[]).filter((n) =>
          !q ||
          n.numero.toLowerCase().includes(q) ||
          (n.solicitante ?? "").toLowerCase().includes(q) ||
          (n.justificativa ?? "").toLowerCase().includes(q)
        );
        setScOptions(list.slice(0, 15));
      } catch { /* ignore */ }
      finally { setScSearching(false); }
    }, scSearch.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [scSearch, scPopoverOpen]);

  async function vincularCotacao(cotacaoId: string | null) {
    setActioning(true);
    try {
      const res  = await fetch(`/api/suprimentos/pedidos-compra/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ vincularCotacao: cotacaoId }),
      });
      if (res.ok) {
        await load();
        setCtPopoverOpen(false);
        setCtSearch("");
        setCtOptions([]);
      }
    } catch { /* ignore */ }
    finally { setActioning(false); }
  }

  async function vincularNecessidade(necessidadeId: string | null) {
    setActioning(true);
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ vincularNecessidade: necessidadeId }),
      });
      if (res.ok) {
        await load();
        setScPopoverOpen(false);
        setScSearch("");
        setScOptions([]);
      }
    } catch { /* ignore */ }
    finally { setActioning(false); }
  }

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
    const cf  = pedido.cotacaoFornecedor;
    const sc  = pedido.necessidade ?? pedido.cotacao?.necessidade ?? null;
    const total = calcTotal();

    const itensLines = pedido.itens.map((it, i) => {
      const qtd   = decimalToNumber(it.quantidade);
      const preco = decimalToNumber(it.precoUnitario);
      const tot   = decimalToNumber(it.valorTotal) || qtd * preco;
      return `  ${i + 1}. ${it.item.descricao} — ${qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${it.item.unidadeMedida} × ${formatBRL(preco)} = ${formatBRL(tot)}`;
    });

    const lines: string[] = [];

    // ── Empresa do pedido ──────────────────────────────────────────────────────
    const empresaNome = pedido.empresa ? (pedido.empresa.nomeFantasia || pedido.empresa.razaoSocial) : null;
    if (empresaNome) {
      lines.push(`*Empresa:* ${empresaNome}`);
      lines.push(``);
    }

    // ── SC block (only if linked) ──────────────────────────────────────────────
    if (sc) {
      lines.push(`*SC:* ${sc.numero}`);
      const setor = sc.centroCusto?.nome ?? sc.localEstoque?.nome ?? null;
      if (setor)              lines.push(`*Setor:* ${setor}`);
      if (sc.solicitante)     lines.push(`*Solicitante:* ${sc.solicitante}`);
      lines.push(`*Motivo:* ${sc.motivo ?? "—"}`);
      lines.push(`*Descrição:* ${sc.justificativa ?? "—"}`);
      lines.push(``);
    }

    // ── PC block ──────────────────────────────────────────────────────────────
    lines.push(`*PC:* ${pedido.numero.replace(/^PC-/, "")}`);
    lines.push(`*Fornecedor:* ${pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial}`);
    if (cf?.condicoesPagamento) lines.push(`*Cond. Pagamento:* ${cf.condicoesPagamento}`);
    if (pedido.dataEntregaPrevista) lines.push(`*Entrega Prevista:* ${formatDate(pedido.dataEntregaPrevista)}`);
    lines.push(``);

    // ── Items ──────────────────────────────────────────────────────────────────
    lines.push(`*Itens (${pedido.itens.length}):*`);
    lines.push(...itensLines);
    lines.push(``);

    // ── Totals ─────────────────────────────────────────────────────────────────
    const vrDesconto  = decimalToNumber(cf?.vrDesconto);
    const freteMsg    = decimalToNumber(cf?.frete);
    const seguroMsg   = decimalToNumber(cf?.seguro);
    const despesasMsg = decimalToNumber(cf?.despesas);

    const msgSubtotal = pedido.itens.reduce((sum, it) => {
      const vlItem = decimalToNumber(it.valorTotal);
      const qtd    = decimalToNumber(it.quantidade);
      const preco  = decimalToNumber(it.precoUnitario);
      return sum + (vlItem > 0 ? vlItem : qtd * preco);
    }, 0);
    const msgTotal = msgSubtotal - vrDesconto + freteMsg + seguroMsg + despesasMsg;

    lines.push(`*Subtotal:* ${formatBRL(msgSubtotal)}`);
    if (vrDesconto > 0)  lines.push(`*Desconto:* − ${formatBRL(vrDesconto)}`);
    if (freteMsg > 0)    lines.push(`*Frete:* ${formatBRL(freteMsg)}`);
    if (seguroMsg > 0)   lines.push(`*Seguro:* ${formatBRL(seguroMsg)}`);
    if (despesasMsg > 0) lines.push(`*Despesas:* ${formatBRL(despesasMsg)}`);
    lines.push(`*Total:* ${formatBRL(msgTotal)}`);

    if (pedido.observacoes) lines.push(``, `_Obs: ${pedido.observacoes}_`);

    return lines.join("\n");
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

  useTabTitle(pedido ? pedido.numero : null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!pedido) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const totalGeral  = calcTotal();
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

  // Subtotal = sum of item values; netTotal = subtotal − discount + extras
  const subtotalVal = pedido.itens.reduce((s, it) => {
    const v = decimalToNumber(it.valorTotal);
    const q = decimalToNumber(it.quantidade);
    const p = decimalToNumber(it.precoUnitario);
    return s + (v > 0 ? v : q * p);
  }, 0);
  const netTotal = subtotalVal - vrDescontoVal + freteVal + despesasVal + seguroVal;

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
            {/* Status inline selector */}
            <Select
              value={pedido.status}
              onValueChange={(v) => changeStatus(v)}
              disabled={actioning || pedido.status === "CANCELADO" || pedido.status === "RECEBIDO"}
            >
              <SelectTrigger className="h-8 w-48 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FLOW.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* WhatsApp */}
            <Button size="sm" variant="outline"
              className="border-green-500 text-green-700 hover:bg-green-50 gap-1.5"
              onClick={openWAModal}>
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </Button>

            {/* Gerar Doc. Entrada */}
            {!pedido.conferencia && pedido.status !== "CANCELADO" && (
              <Button size="sm" className="gap-1.5" onClick={() => router.push(`/suprimentos/conferencias/novo?pedidoId=${id}`)}>
                <FileInput className="w-3.5 h-3.5" />
                Gerar Doc. Entrada
              </Button>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* ── Descrição ──────────────────────────────────────────────────── */}
        {(() => {
          const hasSc = !!pedido.cotacao?.necessidade;
          const scDescricao = pedido.cotacao?.necessidade?.justificativa ?? null;
          const descricaoExibida = hasSc ? (pedido.descricao ?? scDescricao) : pedido.descricao;
          const canEdit = !hasSc || isAdmin;

          if (!descricaoExibida && !canEdit) return null;

          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="font-semibold text-sm text-gray-800">Descrição</h2>
                <div className="flex items-center gap-2">
                  {hasSc && (
                    <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      Herdado da SC
                    </span>
                  )}
                  {canEdit && !editingDescricao && (
                    <button
                      onClick={() => { setDescricaoEdit(pedido.descricao ?? scDescricao ?? ""); setEditingDescricao(true); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4">
                {editingDescricao ? (
                  <div className="flex gap-2 items-start">
                    <Input
                      autoFocus
                      value={descricaoEdit}
                      onChange={(e) => setDescricaoEdit(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveDescricao(); if (e.key === "Escape") setEditingDescricao(false); }}
                      placeholder="Descrição do pedido..."
                      className="flex-1"
                    />
                    <Button size="sm" onClick={saveDescricao} disabled={savingDescricao} className="shrink-0">
                      {savingDescricao ? <Loader2 className="w-3 h-3 animate-spin" /> : "Salvar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDescricao(false)} className="shrink-0">
                      Cancelar
                    </Button>
                  </div>
                ) : descricaoExibida ? (
                  <p className="text-sm text-gray-700">{descricaoExibida}</p>
                ) : (
                  <button
                    onClick={() => { setDescricaoEdit(""); setEditingDescricao(true); }}
                    className="text-sm text-gray-400 hover:text-gray-600 italic transition-colors"
                  >
                    + Adicionar descrição
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Solicitação de Compras ────────────────────────────────────── */}
        {(() => {
          const sc = pedido.necessidade ?? pedido.cotacao?.necessidade ?? null;
          return (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex items-center justify-between gap-3">
                <h2 className="font-semibold text-sm text-gray-800">Solicitação de Compras</h2>

                <div className="flex items-center gap-2 ml-auto">
                  {/* Link to SC */}
                  {sc && (
                    <Link
                      href={`/compras/necessidades/${sc.id}`}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium"
                    >
                      <FileText className="w-3 h-3" />
                      {sc.numero}
                      {sc.solicitante && (
                        <span className="text-gray-400 font-normal ml-1">· {sc.solicitante}</span>
                      )}
                    </Link>
                  )}

                  {/* Vincular / desvincular SC button (only for directly linked) */}
                  <div className="relative" ref={scPopoverRef}>
                    {pedido.necessidade ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-gray-400 hover:text-red-500 gap-1"
                        onClick={() => vincularNecessidade(null)}
                        disabled={actioning}
                        title="Desvincular SC"
                      >
                        <X className="w-3 h-3" /> Desvincular SC
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs gap-1.5"
                        onClick={() => { setScPopoverOpen((v) => !v); setScSearch(""); setScOptions([]); }}
                        disabled={actioning}
                      >
                        <Link2 className="w-3 h-3" /> Vincular SC
                      </Button>
                    )}

                    {/* Popover de busca SC */}
                    {scPopoverOpen && (
                      <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-white rounded-xl border border-gray-200 shadow-xl">
                        <div className="p-3 border-b border-gray-100">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <input
                              autoFocus
                              type="text"
                              value={scSearch}
                              onChange={(e) => setScSearch(e.target.value)}
                              placeholder="Buscar SC… (número, solicitante…)"
                              className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {scSearching ? (
                            <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-gray-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
                            </div>
                          ) : scOptions.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-gray-400 italic text-center">
                              {scSearch.trim() ? "Nenhuma SC encontrada." : "Nenhuma SC disponível."}
                            </p>
                          ) : scOptions.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onMouseDown={() => vincularNecessidade(n.id)}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-gray-50 last:border-0"
                            >
                              <span className="font-mono font-semibold text-gray-800">{n.numero}</span>
                              <div className="text-right">
                                {n.solicitante && <p className="text-xs text-gray-600">{n.solicitante}</p>}
                                {(n.centroCusto?.nome ?? n.localEstoque?.nome ?? n.setor?.nome) && (
                                  <p className="text-xs text-gray-400">
                                    {n.centroCusto?.nome ?? n.localEstoque?.nome ?? n.setor?.nome}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SC info body */}
              {sc ? (
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Número SC</Label>
                    <Input value={sc.numero} readOnly className="bg-gray-50 font-mono" />
                  </div>
                  {sc.solicitante && (
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Solicitante</Label>
                      <Input value={sc.solicitante} readOnly className="bg-gray-50" />
                    </div>
                  )}
                  {(sc.centroCusto?.nome ?? sc.localEstoque?.nome ?? sc.setor?.nome) && (
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">
                        {sc.centroCusto ? "Centro de Custo" : sc.setor ? "Setor" : "Local"}
                      </Label>
                      <Input
                        value={sc.centroCusto?.nome ?? sc.setor?.nome ?? sc.localEstoque?.nome ?? ""}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                  )}
                  {sc.justificativa && (
                    <div className="col-span-full space-y-1">
                      <Label className="text-xs text-gray-500">Justificativa</Label>
                      <Input value={sc.justificativa} readOnly className="bg-gray-50" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-gray-400 italic">
                  Nenhuma SC vinculada. Clique em &quot;Vincular SC&quot; para associar.
                </div>
              )}
            </div>
          );
        })()}

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
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex items-center justify-between gap-3">
            <h2 className="font-semibold text-sm text-gray-800">Cotação</h2>

            <div className="flex items-center gap-2 ml-auto">
              {/* Link to cotação */}
              {pedido.cotacao && (
                <Link
                  href={`/suprimentos/cotacoes/${pedido.cotacao.id}`}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium"
                >
                  <FileText className="w-3 h-3" />
                  {pedido.cotacao.numero}{pedido.cotacao.nome ? ` — ${pedido.cotacao.nome}` : ""}
                  {pedido.cotacao.necessidade && (
                    <span className="text-gray-400 font-normal ml-1">
                      · SC {pedido.cotacao.necessidade.numero}
                    </span>
                  )}
                </Link>
              )}

              {/* Vincular / desvincular CT button */}
              <div className="relative" ref={ctPopoverRef}>
                {pedido.cotacao ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-gray-400 hover:text-red-500 gap-1"
                    onClick={() => vincularCotacao(null)}
                    disabled={actioning}
                    title="Desvincular Cotação"
                  >
                    <X className="w-3 h-3" /> Desvincular CT
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs gap-1.5"
                    onClick={() => { setCtPopoverOpen((v) => !v); setCtSearch(""); setCtOptions([]); }}
                    disabled={actioning}
                  >
                    <Link2 className="w-3 h-3" /> Vincular CT
                  </Button>
                )}

                {/* Popover de busca */}
                {ctPopoverOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-white rounded-xl border border-gray-200 shadow-xl">
                    <div className="p-3 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                          autoFocus
                          type="text"
                          value={ctSearch}
                          onChange={(e) => setCtSearch(e.target.value)}
                          placeholder="Buscar cotação… (ex: CT-2025-0001)"
                          className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {ctSearching ? (
                        <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-gray-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
                        </div>
                      ) : ctOptions.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-gray-400 italic text-center">
                          {ctSearch.trim() ? "Nenhuma cotação encontrada." : "Nenhuma cotação disponível."}
                        </p>
                      ) : ctOptions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => vincularCotacao(c.id)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-gray-50 last:border-0"
                        >
                          <span className="font-mono font-semibold text-gray-800">{c.numero}</span>
                          <div className="text-right">
                            {c.nome && <p className="text-xs text-gray-600">{c.nome}</p>}
                            {c.necessidade && (
                              <p className="text-xs text-gray-400">SC {c.necessidade.numero}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
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
              <Label className="text-xs text-gray-500">Subtotal</Label>
              <Input
                value={formatBRL(subtotalVal)}
                readOnly
                className="bg-gray-50 text-right"
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
              <Label className="text-xs text-gray-500">Total</Label>
              <Input
                value={formatBRL(netTotal)}
                readOnly
                className="bg-gray-50 text-right font-semibold text-gray-900"
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
                <Label className="text-xs text-gray-500">Doc. Entrada</Label>
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
                  <td colSpan={6} className="px-4 py-1.5 text-right text-sm text-gray-500">Subtotal</td>
                  <td className="px-4 py-1.5 text-right text-sm text-gray-700">{formatBRL(subtotalVal)}</td>
                </tr>
                {vrDescontoVal > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-1.5 text-right text-sm text-gray-500">
                      Desconto{descontoVal > 0 ? ` (${descontoVal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : ""}
                    </td>
                    <td className="px-4 py-1.5 text-right text-sm text-red-600">− {formatBRL(vrDescontoVal)}</td>
                  </tr>
                )}
                {freteVal > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-1.5 text-right text-sm text-gray-500">Frete</td>
                    <td className="px-4 py-1.5 text-right text-sm text-gray-700">+ {formatBRL(freteVal)}</td>
                  </tr>
                )}
                {despesasVal > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-1.5 text-right text-sm text-gray-500">Despesas</td>
                    <td className="px-4 py-1.5 text-right text-sm text-gray-700">+ {formatBRL(despesasVal)}</td>
                  </tr>
                )}
                {seguroVal > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-1.5 text-right text-sm text-gray-500">Seguro</td>
                    <td className="px-4 py-1.5 text-right text-sm text-gray-700">+ {formatBRL(seguroVal)}</td>
                  </tr>
                )}
                <tr className="border-t border-gray-200">
                  <td colSpan={6} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">Total</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{formatBRL(netTotal)}</td>
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
