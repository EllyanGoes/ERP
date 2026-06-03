"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL, formatDate, decimalToNumber } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, CheckCircle2, ChevronDown, ChevronRight,
  Plus, ArrowLeft, BarChart3, X, Pencil, Search, Trash2,
} from "lucide-react";
import { useSession } from "@/lib/session-context";

// ── Types ─────────────────────────────────────────────────────────────────────
type FornecedorOption = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
};

type CotacaoFornecedorItem = {
  id: string;
  itemId: string;
  quantidade: unknown;
  precoUnitario: unknown;
  subtotal: unknown;
  disponivel: boolean;
  situacao: string | null;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
};

type CotacaoFornecedor = {
  id: string;
  status: "AGUARDANDO" | "RESPONDIDA" | "RECUSADA";
  prazoEntregaDias: number | null;
  condicoesPagamento: string | null;
  observacao: string | null;
  totalCalculado: unknown;
  melhorOpcao: boolean;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null };
  itens: CotacaoFornecedorItem[];
};

type SCItem = {
  id: string;
  itemId: string;
  quantidade: unknown;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
};

type Cotacao = {
  id: string;
  numero: string;
  nome: string | null;
  status: "PENDENTE" | "EM_ANALISE" | "CONCLUIDA";
  dataLimiteResposta: string | null;
  observacoes: string | null;
  infoEntrega: string | null;
  necessidade: { id: string; numero: string; itens: SCItem[] } | null;
  fornecedores: CotacaoFornecedor[];
  pedidos: Array<{ id: string; numero: string; status: string }>;
};

type HistoricoEntry = {
  id: string;
  versao: number;
  totalCalculado: unknown;
  frete: unknown;
  desconto: unknown;
  condicoesPagamento: string | null;
  prazoEntregaDias: number | null;
  observacao: string | null;
  itensSnapshot: Array<{ codigo: string; descricao: string; quantidade: string; precoUnitario: string | null; subtotal: string | null; situacao: string | null }> | null;
  createdAt: string;
};

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_RESP_BADGE: Record<string, { label: string; cls: string }> = {
  AGUARDANDO: { label: "Pendente",            cls: "bg-amber-100 text-amber-700 border border-amber-200" },
  RESPONDIDA: { label: "Proposta Registrada", cls: "bg-green-100 text-green-700 border border-green-200" },
  RECUSADA:   { label: "Desqualificado",      cls: "bg-red-100 text-red-700 border border-red-200" },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CotacaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";

  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itensOpen, setItensOpen] = useState(true);

  // Exclusão (apenas admin)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showSemPropostaModal, setShowSemPropostaModal] = useState(false);

  const [historicoTarget, setHistoricoTarget] = useState<{ cfId: string; fornNome: string } | null>(null);
  const [historicoData, setHistoricoData] = useState<HistoricoEntry[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // ── Add participants modal ────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [allFornecedores, setAllFornecedores] = useState<FornecedorOption[]>([]);
  const [fornecedoresLoaded, setFornecedoresLoaded] = useState(false);
  const [selectedFornIds, setSelectedFornIds] = useState<Set<string>>(new Set());
  const [addingParticipants, setAddingParticipants] = useState(false);
  const [addError, setAddError] = useState("");
  const [searchForn, setSearchForn] = useState("");

  async function loadAllFornecedores() {
    if (fornecedoresLoaded) return;
    try {
      const res = await fetch("/api/suprimentos/fornecedores");
      const json = await res.json();
      setAllFornecedores(Array.isArray(json) ? json : (json.data ?? []));
      setFornecedoresLoaded(true);
    } catch {}
  }

  function openAddModal() {
    setSelectedFornIds(new Set());
    setAddError("");
    setSearchForn("");
    setShowAddModal(true);
    loadAllFornecedores();
  }

  async function handleAddParticipants() {
    if (selectedFornIds.size === 0) return;
    if (!cotacao) return;

    const firstForn = cotacao.fornecedores[0];
    const itensBase = firstForn
      ? firstForn.itens.map((i) => ({
          itemId: i.itemId,
          quantidade: decimalToNumber(i.quantidade),
          precoUnitario: 0,
          situacao: "CONSIDERA",
        }))
      : (cotacao.necessidade?.itens ?? []).map((i) => ({
          itemId: i.item.id,
          quantidade: decimalToNumber(i.quantidade),
          precoUnitario: 0,
          situacao: "CONSIDERA",
        }));

    if (itensBase.length === 0) {
      setAddError("Nenhum item encontrado na cotação para vincular.");
      return;
    }

    setAddingParticipants(true);
    setAddError("");
    const errors: string[] = [];

    for (const fornId of Array.from(selectedFornIds)) {
      try {
        const res = await fetch(`/api/suprimentos/cotacoes/${id}/fornecedores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fornecedorId: fornId,
            itens: itensBase,
          }),
        });
        const json = await res.json();
        if (!res.ok) errors.push(json.error || `Erro ao adicionar fornecedor`);
      } catch {
        errors.push("Erro de conexão");
      }
    }

    setAddingParticipants(false);

    if (errors.length > 0) {
      setAddError(errors.join("; "));
      return;
    }

    setShowAddModal(false);
    await load();
  }

  // ── Edit cotação modal ────────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editDataLimite, setEditDataLimite] = useState("");
  const [editInfoEntrega, setEditInfoEntrega] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditModal() {
    if (!cotacao) return;
    setEditNome(cotacao.nome ?? "");
    setEditDataLimite(
      cotacao.dataLimiteResposta
        ? cotacao.dataLimiteResposta.slice(0, 10)
        : ""
    );
    setEditInfoEntrega(cotacao.infoEntrega ?? "");
    setEditObservacoes(cotacao.observacoes ?? "");
    setEditError("");
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!editNome.trim()) { setEditError("Informe o apelido da cotação."); return; }
    if (!editDataLimite)  { setEditError("Informe o prazo de recebimento."); return; }
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editNome.trim(),
          dataLimiteResposta: editDataLimite || null,
          infoEntrega: editInfoEntrega.trim() || null,
          observacoes: editObservacoes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error || "Erro ao salvar."); return; }
      setShowEditModal(false);
      await load();
    } catch {
      setEditError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro"); return; }
      setCotacao(json.data);
    } catch {
      setError("Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const pathname = usePathname();
  // Re-fetch quando a rota voltar para esta página (ex: retorno da proposta)
  useEffect(() => { load(); }, [load, pathname]);
  useTabTitle(cotacao ? cotacao.numero : null);

  // ── Status transitions ────────────────────────────────────────────────────
  async function changeStatus(newStatus: string) {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro"); return; }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function gerarPedido() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro ao gerar pedido"); return; }
      const pedidoId = json.data?.pedidoCompra?.id;
      if (pedidoId) router.push(`/suprimentos/pedidos-compra/${pedidoId}`);
      else await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function desqualificarFornecedor(cfId: string) {
    try {
      await fetch(`/api/suprimentos/cotacoes/${id}/fornecedores/${cfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RECUSADA" }),
      });
      await load();
    } catch {
      // silent
    }
  }

  async function excluirFornecedor(cfId: string) {
    try {
      await fetch(`/api/suprimentos/cotacoes/${id}/fornecedores/${cfId}`, {
        method: "DELETE",
      });
      await load();
    } catch {
      // silent
    }
  }

  async function excluirCotacao() {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError(json.error || "Não foi possível excluir a cotação.");
        setDeleteLoading(false);
        return;
      }
      router.push("/suprimentos/cotacoes");
    } catch {
      setDeleteError("Erro de conexão. Tente novamente.");
      setDeleteLoading(false);
    }
  }

  async function openHistorico(cfId: string, fornNome: string) {
    setHistoricoTarget({ cfId, fornNome });
    setHistoricoData([]);
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}/fornecedores/${cfId}/historico`);
      const json = await res.json();
      setHistoricoData(json.data ?? []);
    } finally {
      setLoadingHistorico(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!cotacao) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  // Gather all unique items — from suppliers if any, otherwise from the SC
  const allItemsMap = new Map<string, { codigo: string; descricao: string; unidadeMedida: string; quantidade: unknown }>();
  if (cotacao.fornecedores.length > 0) {
    cotacao.fornecedores.forEach((cf) =>
      cf.itens.forEach((i) =>
        allItemsMap.set(i.item.id, {
          codigo: i.item.codigo,
          descricao: i.item.descricao,
          unidadeMedida: i.item.unidadeMedida,
          quantidade: i.quantidade,
        })
      )
    );
  } else if (cotacao.necessidade?.itens) {
    cotacao.necessidade.itens.forEach((i) =>
      allItemsMap.set(i.item.id, {
        codigo: i.item.codigo,
        descricao: i.item.descricao,
        unidadeMedida: i.item.unidade?.sigla || i.item.unidadeMedida,
        quantidade: i.quantidade,
      })
    );
  }

  const respondidas = cotacao.fornecedores.filter((cf) => cf.status === "RESPONDIDA");
  const canEdit = isAdmin || cotacao.status !== "CONCLUIDA";

  return (
    <div>
      <PageHeader
        title={cotacao.numero}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Cotações", href: "/suprimentos/cotacoes" },
          { label: cotacao.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            {(cotacao.status === "PENDENTE" || cotacao.status === "EM_ANALISE") && (
              <Button
                onClick={() => {
                  if (respondidas.length === 0) {
                    setShowSemPropostaModal(true);
                    return;
                  }
                  router.push(`/suprimentos/cotacoes/${id}/analise`);
                }}
                disabled={actioning}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Analisar
              </Button>
            )}
            {cotacao.status === "EM_ANALISE" && respondidas.length > 0 && (
              <Button
                onClick={gerarPedido}
                disabled={actioning}
                className="bg-green-600 hover:bg-green-700"
              >
                {actioning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Concluir e Gerar Pedido
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={openEditModal}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar cotação
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={openAddModal}>
                <Plus className="w-4 h-4 mr-2" />
                Novo participante
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => { setDeleteError(""); setShowDeleteModal(true); }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push("/suprimentos/cotacoes")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-6 max-w-6xl">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* ── Info header card ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Apelido</p>
              <p className="font-semibold text-gray-800 truncate">{cotacao.nome || <span className="text-gray-300 font-normal">—</span>}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Solicitação vinculada</p>
              {cotacao.necessidade ? (
                <Link
                  href={`/compras/necessidades/${cotacao.necessidade.id}`}
                  className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {cotacao.necessidade.numero}
                </Link>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Prazo de resposta</p>
              <p className="font-medium text-gray-800">
                {cotacao.dataLimiteResposta
                  ? formatDate(cotacao.dataLimiteResposta)
                  : <span className="text-gray-300">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Informações de entrega</p>
              <p className="text-gray-700 text-xs line-clamp-2 whitespace-pre-wrap">
                {cotacao.infoEntrega || <span className="text-gray-300">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Observações</p>
              <p className="text-gray-700 text-xs line-clamp-2 whitespace-pre-wrap">
                {cotacao.observacoes || <span className="text-gray-300">—</span>}
              </p>
            </div>
          </div>
        </div>

        {/* ── Itens da cotação (collapsible) ─────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
            onClick={() => setItensOpen(!itensOpen)}
          >
            <span className="font-semibold text-sm text-gray-800">Itens da cotação</span>
            {itensOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          </button>
          {itensOpen && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Código</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">U.M.</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from(allItemsMap.entries()).map(([itemId, item]) => (
                  <tr key={itemId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.codigo}</td>
                    <td className="px-4 py-2 text-gray-800">{item.descricao}</td>
                    <td className="px-4 py-2 text-gray-600">{item.unidadeMedida}</td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {decimalToNumber(item.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    </td>
                  </tr>
                ))}
                {allItemsMap.size === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-gray-400 text-sm">
                      Nenhum item na cotação
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Supplier cards ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          {cotacao.fornecedores.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-8">
              Nenhum fornecedor vinculado a esta cotação.
            </p>
          )}

          {cotacao.fornecedores.map((cf, idx) => {
            const badge = STATUS_RESP_BADGE[cf.status] ?? { label: cf.status, cls: "bg-gray-100 text-gray-600" };
            const fornNome = cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial;
            const codigoForn = cf.fornecedor.id.slice(-8).toUpperCase();
            const propostaNum = `PROPOSTA ${String(idx + 1).padStart(2, "0")}`;
            const totalItens = cf.itens.length;
            const itensSemPreco = cf.itens.filter((i) => !i.precoUnitario).length;
            const total = decimalToNumber(cf.totalCalculado);

            return (
              <div
                key={cf.id}
                className={cn(
                  "bg-white rounded-xl border shadow-sm overflow-hidden",
                  cf.melhorOpcao && cf.status === "RESPONDIDA" ? "border-green-400" : "border-gray-200"
                )}
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", badge.cls)}>
                      {badge.label}
                    </span>
                    <span className="font-semibold text-gray-900">{fornNome}</span>
                    <span className="text-xs text-gray-400 font-mono">{propostaNum}</span>
                    {cf.melhorOpcao && cf.status === "RESPONDIDA" && (
                      <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        Melhor preço
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && cf.status === "AGUARDANDO" && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => router.push(`/suprimentos/cotacoes/${id}/proposta/${cf.id}`)}
                      >
                        Preencher proposta
                      </Button>
                    )}
                    {canEdit && cf.status === "RESPONDIDA" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/suprimentos/cotacoes/${id}/proposta/${cf.id}`)}
                      >
                        Atualizar proposta
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button size="sm" variant="outline" className="gap-1">
                          Outras ações <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/suprimentos/cotacoes/${id}/proposta/${cf.id}`)}
                        >
                          Visualizar
                        </DropdownMenuItem>
                        {canEdit && cf.status !== "RECUSADA" && (
                          <DropdownMenuItem
                            className="text-amber-600"
                            onClick={() => desqualificarFornecedor(cf.id)}
                          >
                            Desqualificar
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => excluirFornecedor(cf.id)}
                          >
                            Excluir proposta
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Card body */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Código fornecedor</p>
                    <p className="font-mono font-medium text-gray-800">{codigoForn}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">CPF/CNPJ</p>
                    <p className="font-medium text-gray-800">{cf.fornecedor.cpfCnpj || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Moeda</p>
                    <p className="font-medium text-gray-800">REAL</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Total da cotação</p>
                    <p className="font-semibold text-gray-900">
                      {cf.status === "RESPONDIDA" ? formatBRL(total) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Itens pendentes</p>
                    <p className="font-medium text-gray-800">
                      {cf.status === "RESPONDIDA" ? `${itensSemPreco}/${totalItens}` : `${totalItens}/${totalItens}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Prazo entrega</p>
                    <p className="font-medium text-gray-800">
                      {cf.prazoEntregaDias ? `${cf.prazoEntregaDias} dias` : "—"}
                    </p>
                  </div>
                </div>

                {/* History link */}
                <div className="mt-3 pt-2 border-t text-center">
                  <button
                    onClick={() => openHistorico(cf.id, fornNome)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Exibir histórico de propostas
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Concluída: pedidos gerados ────────────────────────────────── */}
        {cotacao.status === "CONCLUIDA" && cotacao.pedidos.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              Pedido gerado:{" "}
              {cotacao.pedidos.map((p) => (
                <Link
                  key={p.id}
                  href={`/suprimentos/pedidos-compra/${p.id}`}
                  className="underline hover:text-green-900 ml-1"
                >
                  {p.numero}
                </Link>
              ))}
            </span>
          </div>
        )}

      </div>

      {/* ── Edit cotação modal ─────────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Editar cotação</h2>
                <p className="text-xs text-gray-400 mt-0.5">{cotacao?.numero}</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto">
              {/* Nome */}
              <div className="space-y-1.5">
                <Label>
                  Apelido da cotação <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  placeholder="Ex.: Compras materiais elétricos Abril/2026"
                  className={cn(!editNome.trim() && editError ? "border-red-400" : "")}
                />
              </div>

              {/* Prazo */}
              <div className="space-y-1.5">
                <Label>
                  Prazo de recebimento <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={editDataLimite}
                  onChange={(e) => setEditDataLimite(e.target.value)}
                  className={cn(!editDataLimite && editError ? "border-red-400" : "")}
                />
                <p className="text-xs text-gray-400">
                  Prazo limite para os fornecedores enviarem suas propostas.
                </p>
              </div>

              {/* Info entrega */}
              <div className="space-y-1.5">
                <Label>Informações de entrega</Label>
                <Textarea
                  value={editInfoEntrega}
                  onChange={(e) => setEditInfoEntrega(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                  placeholder="Endereço de entrega, instruções especiais..."
                />
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  value={editObservacoes}
                  onChange={(e) => setEditObservacoes(e.target.value)}
                  rows={3}
                  placeholder="Observações gerais da cotação..."
                />
              </div>

              {editError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {editError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowEditModal(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</>
                ) : (
                  "Salvar alterações"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add participants modal ─────────────────────────────────────────────── */}
      {showAddModal && (() => {
        const existingIds = new Set(cotacao.fornecedores.map((cf) => cf.fornecedor.id));
        const available = allFornecedores.filter((f) => !existingIds.has(f.id));
        const filtered = available.filter((f) => {
          const q = searchForn.toLowerCase();
          return (
            (f.nomeFantasia ?? "").toLowerCase().includes(q) ||
            f.razaoSocial.toLowerCase().includes(q) ||
            (f.cpfCnpj ?? "").includes(q)
          );
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="font-semibold text-gray-900">Adicionar participantes</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedFornIds.size > 0
                      ? `${selectedFornIds.size} fornecedor${selectedFornIds.size > 1 ? "es" : ""} selecionado${selectedFornIds.size > 1 ? "s" : ""}`
                      : "Selecione os fornecedores que participarão da cotação"}
                  </p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="px-6 pt-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchForn}
                    onChange={(e) => setSearchForn(e.target.value)}
                    placeholder="Buscar por nome, fantasia ou CNPJ..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1 px-6 py-2 space-y-1">
                {!fornecedoresLoaded && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                )}
                {fornecedoresLoaded && filtered.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">
                    {available.length === 0 ? "Todos os fornecedores já estão na cotação." : "Nenhum fornecedor encontrado."}
                  </p>
                )}
                {fornecedoresLoaded && filtered.map((f) => {
                  const isSelected = selectedFornIds.has(f.id);
                  const label = f.nomeFantasia || f.razaoSocial;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedFornIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        });
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-blue-50 border border-blue-200"
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300"
                      )}>
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
                        {f.nomeFantasia && (
                          <p className="text-xs text-gray-400 truncate">{f.razaoSocial}</p>
                        )}
                      </div>
                      {f.cpfCnpj && (
                        <span className="text-xs text-gray-400 font-mono shrink-0">{f.cpfCnpj}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Error */}
              {addError && (
                <div className="mx-6 mb-2">
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={addingParticipants}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddParticipants}
                  disabled={selectedFornIds.size === 0 || addingParticipants}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {addingParticipants ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adicionando...</>
                  ) : (
                    `Adicionar${selectedFornIds.size > 0 ? ` (${selectedFornIds.size})` : ""}`
                  )}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── History modal ──────────────────────────────────────────────────────── */}
      {historicoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Histórico de propostas
                </h2>
                <p className="text-sm text-gray-500">{historicoTarget.fornNome}</p>
              </div>
              <button onClick={() => setHistoricoTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {loadingHistorico && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              )}
              {!loadingHistorico && historicoData.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">
                  Nenhum histórico de proposta registrado ainda.
                </p>
              )}
              {!loadingHistorico && historicoData.map((h) => (
                <div key={h.id} className="border rounded-lg p-4 mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">
                      Versão {h.versao}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(h.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                    <div>
                      <p className="text-gray-400">Total</p>
                      <p className="font-medium">{formatBRL(decimalToNumber(h.totalCalculado))}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Frete</p>
                      <p className="font-medium">{formatBRL(decimalToNumber(h.frete))}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Desconto</p>
                      <p className="font-medium">{decimalToNumber(h.desconto).toFixed(2)}%</p>
                    </div>
                    {h.condicoesPagamento && (
                      <div>
                        <p className="text-gray-400">Cond. Pagamento</p>
                        <p className="font-medium">{h.condicoesPagamento}</p>
                      </div>
                    )}
                    {h.prazoEntregaDias != null && (
                      <div>
                        <p className="text-gray-400">Prazo entrega</p>
                        <p className="font-medium">{h.prazoEntregaDias} dias</p>
                      </div>
                    )}
                  </div>
                  {h.itensSnapshot && h.itensSnapshot.length > 0 && (
                    <table className="w-full text-xs border-t pt-2 mt-2">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left py-1">Produto</th>
                          <th className="text-left py-1">Descrição</th>
                          <th className="text-right py-1">Qtd</th>
                          <th className="text-right py-1">Preço Unit.</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.itensSnapshot.map((item, idx) => (
                          <tr key={idx} className="border-t border-gray-50">
                            <td className="py-1 text-gray-500">{item.codigo}</td>
                            <td className="py-1">{item.descricao}</td>
                            <td className="py-1 text-right">{item.quantidade}</td>
                            <td className="py-1 text-right">{item.precoUnitario ? formatBRL(parseFloat(item.precoUnitario)) : "—"}</td>
                            <td className="py-1 text-right">{item.subtotal ? formatBRL(parseFloat(item.subtotal)) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: sem proposta para analisar ─────────────────────────────────── */}
      {showSemPropostaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-base">Nenhuma proposta registrada</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Para analisar a cotação é necessário que pelo menos um fornecedor tenha enviado sua proposta.
                  Registre uma proposta antes de continuar.
                </p>
              </div>
              <div className="w-full mt-1 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
                {cotacao.fornecedores.length === 0
                  ? "Nenhum fornecedor vinculado a esta cotação."
                  : `${cotacao.fornecedores.length} fornecedor${cotacao.fornecedores.length > 1 ? "es" : ""} aguardando resposta.`}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
              <Button onClick={() => setShowSemPropostaModal(false)} className="bg-blue-600 hover:bg-blue-700">
                Entendido
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Excluir cotação (admin) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-5">
              <p className="font-semibold text-gray-900">Excluir cotação {cotacao.numero}?</p>
              <p className="text-sm text-gray-500 mt-1">
                Esta ação remove a cotação e todas as propostas dos fornecedores vinculadas.
                Não pode ser desfeita.
              </p>
              {deleteError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button
                onClick={excluirCotacao}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
