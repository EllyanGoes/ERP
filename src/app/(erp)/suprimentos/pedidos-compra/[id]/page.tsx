"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import EscClose from "@/components/shared/EscClose";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import StatusBadge from "@/components/shared/StatusBadge";
import { Autoria } from "@/components/shared/Autoria";
import FinanceiroCompraBadge from "@/components/suprimentos/FinanceiroCompraBadge";
import ModalPortal from "@/components/shared/ModalPortal";
import DatePicker from "@/components/shared/DatePicker";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { MessageCircle, Copy, ExternalLink, Search, ChevronDown, X, Loader2, Users, FileInput, Link2, FileText, Pencil, Truck, XCircle } from "lucide-react";
import { CompraEmbutidaProvider, useDocumentoId } from "@/lib/compra-embutida";
import EditarPedidoTela from "@/app/(erp)/suprimentos/pedidos-compra/[id]/editar/page";
import { EtapaLayout, EtapaSecao, EtapaCampos, EtapaCampo, EtapaResumo, ForaDaCompra, tabela } from "@/components/compras/etapa/EtapaUI";
import CancelarCompraDialog from "@/components/compras/CancelarCompraDialog";


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
  id: string; numero: string; numeroCompra?: string | null; solicitante: string | null;
  justificativa: string | null;
  motivo: string | null;
  centroCusto:  { nome: string } | null;
  localEstoque: { nome: string } | null;
  setor:        { nome: string } | null;
};

type ContaPagarMin = {
  id: string; numero: string; status: string;
  valorOriginal: unknown; valorPago: unknown;
  dataVencimento: string | null; parcelaNumero: number | null; parcelaTotal: number | null;
};

type PedidoCompra = {
  id: string;
  empresaId: string;
  numero: string;
  numeroCompra?: string | null;
  status: string;
  statusFinanceiro?: string | null;
  contasPagar?: ContaPagarMin[];
  descricao: string | null;
  valorTotal: unknown;
  dataEntregaPrevista: string | null;
  createdAt?: string | null;
  observacoes: string | null;
  cotacaoId: string | null;
  necessidadeId: string | null;
  necessidade: NecessidadeMin | null;
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cotacao: {
    id: string; numero: string; numeroCompra?: string | null; nome: string | null;
    necessidade: {
      id: string; numero: string; numeroCompra?: string | null; solicitante: string | null;
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
  conferencia: { id: string; numero: string; numeroCompra?: string | null; status: string } | null;
  cotacaoFornecedor: CotacaoFornecedor | null;
  // Pendência de re-aprovação (pedido editado depois de aprovado)
  aprovacoes?: { id: string; aprovadorId: string; createdAt: string; aprovador: { nome: string } }[];
  criadoPor?: string | null;
  atualizadoPor?: string | null;
};

const TIPO_FRETE_LABEL: Record<string, string> = {
  C: "C-CIF",
  F: "F-FOB",
  T: "T-CIF/FOB",
  O: "Outro",
};


export default function PedidoCompraDetailPage() {
  const id = useDocumentoId();
  const router  = useRouter();
  const { user } = useSession();
  const isAdmin  = user?.perfil === "ADMIN";
  const [pedido, setPedido] = useState<PedidoCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  // Editar no lugar: a mesma aba vira o formulário (sem abrir outra tela).
  const [editando, setEditando] = useState(false);

  // ── Vincular Cotação popover ──────────────────────────────────────────────────
  const [ctPopoverOpen,  setCtPopoverOpen]  = useState(false);
  const [ctSearch,       setCtSearch]       = useState("");
  const [ctOptions,      setCtOptions]      = useState<{ id: string; numero: string; numeroCompra?: string | null; nome: string | null; necessidade: { numero: string; numeroCompra?: string | null } | null }[]>([]);
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
        const list = (json.data ?? []).filter((c: { numero: string; numeroCompra?: string | null; nome: string | null }) =>
          !q || c.numero.toLowerCase().includes(q) || (c.numeroCompra ?? "").toLowerCase().includes(q) || (c.nome ?? "").toLowerCase().includes(q)
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
          (n.numeroCompra ?? "").toLowerCase().includes(q) ||
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

  // ── Pagar um título do pedido (baixa de contas a pagar pelo detalhe) ────────
  const [cpAlvo, setCpAlvo] = useState<ContaPagarMin | null>(null);
  const [cpValor, setCpValor] = useState("");
  const [cpData, setCpData] = useState(new Date().toISOString().slice(0, 10));
  const [cpForma, setCpForma] = useState("");
  const [cpContaId, setCpContaId] = useState("");
  const [cpErro, setCpErro] = useState("");
  const [cpFormas, setCpFormas] = useState<{ id: string; nome: string; ativo?: boolean }[]>([]);
  const [cpContas, setCpContas] = useState<{ id: string; nome: string; tipo?: string; ativo?: boolean }[]>([]);

  function abrirPagar(c: ContaPagarMin) {
    const saldo = decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago);
    setCpAlvo(c);
    setCpValor(saldo > 0 ? saldo.toFixed(2).replace(".", ",") : "");
    setCpData(new Date().toISOString().slice(0, 10));
    setCpForma(""); setCpContaId(""); setCpErro("");
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setCpFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => {
      const cs = Array.isArray(j) ? j : (j.data ?? []);
      setCpContas(cs);
      setCpContaId((cs.find((x: { tipo?: string }) => x.tipo === "CAIXA") ?? cs[0])?.id ?? "");
    }).catch(() => {});
  }

  async function pagarTitulo() {
    if (!cpAlvo) return;
    const valor = parseFloat(cpValor.replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) { setCpErro("Informe o valor pago."); return; }
    if (!cpData) { setCpErro("Confirme a data."); return; }
    setActioning(true); setCpErro("");
    try {
      const res = await fetch(`/api/contas-pagar/${cpAlvo.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorPago: valor, dataPagamento: cpData, formaPagamento: cpForma || null, contaBancariaId: cpContaId || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setCpErro(j.error ?? "Não foi possível registrar o pagamento."); return; }
      setCpAlvo(null);
      await load();
    } finally { setActioning(false); }
  }

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

  // Re-aprovação: aprovador designado ou ADMIN decide direto aqui.
  const [aprovObs, setAprovObs] = useState("");
  const [aprovShowObs, setAprovShowObs] = useState(false);
  async function responderAprovacao(acao: "APROVAR" | "REPROVAR") {
    if (acao === "REPROVAR" && !aprovShowObs) { setAprovShowObs(true); return; }
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}/aprovacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, observacao: aprovObs || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro na operação"); return; }
      setAprovShowObs(false); setAprovObs("");
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

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

    // ── Solicitação (only if linked) — sem número: a compra tem um código só ──
    if (sc) {
      const setor = sc.centroCusto?.nome ?? sc.localEstoque?.nome ?? null;
      if (setor)              lines.push(`*Setor:* ${setor}`);
      if (sc.solicitante)     lines.push(`*Solicitante:* ${sc.solicitante}`);
      lines.push(`*Motivo:* ${sc.motivo ?? "—"}`);
      lines.push(`*Descrição:* ${sc.justificativa ?? "—"}`);
      lines.push(``);
    }

    // ── PC block ──────────────────────────────────────────────────────────────
    lines.push(`*Pedido de compra:* ${pedido.numero}`);
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

    lines.push(`*Total bruto:* ${formatBRL(msgSubtotal)}`);
    if (vrDesconto > 0)  lines.push(`*Desconto:* − ${formatBRL(vrDesconto)}`);
    if (freteMsg > 0)    lines.push(`*Frete:* ${formatBRL(freteMsg)}`);
    if (seguroMsg > 0)   lines.push(`*Seguro:* ${formatBRL(seguroMsg)}`);
    if (despesasMsg > 0) lines.push(`*Despesas:* ${formatBRL(despesasMsg)}`);
    lines.push(`*Total líquido:* ${formatBRL(msgTotal)}`);

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

  useTabTitle(pedido ? `Compra ${pedido.numeroCompra ?? pedido.numero}` : null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!pedido) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

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

  const sc = pedido.necessidade ?? pedido.cotacao?.necessidade ?? null;
  const scSetor = sc ? (sc.centroCusto?.nome ?? sc.setor?.nome ?? sc.localEstoque?.nome ?? null) : null;

  // Descrição: herdada da solicitação (vinculada pela cotação) quando o pedido não tem a sua.
  const descHasSc = !!pedido.cotacao?.necessidade;
  const scDescricao = pedido.cotacao?.necessidade?.justificativa ?? null;
  const descricaoExibida = descHasSc ? (pedido.descricao ?? scDescricao) : pedido.descricao;
  const descCanEdit = !descHasSc || isAdmin;

  const lateral = (
    <>
      {/* ── Valores ─────────────────────────────────────────────────────── */}
      <EtapaSecao titulo="Valores">
        <EtapaResumo
          linhas={[
            { rotulo: "Total itens", valor: totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) },
            { rotulo: "Total bruto", valor: formatBRL(subtotalVal) },
            ...(vrDescontoVal > 0 ? [{
              rotulo: `Desconto${descontoVal > 0 ? ` (${descontoVal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : ""}`,
              valor: <span className="text-danger">− {formatBRL(vrDescontoVal)}</span>,
            }] : []),
            ...(freteVal > 0 ? [{ rotulo: "Frete", valor: `+ ${formatBRL(freteVal)}` }] : []),
            ...(despesasVal > 0 ? [{ rotulo: "Despesas", valor: `+ ${formatBRL(despesasVal)}` }] : []),
            ...(seguroVal > 0 ? [{ rotulo: "Seguro", valor: `+ ${formatBRL(seguroVal)}` }] : []),
            { rotulo: "Total líquido", valor: formatBRL(netTotal), destaque: true },
          ]}
        />
      </EtapaSecao>

      {/* ── Contas a Pagar (gerado no Documento de Entrada pela condição) ── */}
      {pedido.contasPagar && pedido.contasPagar.length > 0 && (
        <EtapaSecao titulo="Contas a pagar" semPadding>
          <ul className="divide-y divide-border">
            {pedido.contasPagar.map((c) => {
              const saldo = decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago);
              const podePagar = c.status !== "PAGA" && c.status !== "CANCELADA";
              return (
                <li key={c.id} className="px-5 py-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-foreground">
                      {c.numero}
                      {c.parcelaTotal && c.parcelaTotal > 1 && (
                        <span className="ml-1.5 text-muted-foreground">{c.parcelaNumero}/{c.parcelaTotal}</span>
                      )}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {c.dataVencimento ? `Vence ${formatDate(c.dataVencimento)}` : <span className="italic">sem previsão</span>}
                    </span>
                    <span className="tabular-nums text-foreground">
                      {formatBRL(decimalToNumber(c.valorOriginal))}
                      <span className="text-muted-foreground"> · pago {formatBRL(decimalToNumber(c.valorPago))}</span>
                    </span>
                  </div>
                  {podePagar && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/contas-pagar?abrir=${c.id}`)}
                        className="h-7 gap-1 border-rose-200 text-danger hover:bg-danger/10">
                        Pagar{saldo > 0 ? ` ${formatBRL(saldo)}` : ""}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </EtapaSecao>
      )}

      {/* Vínculos SC/CT: dentro da compra as abas já mostram solicitação e
          cotação, e desvincular partiria a compra (o pedido seguiria com o
          número dela, mas sem a SC/CT). Só aparecem na tela própria do pedido. */}
      <ForaDaCompra>
      {/* ── Solicitação de Compras ────────────────────────────────────── */}
      <EtapaSecao
        titulo="Solicitação"
        className="overflow-visible"
        acoes={
          /* Vincular / desvincular SC (só a vinculada direto no pedido) */
          <div className="relative" ref={scPopoverRef}>
            {pedido.necessidade ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-red-500 gap-1"
                onClick={() => vincularNecessidade(null)}
                disabled={actioning}
                title="Desvincular solicitação"
              >
                <X className="w-3 h-3" /> Desvincular
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => { setScPopoverOpen((v) => !v); setScSearch(""); setScOptions([]); }}
                disabled={actioning}
              >
                <Link2 className="w-3 h-3" /> Vincular solicitação
              </Button>
            )}

            {/* Popover de busca SC */}
            {scPopoverOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-card rounded-xl border border-border shadow-xl">
                <div className="p-3 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={scSearch}
                      onChange={(e) => setScSearch(e.target.value)}
                      placeholder="Buscar solicitação… (compra, solicitante…)"
                      className="w-full pl-8 pr-3 h-8 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {scSearching ? (
                    <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
                    </div>
                  ) : scOptions.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground italic text-center">
                      {scSearch.trim() ? "Nenhuma solicitação encontrada." : "Nenhuma solicitação disponível."}
                    </p>
                  ) : scOptions.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onMouseDown={() => vincularNecessidade(n.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-indigo-50 dark:bg-indigo-500/15 border-b border-gray-50 last:border-0"
                    >
                      <span className="flex flex-col items-start">
                        <span className="font-mono font-semibold text-foreground">{n.numeroCompra ?? n.numero}</span>
                      </span>
                      <div className="text-right">
                        {n.solicitante && <p className="text-xs text-muted-foreground">{n.solicitante}</p>}
                        {(n.centroCusto?.nome ?? n.localEstoque?.nome ?? n.setor?.nome) && (
                          <p className="text-xs text-muted-foreground">
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
        }
      >
        {sc ? (
          <div className="space-y-4">
            <EtapaCampos colunas={2}>
              <ForaDaCompra>
                <EtapaCampo rotulo="Solicitante">{sc.solicitante}</EtapaCampo>
                <EtapaCampo rotulo={sc.centroCusto ? "Centro de custo" : sc.setor ? "Setor" : "Local"} span={2}>{scSetor}</EtapaCampo>
              </ForaDaCompra>
              <EtapaCampo rotulo="Justificativa" span={2}>{sc.justificativa}</EtapaCampo>
            </EtapaCampos>
            <ForaDaCompra>
              <Link
                href={`/compras/necessidades/${sc.id}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                <FileText className="w-3 h-3" />
                {sc.numeroCompra && sc.numeroCompra !== pedido.numeroCompra ? `Abrir solicitação · ${sc.numeroCompra}` : "Abrir solicitação"}
              </Link>
            </ForaDaCompra>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Nenhuma solicitação vinculada. Clique em &quot;Vincular solicitação&quot; para associar.
          </p>
        )}
      </EtapaSecao>

      {/* ── Cotação ─────────────────────────────────────────────────────── */}
      <EtapaSecao
        titulo="Cotação"
        className="overflow-visible"
        acoes={
          /* Vincular / desvincular CT */
          <div className="relative" ref={ctPopoverRef}>
            {pedido.cotacao ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-red-500 gap-1"
                onClick={() => vincularCotacao(null)}
                disabled={actioning}
                title="Desvincular cotação"
              >
                <X className="w-3 h-3" /> Desvincular
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => { setCtPopoverOpen((v) => !v); setCtSearch(""); setCtOptions([]); }}
                disabled={actioning}
              >
                <Link2 className="w-3 h-3" /> Vincular cotação
              </Button>
            )}

            {/* Popover de busca */}
            {ctPopoverOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-card rounded-xl border border-border shadow-xl">
                <div className="p-3 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={ctSearch}
                      onChange={(e) => setCtSearch(e.target.value)}
                      placeholder="Buscar cotação… (compra, nome…)"
                      className="w-full pl-8 pr-3 h-8 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {ctSearching ? (
                    <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
                    </div>
                  ) : ctOptions.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground italic text-center">
                      {ctSearch.trim() ? "Nenhuma cotação encontrada." : "Nenhuma cotação disponível."}
                    </p>
                  ) : ctOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => vincularCotacao(c.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-indigo-50 dark:bg-indigo-500/15 border-b border-gray-50 last:border-0"
                    >
                      <span className="flex flex-col items-start">
                        <span className="font-mono font-semibold text-foreground">{c.numeroCompra ?? c.necessidade?.numeroCompra ?? c.numero}</span>
                      </span>
                      <div className="text-right">
                        {c.nome && <p className="text-xs text-muted-foreground">{c.nome}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
      >
        {pedido.cotacao ? (
          <div className="space-y-4">
            <EtapaCampos colunas={2}>
              <EtapaCampo rotulo="Proposta">{cf ? <span className="font-mono">{propostaLabel}</span> : null}</EtapaCampo>
              {pedido.cotacao.nome && <EtapaCampo rotulo="Nome" span={2}>{pedido.cotacao.nome}</EtapaCampo>}
            </EtapaCampos>
            <ForaDaCompra>
              <Link
                href={`/suprimentos/cotacoes/${pedido.cotacao.id}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                <FileText className="w-3 h-3" />
                {pedido.cotacao.numeroCompra && pedido.cotacao.numeroCompra !== pedido.numeroCompra
                  ? `Abrir cotação · ${pedido.cotacao.numeroCompra}`
                  : "Abrir cotação"}
              </Link>
            </ForaDaCompra>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nenhuma cotação vinculada.</p>
        )}
      </EtapaSecao>
      </ForaDaCompra>
    </>
  );

  if (editando) {
    // O formulário de edição volta para cá ao salvar/cancelar (navega para a
    // rota do pedido): interceptamos e só saímos do modo edição.
    return (
      <CompraEmbutidaProvider
        docId={id}
        abrir={(href) => {
          if (href === `/suprimentos/pedidos-compra/${id}`) { setEditando(false); load(); return true; }
          return false;
        }}
      >
        <EditarPedidoTela />
      </CompraEmbutidaProvider>
    );
  }

  return (
    <div>
      <PageHeader
        title={pedido.numeroCompra ? `Compra ${pedido.numeroCompra} · Pedido${pedido.numero !== pedido.numeroCompra ? ` ${pedido.numero}` : ""}` : `Pedido ${pedido.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
          { label: pedido.numero },
        ]}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge status={pedido.status} />
            <FinanceiroCompraBadge status={pedido.statusFinanceiro} />
            {/* Editar: itens, preços, encargos… Depois de aprovado, salvar
                devolve o pedido para aprovação. */}
            {!["RECEBIDO", "CANCELADO"].includes(pedido.status) && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditando(true)}>
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
            )}
            {/* Status por ação (o seletor permitia "Recebido" sem entrada e
                "Aguard. aprovação" à mão). Recebido vem da entrada da nota. */}
            {["RASCUNHO", "ENVIADO"].includes(pedido.status) && (
              <Button size="sm" variant="outline" disabled={actioning} onClick={() => changeStatus("AGUARDANDO_PAGAMENTO")}>
                Emitir pedido
              </Button>
            )}
            {["AGUARDANDO_PAGAMENTO", "CONFIRMADO"].includes(pedido.status) && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={actioning} onClick={() => changeStatus("EM_TRANSITO")}>
                <Truck className="w-3.5 h-3.5" /> Marcar em trânsito
              </Button>
            )}
            {!["CANCELADO", "RECEBIDO"].includes(pedido.status) && (
              <Button
                size="sm" variant="outline" disabled={actioning}
                className="gap-1.5 text-danger hover:bg-danger/10"
                onClick={() => (pedido.numeroCompra ? setCancelarAberto(true) : changeStatus("CANCELADO"))}
              >
                <XCircle className="w-3.5 h-3.5" /> Cancelar
              </Button>
            )}

            {/* WhatsApp */}
            <Button size="sm" variant="outline"
              className="border-green-500 text-success hover:bg-success/10 gap-1.5"
              onClick={openWAModal}>
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </Button>

            {/* Gerar Doc. Entrada */}
            {!pedido.conferencia && pedido.status !== "CANCELADO" && (
              <Button size="sm" className="gap-1.5" onClick={() => router.push(`/suprimentos/conferencias/novo?pedidoId=${id}`)}>
                <FileInput className="w-3.5 h-3.5" />
                Dar entrada
              </Button>
            )}
          </div>
        }
      />

      <EtapaLayout lateral={lateral}>
        {actionError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* Faixa de re-aprovação: pedido editado depois de aprovado */}
        {pedido.status === "AGUARDANDO_APROVACAO" && (() => {
          const pend = pedido.aprovacoes?.[0] ?? null;
          const podeDecidir = isAdmin || (pend ? pend.aprovadorId === user?.id : false);
          return (
            <div className="bg-orange-500/10 border border-orange-300 rounded-xl px-4 py-3 text-sm space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-orange-700">Aguardando aprovação</span>
                <span className="text-muted-foreground">
                  {pend
                    ? <>Este pedido foi alterado depois de aprovado e aguarda a decisão de <span className="font-medium text-foreground">{pend.aprovador.nome}</span>.</>
                    : <>Este pedido foi alterado depois de aprovado. Não há aprovador configurado no fluxo Pedido de Compras — um administrador decide aqui.</>}
                </span>
              </div>
              {podeDecidir && (
                <div className="flex items-center gap-2 flex-wrap">
                  {aprovShowObs && (
                    <Input value={aprovObs} onChange={(e) => setAprovObs(e.target.value)} placeholder="Motivo da reprovação (opcional)" className="h-8 w-72 text-xs" />
                  )}
                  <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actioning} onClick={() => responderAprovacao("APROVAR")}>
                    Aprovar pedido
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-danger/30 text-danger hover:bg-danger/10" disabled={actioning} onClick={() => responderAprovacao("REPROVAR")}>
                    {aprovShowObs ? "Confirmar reprovação" : "Reprovar"}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Dados do pedido ─────────────────────────────────────────────── */}
        <EtapaSecao titulo="Dados do pedido">
          <EtapaCampos>
            {/* Status no selo da barra de ações; entrega e fornecedor no cabeçalho da compra. */}
            <EtapaCampo rotulo="Emissão">{pedido.createdAt ? formatDate(pedido.createdAt) : null}</EtapaCampo>
            <ForaDaCompra>
              <EtapaCampo rotulo="Entrega prevista">
                {pedido.dataEntregaPrevista ? formatDate(pedido.dataEntregaPrevista) : cf?.prazoEntregaDias ? `${cf.prazoEntregaDias} dias` : null}
              </EtapaCampo>
            </ForaDaCompra>
            <EtapaCampo rotulo="Condição de pagamento">{cf?.condicoesPagamento}</EtapaCampo>
            <EtapaCampo rotulo="Tipo de frete">{cf?.tipoFrete ? (TIPO_FRETE_LABEL[cf.tipoFrete] ?? cf.tipoFrete) : null}</EtapaCampo>
            {pedido.conferencia && (
              <ForaDaCompra>
                <EtapaCampo rotulo="Entrada">
                  <span className="inline-flex items-center gap-2">
                    <Link
                      href={`/suprimentos/conferencias/${pedido.conferencia.id}`}
                      className="text-info hover:underline font-medium"
                    >
                      {pedido.conferencia.numeroCompra && pedido.conferencia.numeroCompra !== pedido.numeroCompra
                        ? `Entrada · ${pedido.conferencia.numeroCompra}`
                        : "Entrada"}
                    </Link>
                    <StatusBadge status={pedido.conferencia.status} />
                  </span>
                </EtapaCampo>
              </ForaDaCompra>
            )}
            <EtapaCampo
              span={4}
              rotulo={
                <span className="inline-flex items-center gap-2">
                  Descrição
                  {descHasSc && (
                    <span className="normal-case tracking-normal text-[10px] text-info bg-info/10 border border-info/30 px-1.5 py-px rounded-full">
                      herdado da solicitação
                    </span>
                  )}
                </span>
              }
            >
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
                <span>
                  {descricaoExibida}
                  {descCanEdit && (
                    <button
                      onClick={() => { setDescricaoEdit(pedido.descricao ?? scDescricao ?? ""); setEditingDescricao(true); }}
                      className="ml-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Editar
                    </button>
                  )}
                </span>
              ) : descCanEdit ? (
                <button
                  onClick={() => { setDescricaoEdit(""); setEditingDescricao(true); }}
                  className="text-sm text-muted-foreground hover:text-foreground italic transition-colors"
                >
                  + Adicionar descrição
                </button>
              ) : null}
            </EtapaCampo>
          </EtapaCampos>
        </EtapaSecao>

        {/* ── Fornecedor ──────────────────────────────────────────────────── */}
        <EtapaSecao titulo="Fornecedor">
          <EtapaCampos>
            <ForaDaCompra>
              <EtapaCampo rotulo="Nome" span={2}>{fornNome}</EtapaCampo>
            </ForaDaCompra>
            <EtapaCampo rotulo="CNPJ/CPF">{pedido.fornecedor.cpfCnpj}</EtapaCampo>
            <EtapaCampo rotulo="Código"><span className="font-mono">{codigoForn}</span></EtapaCampo>
            <EtapaCampo rotulo="Contato" span={2}>{pedido.fornecedor.contato}</EtapaCampo>
            <EtapaCampo rotulo="E-mail" span={2}>{pedido.fornecedor.email}</EtapaCampo>
          </EtapaCampos>
        </EtapaSecao>

        {/* ── Itens do Pedido ───────────────────────────────────────────── */}
        <EtapaSecao titulo="Itens" semPadding>
          <div className="overflow-x-auto">
            <table className={tabela.table}>
              <thead className={tabela.thead}>
                <tr>
                  <th className={tabela.th}>Código</th>
                  <th className={tabela.th}>Descrição</th>
                  <th className={tabela.thNum}>Qtd</th>
                  <th className={tabela.th}>Un</th>
                  <th className={tabela.thNum}>Preço</th>
                  <th className={tabela.thNum}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pedido.itens.map((item) => {
                  const qtd    = decimalToNumber(item.quantidade);
                  const preco  = decimalToNumber(item.precoUnitario);
                  const vlItem = decimalToNumber(item.valorTotal) || qtd * preco;
                  return (
                    <tr key={item.id} className={tabela.tr}>
                      <td className={tabela.tdCodigo}>{item.item.codigo}</td>
                      <td className={tabela.td}>{item.item.descricao}</td>
                      <td className={tabela.tdNum}>
                        {qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                      </td>
                      <td className={cn(tabela.td, "text-muted-foreground")}>{item.item.unidadeMedida}</td>
                      <td className={tabela.tdNum}>{formatBRL(preco)}</td>
                      <td className={cn(tabela.tdNum, "font-medium")}>{formatBRL(vlItem)}</td>
                    </tr>
                  );
                })}
                {pedido.itens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-muted-foreground text-sm">
                      Nenhum item no pedido
                    </td>
                  </tr>
                )}
              </tbody>
              {pedido.itens.length > 0 && (
                <tfoot className={tabela.tfoot}>
                  <tr>
                    <td colSpan={2} className={tabela.td}>Total bruto</td>
                    <td className={tabela.tdNum}>{totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                    <td colSpan={2} />
                    <td className={tabela.tdNum}>{formatBRL(subtotalVal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </EtapaSecao>

        {pedido.observacoes && (
          <EtapaSecao titulo="Observações">
            <p className="text-sm text-foreground whitespace-pre-wrap">{pedido.observacoes}</p>
          </EtapaSecao>
        )}

        <Autoria criadoPor={pedido.criadoPor} atualizadoPor={pedido.atualizadoPor} />
      </EtapaLayout>

      {/* ── WA Modal ─────────────────────────────────────────────────────────── */}
      {showWAModal && pedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <EscClose onClose={() => setShowWAModal(false)} />
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-success" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Encaminhar via WhatsApp</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{pedido.numero}</p>
                </div>
              </div>
              <button onClick={() => setShowWAModal(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

              {/* Destinatário */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Destinatário (opcional)</Label>
                {waUsersLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                  </div>
                ) : (
                  <div className="relative" ref={waDropdownRef}>
                    <button type="button"
                      onClick={() => { setWADropdownOpen((p) => !p); setWAUserSearch(""); }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border bg-card text-left transition-colors",
                        waDropdownOpen ? "border-green-400 ring-1 ring-green-200" : "border-border hover:border-border"
                      )}>
                      {waAprovadorId ? (
                        <span className="text-foreground font-medium">
                          {waUsers.find((u) => u.id === waAprovadorId)?.nome ?? "—"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecionar colaborador...</span>
                      )}
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", waDropdownOpen && "rotate-180")} />
                    </button>

                    {waDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                        <div className="relative border-b border-border">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <input type="text" autoFocus
                            value={waUserSearch}
                            onChange={(e) => setWAUserSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent placeholder:text-muted-foreground"
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {(() => {
                            const q = waUserSearch.toLowerCase();
                            const filtered = waUsers.filter((u) => !q || u.nome.toLowerCase().includes(q));
                            if (filtered.length === 0) return <p className="px-4 py-3 text-sm text-muted-foreground italic">Nenhum resultado.</p>;
                            return filtered.map((u) => (
                              <button key={u.id} type="button"
                                onClick={() => { setWAAprovadorId(u.id); setWADropdownOpen(false); setWAUserSearch(""); }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b border-gray-50 last:border-0",
                                  waAprovadorId === u.id && "bg-success/10"
                                )}>
                                <span className={cn("font-medium", waAprovadorId === u.id ? "text-success" : "text-foreground")}>{u.nome}</span>
                                {u.telefone
                                  ? <span className="text-xs text-muted-foreground font-mono">{u.telefone}</span>
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
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {a.telefone ? <span className="font-mono">{a.telefone}</span> : <span className="text-red-400">Sem telefone cadastrado</span>}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Mensagem</Label>
                <div className="bg-[#e9ffd9] border border-success/30 rounded-xl p-4 text-sm text-foreground font-mono leading-relaxed whitespace-pre-wrap select-all">
                  {buildWAMessage()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border shrink-0 bg-muted rounded-b-2xl">
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowWAModal(false)}>
                  Fechar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={copyWAMessage}
                  className={cn("gap-1.5", waCopied && "border-green-400 text-success bg-success/10")}>
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
                  <p className="text-xs text-muted-foreground mt-2 text-right">
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

      {cpAlvo && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={() => !actioning && setCpAlvo(null)}>
            <EscClose onClose={() => { if (!actioning) setCpAlvo(null); }} />
            <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
              <div>
                <h3 className="font-bold text-foreground">Pagar título {cpAlvo.numero}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Registra o pagamento (parcial ou total) e lança no caixa.</p>
              </div>
              {cpErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{cpErro}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Valor pago *</Label>
                  <input value={cpValor} onChange={(e) => setCpValor(e.target.value)} placeholder="0,00"
                    className="w-full h-10 rounded-lg border border-border px-3 text-sm text-right font-mono bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data *</Label>
                  <DatePicker value={cpData} onChange={(v) => setCpData(v)} className="w-full" triggerClassName="h-10" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Forma de pagamento</Label>
                <ComboboxWithCreate value={cpForma} onChange={(v) => setCpForma(v)}
                  noneLabel="— Selecionar —" triggerClassName="h-10 rounded-lg"
                  options={cpFormas.filter((f) => f.ativo !== false).map((f) => ({ value: f.nome, label: f.nome }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conta de origem</Label>
                <ComboboxWithCreate value={cpContaId} onChange={(v) => setCpContaId(v)}
                  allowNone={false} triggerClassName="h-10 rounded-lg"
                  options={cpContas.filter((c) => c.ativo !== false).map((c) => ({ value: c.id, label: c.nome }))} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setCpAlvo(null)} disabled={actioning}>Cancelar</Button>
                <Button onClick={pagarTitulo} disabled={actioning} className="bg-rose-600 hover:bg-rose-700 font-semibold">
                  {actioning ? "Pagando..." : "Confirmar pagamento"}
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {pedido.numeroCompra && (
        <CancelarCompraDialog
          open={cancelarAberto}
          onOpenChange={setCancelarAberto}
          numeroCompra={pedido.numeroCompra}
          empresaId={pedido.empresaId}
          pedidoNumero={pedido.numero}
          onCancelarSoPedido={() => changeStatus("CANCELADO")}
          onConcluido={load}
        />
      )}
    </div>
  );
}
