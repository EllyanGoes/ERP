"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { MessageCircle, Copy, ExternalLink, Search, ChevronDown, X, Loader2, Users } from "lucide-react";
import { Label } from "@/components/ui/label";

type WAUser = { id: string; nome: string; telefone: string | null };

type PedidoCompra = {
  id: string;
  numero: string;
  status: string;
  valorTotal: unknown;
  dataEntregaPrevista: string | null;
  observacoes: string | null;
  cotacaoId: string | null;
  cotacao: { id: string; numero: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    precoUnitario: unknown;
    valorTotal: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
  conferencia: { id: string; numero: string; status: string } | null;
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

  // Close WA dropdown on outside click
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

  // ── WA helpers ────────────────────────────────────────────────────────────────
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

  // ── Derived ──────────────────────────────────────────────────────────────────
  function calcTotal() {
    if (!pedido) return 0;
    const fromDB = decimalToNumber(pedido.valorTotal);
    if (fromDB > 0) return fromDB;
    // Fallback: sum from items
    return pedido.itens.reduce((sum, it) => {
      const vlItem = decimalToNumber(it.valorTotal);
      const qtd    = decimalToNumber(it.quantidade);
      const preco  = decimalToNumber(it.precoUnitario);
      return sum + (vlItem > 0 ? vlItem : qtd * preco);
    }, 0);
  }

  useTabTitle(pedido ? `PC ${pedido.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-gray-400">Carregando...</div>;
  if (!pedido) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const totalGeral  = calcTotal();
  const nextActions = STATUS_NEXT[pedido.status] ?? [];

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
            <Button size="sm" variant="outline"
              className="border-green-500 text-green-700 hover:bg-green-50 gap-1.5"
              onClick={openWAModal}>
              <MessageCircle className="w-3.5 h-3.5" /> Encaminhar via WhatsApp
            </Button>
            <StatusBadge status={pedido.status} />
          </div>
        }
      />
      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* Info */}
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Fornecedor</p>
              <p className="text-sm font-medium">
                <Link href={`/suprimentos/fornecedores/${pedido.fornecedor.id}`} className="text-blue-600 hover:underline">
                  {pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial}
                </Link>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cotação</p>
              <p className="text-sm font-medium">
                {pedido.cotacao ? (
                  <Link href={`/suprimentos/cotacoes/${pedido.cotacao.id}`} className="text-blue-600 hover:underline">
                    {pedido.cotacao.numero}
                  </Link>
                ) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Entrega Prevista</p>
              <p className="text-sm font-medium">{formatDate(pedido.dataEntregaPrevista)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Valor Total</p>
              <p className="text-lg font-bold text-gray-900">{formatBRL(totalGeral)}</p>
            </div>
            {pedido.conferencia && (
              <div>
                <p className="text-xs text-gray-500">Conferência</p>
                <Link
                  href={`/suprimentos/conferencias/${pedido.conferencia.id}`}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  {pedido.conferencia.numero} — <StatusBadge status={pedido.conferencia.status} />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Quantidade</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Preço Unit.</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedido.itens.map((item) => {
                  const qtd   = decimalToNumber(item.quantidade);
                  const preco = decimalToNumber(item.precoUnitario);
                  const vlItem = decimalToNumber(item.valorTotal) || qtd * preco;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.item.codigo}</td>
                      <td className="px-4 py-3">{item.item.descricao}</td>
                      <td className="px-4 py-3 text-right">
                        {qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}{" "}
                        {item.item.unidadeMedida}
                      </td>
                      <td className="px-4 py-3 text-right">{formatBRL(preco)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatBRL(vlItem)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={4} className="px-4 py-3 text-right font-bold text-gray-900">Total Geral</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 text-base">{formatBRL(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {pedido.observacoes && (
          <Card>
            <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{pedido.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {nextActions.map((action) => (
            <Button key={action.next} variant={action.variant}
              onClick={() => changeStatus(action.next)} disabled={actioning}>
              {actioning ? "Processando..." : action.label}
            </Button>
          ))}
          {pedido.status === "CONFIRMADO" && !pedido.conferencia && (
            <Button onClick={registrarConferencia} disabled={actioning}>
              {actioning ? "Criando..." : "Registrar Conferência"}
            </Button>
          )}
          {pedido.status === "EM_TRANSITO" && !pedido.conferencia && (
            <Button onClick={registrarConferencia} disabled={actioning}>
              {actioning ? "Criando..." : "Registrar Conferência"}
            </Button>
          )}
        </div>
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
                    {/* Trigger */}
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

                    {/* Dropdown */}
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
