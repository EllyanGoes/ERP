"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatDate, formatBRL, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { useRouter } from "next/navigation";
import { ShieldAlert, Save, Loader2, Trash2, LinkIcon } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import { useEscToClose } from "@/lib/use-esc-to-close";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type FornecedorOption = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
};

type LocalEstoque = { id: string; nome: string } | null;

type ConferenciaItem = {
  id: string;
  quantidadePedida: unknown;
  quantidadeRecebida: unknown;
  divergencia: boolean;
  observacao: string | null;
  vlrUnitario: unknown;
  vlrTotal: unknown;
  vlrIPI: unknown;
  vlrICMS: unknown;
  tipoEntrada: string | null;
  codFiscal: string | null;
  tpOper: string | null;
  localEstoqueId: string | null;
  localEstoque: LocalEstoque;
  desconto: unknown;
  unidadeId: string | null;
  item: {
    id: string; codigo: string; descricao: string; unidadeMedida: string;
    unidade?: { id: string; sigla: string } | null;
    itemUnidades?: { unidadeId: string; fatorConversao: unknown; isPrincipal: boolean; unidade: { sigla: string } }[];
  };
};

type FornecedorInfo = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  contato: string | null;
  email: string | null;
};

type Conferencia = {
  id: string;
  numero: string;
  status: string;
  dataConferencia: string | null;
  responsavel: string | null;
  observacoes: string | null;
  tipoNota: string | null;
  numeroNF: string | null;
  serie: string | null;
  dtEmissao: string | null;
  ufOrigem: string | null;
  espDocumento: string | null;
  frete: unknown;
  tipoFrete: string | null;
  seguro: unknown;
  despesas: unknown;
  desconto: unknown;
  vrTotal: unknown;
  condicaoPagamentoId: string | null;
  naturezaFinanceiraId: string | null;
  pedidoId: string | null;
  localEstoqueId: string | null;
  modoLocalEstoque: string | null;
  localEstoque: { id: string; nome: string } | null;
  pedido: {
    id: string;
    numero: string;
    condicaoPagamentoId: string | null;
    condicoesPagamento: string | null;
    fornecedor: FornecedorInfo;
  } | null;
  fornecedor: FornecedorInfo | null;
  itens: ConferenciaItem[];
};

// Opção de unidade de compra de um item (base + alternativas) com o fator.
type UnidadeOpc = { unidadeId: string; sigla: string; fator: number; base: boolean };

type EditItem = {
  id: string;
  quantidadeRecebida: string;
  observacao: string;
  vlrUnitario: string;
  vlrTotal: string;
  vlrIPI: string;
  vlrICMS: string;
  tipoEntrada: string;
  codFiscal: string;
  tpOper: string;
  localEstoqueId: string;
  desconto: string;
  unidadeId: string;          // unidade de compra escolhida ("" = base)
  unidades: UnidadeOpc[];     // opções (base + alternativas) do item
  baseSigla: string;          // sigla da unidade base (p/ o hint convertido)
};

type LocalEstoqueOption = { id: string; nome: string };
type ProdutoOption = { id: string; codigo: string; descricao: string; unidadeMedida: string };
type NewItem = {
  _key: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  quantidadeRecebida: string;
  vlrUnitario: string;
  vlrTotal: string;
  vlrIPI: string;
  vlrICMS: string;
  desconto: string;
  localEstoqueId: string;
};

function getItemStatus(pedida: number, recebida: number): { label: string; cls: string } {
  if (recebida === 0) return { label: "Faltante", cls: "bg-danger/15 text-danger" };
  if (Math.abs(pedida - recebida) > 0.001) return { label: "Divergência", cls: "bg-warning/15 text-warning" };
  return { label: "OK", cls: "bg-success/15 text-success" };
}

export default function DocumentoEntradaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const router = useRouter();

  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [actioning, setActioning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autoVinculoMsg, setAutoVinculoMsg] = useState<string | null>(null);
  const [scAtendidaMsg, setScAtendidaMsg] = useState<{ numero: string; status: string }[] | null>(null);

  // Popup: novos vínculos antes de concluir
  type VinculoItem = { id: string; codigo: string; descricao: string };
  const [vinculoPopup, setVinculoPopup] = useState<{ fornecedorNome: string; novos: VinculoItem[] } | null>(null);
  useEscToClose(() => setVinculoPopup(null), !!vinculoPopup);

  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // NF fields (editable when PENDENTE)
  const [tipoNota, setTipoNota] = useState("");
  const [numeroNF, setNumeroNF] = useState("");
  const [serie, setSerie] = useState("");
  const [dtEmissao, setDtEmissao] = useState("");
  const [ufOrigem, setUfOrigem] = useState("");
  const [espDocumento, setEspDocumento] = useState("");
  const [frete, setFrete] = useState("");
  const [seguro, setSeguro] = useState("");
  const [despesas, setDespesas] = useState("");
  const [desconto, setDesconto] = useState("");
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState("");
  const [condicoes, setCondicoes] = useState<{ id: string; nome: string }[]>([]);
  const [naturezaFinanceiraId, setNaturezaFinanceiraId] = useState("");
  const [naturezas, setNaturezas] = useState<NaturezaOpt[]>([]);
  const [validationError, setValidationError] = useState("");
  const [localAlertDismissed, setLocalAlertDismissed] = useState(false);
  const [showDivergenciaConfirm, setShowDivergenciaConfirm] = useState(false);

  // Local de estoque (header-level)
  const [modoLocalEstoque, setModoLocalEstoque] = useState<"GLOBAL" | "POR_ITEM">("POR_ITEM");
  const [localEstoqueGlobalId, setLocalEstoqueGlobalId] = useState("");

  // Fornecedor search (editable)
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([]);

  // Usuário (responsável)
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState("");
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [locaisEstoque, setLocaisEstoque] = useState<LocalEstoqueOption[]>([]);

  // Add item inline
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [addItemSearch, setAddItemSearch] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`);
      const json = await res.json();
      const conf: Conferencia = json.data;
      setConferencia(conf);
      setAdminStatus(conf.status);
      // Auto-fill responsavel with current user if not yet set
      const respoNome = conf.responsavel ?? user?.nome ?? "";
      setResponsavel(respoNome);
      setObservacoes(conf.observacoes ?? "");
      setTipoNota(
        conf.tipoNota === "SN" ? "SN" : "NF"
      );
      setEspDocumento(conf.espDocumento ?? "");
      setNumeroNF(conf.numeroNF ?? "");
      setSerie(conf.serie ?? "");
      setDtEmissao(conf.dtEmissao ? conf.dtEmissao.slice(0, 10) : new Date().toLocaleDateString("sv-SE"));
      setUfOrigem(conf.ufOrigem ?? "");
      // Condição do DE: usa a do próprio DE, senão herda a do pedido.
      setCondicaoPagamentoId(conf.condicaoPagamentoId ?? conf.pedido?.condicaoPagamentoId ?? "");
      setNaturezaFinanceiraId(conf.naturezaFinanceiraId ?? "");
      setFrete(decimalToNumber(conf.frete) > 0 ? String(decimalToNumber(conf.frete)) : "");
      const forn = conf.fornecedor ?? conf.pedido?.fornecedor ?? null;
      setFornecedorId(forn?.id ?? "");
      const modo = (conf.modoLocalEstoque === "GLOBAL" ? "GLOBAL" : "POR_ITEM") as "GLOBAL" | "POR_ITEM";
      setModoLocalEstoque(modo);
      setLocalEstoqueGlobalId(conf.localEstoqueId ?? "");
      setSeguro(decimalToNumber(conf.seguro) > 0 ? String(decimalToNumber(conf.seguro)) : "");
      setDespesas(decimalToNumber(conf.despesas) > 0 ? String(decimalToNumber(conf.despesas)) : "");
      setDesconto(decimalToNumber(conf.desconto) > 0 ? String(decimalToNumber(conf.desconto)) : "");

      const resolvedModo = conf.modoLocalEstoque === "GLOBAL" ? "GLOBAL" : "POR_ITEM";
      const globalLocalId = conf.localEstoqueId ?? "";
      setEditItems(
        conf.itens.map((i) => {
          // Unidades de compra: base (sigla do item) + alternativas (fator).
          const baseSigla = i.item.unidade?.sigla ?? i.item.unidadeMedida ?? "un";
          const alternativas: UnidadeOpc[] = (i.item.itemUnidades ?? [])
            .filter((iu) => !iu.isPrincipal && iu.fatorConversao != null)
            .map((iu) => ({ unidadeId: iu.unidadeId, sigla: iu.unidade.sigla, fator: decimalToNumber(iu.fatorConversao), base: false }))
            .filter((u) => u.fator > 0);
          const unidades: UnidadeOpc[] = [{ unidadeId: "", sigla: baseSigla, fator: 1, base: true }, ...alternativas];
          return {
            id: i.id,
            quantidadeRecebida: decimalToNumber(i.quantidadeRecebida).toString(),
            observacao: i.observacao ?? "",
            vlrUnitario: decimalToNumber(i.vlrUnitario) > 0 ? String(decimalToNumber(i.vlrUnitario)) : "",
            vlrTotal: decimalToNumber(i.vlrTotal) > 0 ? String(decimalToNumber(i.vlrTotal)) : "",
            vlrIPI: decimalToNumber(i.vlrIPI) > 0 ? String(decimalToNumber(i.vlrIPI)) : "",
            vlrICMS: decimalToNumber(i.vlrICMS) > 0 ? String(decimalToNumber(i.vlrICMS)) : "",
            tipoEntrada: i.tipoEntrada ?? "",
            codFiscal: i.codFiscal ?? "",
            tpOper: i.tpOper ?? "",
            localEstoqueId: resolvedModo === "GLOBAL" ? globalLocalId : (i.localEstoqueId ?? ""),
            desconto: decimalToNumber(i.desconto) > 0 ? String(decimalToNumber(i.desconto)) : "",
            unidadeId: i.unidadeId ?? "",
            unidades,
            baseSigla,
          };
        })
      );
    } catch {
      setError("Erro ao carregar documento");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/suprimentos/condicoes-pagamento").then((r) => r.json())
      .then((j) => setCondicoes(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json())
      .then((j) => setNaturezas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Sync usuarioResponsavelId from responsavel name once users are loaded
  useEffect(() => {
    if (usuarios.length === 0 || !responsavel) return;
    const match = usuarios.find((u) => u.nome.toLowerCase() === responsavel.toLowerCase());
    if (match) setUsuarioResponsavelId(match.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios]);

  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((j) => setLocaisEstoque(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((j) => setUsuarios(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/suprimentos/produtos")
      .then((r) => r.json())
      .then((j) => setProdutos(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  function updateNewItem(key: string, field: keyof NewItem, value: string) {
    setNewItems((prev) =>
      prev.map((ni) => {
        if (ni._key !== key) return ni;
        const updated = { ...ni, [field]: value };
        // auto-calc vlrTotal
        if (field === "vlrUnitario" || field === "quantidadeRecebida" || field === "desconto") {
          const qtd  = parseFloat(field === "quantidadeRecebida" ? value : ni.quantidadeRecebida) || 0;
          const unit = parseFloat(field === "vlrUnitario" ? value : ni.vlrUnitario) || 0;
          const pct  = parseFloat(field === "desconto" ? value : ni.desconto) || 0;
          if (qtd > 0 && unit > 0) {
            const bruto = qtd * unit;
            updated.vlrTotal = (bruto - (bruto * pct) / 100).toFixed(2);
          }
        }
        return updated;
      })
    );
  }

  function addNewItemRow(produto: ProdutoOption) {
    setNewItems((prev) => [
      ...prev,
      {
        _key: `${produto.id}-${Date.now()}`,
        itemId: produto.id,
        codigo: produto.codigo,
        descricao: produto.descricao,
        unidadeMedida: produto.unidadeMedida,
        quantidadeRecebida: "1",
        vlrUnitario: "",
        vlrTotal: "",
        vlrIPI: "",
        vlrICMS: "",
        desconto: "",
        localEstoqueId: localEstoqueGlobalId,
      },
    ]);
    setAddItemSearch("");
    setShowAddRow(false);
    // Re-show the local alert if new item has no local
    if (!localEstoqueGlobalId) setLocalAlertDismissed(false);
  }

  function removeNewItem(key: string) {
    setNewItems((prev) => prev.filter((ni) => ni._key !== key));
  }

  function updateEditItem(itemId: string, key: keyof EditItem, value: string) {
    setEditItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, [key]: value } : i)));
  }

  function handleModoChange(novo: "GLOBAL" | "POR_ITEM") {
    setModoLocalEstoque(novo);
    if (novo === "GLOBAL") {
      // propagate current global to all items
      setEditItems((prev) => prev.map((i) => ({ ...i, localEstoqueId: localEstoqueGlobalId })));
    }
  }

  function handleGlobalLocalChange(localId: string) {
    setLocalEstoqueGlobalId(localId);
    // propagate to all items immediately
    setEditItems((prev) => prev.map((i) => ({ ...i, localEstoqueId: localId })));
  }

  // Auto-calc vlrTotal when vlrUnitario, quantidadeRecebida, or desconto changes
  function updateItemAndCalc(itemId: string, key: "vlrUnitario" | "quantidadeRecebida" | "desconto", value: string) {
    setEditItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const updated = { ...i, [key]: value };
        const qtd  = parseFloat(key === "quantidadeRecebida" ? value : i.quantidadeRecebida) || 0;
        const unit = parseFloat(key === "vlrUnitario" ? value : i.vlrUnitario) || 0;
        const pct  = parseFloat(key === "desconto" ? value : i.desconto) || 0;
        if (qtd > 0 && unit > 0) {
          const bruto = qtd * unit;
          updated.vlrTotal = (bruto - (bruto * pct) / 100).toFixed(2);
        }
        return updated;
      })
    );
  }

  async function salvarConferencia() {
    setValidationError("");
    if (!fornecedorId) { setValidationError("Fornecedor é obrigatório."); return; }
    if (!tipoNota)     { setValidationError("Tipo é obrigatório."); return; }
    if (!dtEmissao)    { setValidationError("DT Emissão é obrigatória."); return; }
    if (modoLocalEstoque === "GLOBAL" && !localEstoqueGlobalId) {
      setValidationError("Local de Estoque é obrigatório."); return;
    }
    if (modoLocalEstoque === "POR_ITEM") {
      const allItems = [...editItems, ...newItems];
      const semLocal = allItems.some((i) => !i.localEstoqueId);
      if (semLocal) { setValidationError("Todos os itens precisam ter um Local de Estoque definido."); return; }
    }

    setSaving(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: fornecedorId || null,
          localEstoqueId: modoLocalEstoque === "GLOBAL" ? (localEstoqueGlobalId || null) : null,
          modoLocalEstoque,
          observacoes: observacoes || null,
          tipoNota: tipoNota || null,
          numeroNF: numeroNF || null,
          serie: serie || null,
          dtEmissao: dtEmissao || null,
          ufOrigem: ufOrigem || null,
          espDocumento: espDocumento || null,
          frete: frete ? parseFloat(frete) : null,
          seguro: seguro ? parseFloat(seguro) : null,
          despesas: despesas ? parseFloat(despesas) : null,
          desconto: desconto ? parseFloat(desconto) : null,
          condicaoPagamentoId: condicaoPagamentoId || null,
          naturezaFinanceiraId: naturezaFinanceiraId || null,
          // Admin can change status at any state
          ...(isAdmin ? { status: adminStatus } : {}),
          itens: [
            ...editItems.map((i) => ({
              id: i.id,
              unidadeId: i.unidadeId || null,
              quantidadeRecebida: parseFloat(i.quantidadeRecebida) || 0,
              observacao: i.observacao || null,
              vlrUnitario: i.vlrUnitario ? parseFloat(i.vlrUnitario) : null,
              vlrTotal: i.vlrTotal ? parseFloat(i.vlrTotal) : null,
              vlrIPI: i.vlrIPI ? parseFloat(i.vlrIPI) : null,
              vlrICMS: i.vlrICMS ? parseFloat(i.vlrICMS) : null,
              tipoEntrada: i.tipoEntrada || null,
              codFiscal: i.codFiscal || null,
              tpOper: i.tpOper || null,
              localEstoqueId: i.localEstoqueId || null,
              desconto: i.desconto ? parseFloat(i.desconto) : null,
            })),
            // new items (no id — will be created by API)
            ...newItems.map((ni) => ({
              itemId: ni.itemId,
              quantidadePedida: parseFloat(ni.quantidadeRecebida) || 0,
              quantidadeRecebida: parseFloat(ni.quantidadeRecebida) || 0,
              vlrUnitario: ni.vlrUnitario ? parseFloat(ni.vlrUnitario) : null,
              vlrTotal: ni.vlrTotal ? parseFloat(ni.vlrTotal) : null,
              vlrIPI: ni.vlrIPI ? parseFloat(ni.vlrIPI) : null,
              vlrICMS: ni.vlrICMS ? parseFloat(ni.vlrICMS) : null,
              desconto: ni.desconto ? parseFloat(ni.desconto) : null,
              localEstoqueId: ni.localEstoqueId || null,
            })),
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao salvar");
        return;
      }
      setNewItems([]); // clear pending new items after save
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function concluir() {
    setActionError("");

    // ── Pré-verificação: novos vínculos fornecedor × produto ──────────────────
    // fornecedorId: vem do pedido vinculado ou do fornecedor direto da conferência, ou do estado do formulário
    const fornecedorIdCheck = conferencia?.pedido?.fornecedor?.id ?? conferencia?.fornecedor?.id ?? fornecedorId;
    // Cruzar editItems (que tem quantidadeRecebida) com conferencia.itens (que tem item.id)
    const itensComRecebimento = (conferencia?.itens ?? []).filter((ci) => {
      const ei = editItems.find((e) => e.id === ci.id);
      return parseFloat(String(ei?.quantidadeRecebida ?? ci.quantidadeRecebida ?? 0)) > 0;
    });
    if (fornecedorIdCheck && itensComRecebimento.length > 0) {
      try {
        const itemIds = itensComRecebimento.map((ci) => ci.item.id).join(",");
        const checkRes = await fetch(
          `/api/suprimentos/fornecedor-vinculos-check?fornecedorId=${fornecedorIdCheck}&itemIds=${encodeURIComponent(itemIds)}`
        );
        if (checkRes.ok) {
          const { novos } = await checkRes.json() as { novos: VinculoItem[] };
          if (novos?.length > 0) {
            const fornInfo2 = conferencia?.pedido?.fornecedor ?? conferencia?.fornecedor;
            const fornNome = fornInfo2?.nomeFantasia || fornInfo2?.razaoSocial || "fornecedor";
            setVinculoPopup({ fornecedorNome: String(fornNome), novos });
            return; // aguarda confirmação
          }
        }
      } catch { /* ignora erros de verificação */ }
    }

    await doConcluir();
  }

  async function doConcluir() {
    setVinculoPopup(null);
    setActioning(true);
    setActionError("");
    try {
      await salvarConferencia();

      const res = await fetch(`/api/suprimentos/conferencias/${id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao concluir");
        return;
      }
      await load();
      if (json.scAtualizadas?.length > 0) {
        setScAtendidaMsg(json.scAtualizadas);
        setTimeout(() => setScAtendidaMsg(null), 10000);
      }
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function iniciarConferencia() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [] }),
      });
      if (!res.ok) {
        const j = await res.json();
        setActionError(j.error || "Erro ao iniciar");
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro ao excluir"); setDeleting(false); setConfirmDelete(false); return; }
      router.push("/suprimentos/conferencias");
    } catch {
      setActionError("Erro de conexão");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  useTabTitle(conferencia ? `Doc. ${conferencia.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-muted-foreground">Carregando...</div>;
  if (!conferencia) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const isPendente    = conferencia.status === "PENDENTE";
  const isEditable    = conferencia.status === "EM_CONFERENCIA";
  const isDivergencia = conferencia.status === "DIVERGENCIA";
  const isConcluded   = conferencia.status === "CONCLUIDA";
  // Divergência é re-editável por qualquer usuário; Concluída só por admin
  const canEdit       = isPendente || isEditable || isDivergencia || (isConcluded && isAdmin);
  const nfEditable    = canEdit;
  const isSN = tipoNota === "SN";
  const itemsEditable = isEditable || isDivergencia || (isConcluded && isAdmin);

  // Detect missing local de estoque (only relevant while editable)
  const missingLocalGlobal = itemsEditable && modoLocalEstoque === "GLOBAL" && !localEstoqueGlobalId;
  const missingLocalPorItem = itemsEditable && modoLocalEstoque === "POR_ITEM" &&
    [...editItems, ...newItems].some((i) => !i.localEstoqueId);
  const showLocalAlert = (missingLocalGlobal || missingLocalPorItem) && !localAlertDismissed;

  const hasDivergencias = editItems.some((ei) => {
    const item = conferencia.itens.find((i) => i.id === ei.id);
    if (!item) return false;
    return Math.abs(decimalToNumber(item.quantidadePedida) - (parseFloat(ei.quantidadeRecebida) || 0)) > 0.001;
  });

  // Fornecedor info: prefer standalone fornecedor, fallback to pedido.fornecedor
  const fornInfo: FornecedorInfo | null = conferencia.fornecedor ?? conferencia.pedido?.fornecedor ?? null;
  const fornNome = fornInfo ? (fornInfo.nomeFantasia || fornInfo.razaoSocial) : "—";
  const codigoForn = fornInfo ? fornInfo.id.slice(-8).toUpperCase() : "—";

  // Totals
  const vlrMercadoria = itemsEditable
    ? editItems.reduce((s, i) => s + (parseFloat(i.vlrTotal) || 0), 0)
    : conferencia.itens.reduce((s, i) => s + decimalToNumber(i.vlrTotal), 0);
  const descontoTotalItens = itemsEditable
    ? editItems.reduce((s, ei) => {
        const unit = parseFloat(ei.vlrUnitario) || 0;
        const qtd  = parseFloat(ei.quantidadeRecebida) || 0;
        const pct  = parseFloat(ei.desconto) || 0;
        return s + (unit * qtd * pct) / 100;
      }, 0)
    : conferencia.itens.reduce((s, i) => {
        const unit = decimalToNumber(i.vlrUnitario);
        const qtd  = decimalToNumber(i.quantidadeRecebida);
        const pct  = decimalToNumber(i.desconto);
        return s + (unit * qtd * pct) / 100;
      }, 0);
  const freteNum = decimalToNumber(conferencia.frete);
  const seguroNum = decimalToNumber(conferencia.seguro);
  const despesasNum = decimalToNumber(conferencia.despesas);
  const descontoNum = decimalToNumber(conferencia.desconto);
  const vrTotalNum = decimalToNumber(conferencia.vrTotal);
  const vlrBruto = vrTotalNum > 0 ? vrTotalNum : vlrMercadoria + freteNum + seguroNum + despesasNum - descontoNum;

  return (
    <div>
      {/* SC atendida toast */}
      {scAtendidaMsg && scAtendidaMsg.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 max-w-lg w-full px-4">
          <div className="flex items-start gap-3 bg-blue-700 text-white text-sm px-5 py-4 rounded-2xl shadow-lg">
            <div className="flex-1">
              <p className="font-semibold mb-1">
                {scAtendidaMsg.length === 1
                  ? "Solicitação de Compras atualizada"
                  : `${scAtendidaMsg.length} Solicitações de Compras atualizadas`}
              </p>
              <ul className="space-y-0.5">
                {scAtendidaMsg.map((sc) => (
                  <li key={sc.numero} className="flex items-center gap-2 text-blue-100">
                    <span className="font-mono font-bold text-white">{sc.numero}</span>
                    <span>→</span>
                    <span className={sc.status === "TOTALMENTE_ATENDIDA" ? "text-emerald-300 font-medium" : "text-amber-300 font-medium"}>
                      {sc.status === "TOTALMENTE_ATENDIDA" ? "Totalmente Atendida" : "Parcialmente Atendida"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setScAtendidaMsg(null)} className="opacity-70 hover:opacity-100 shrink-0 mt-0.5">✕</button>
          </div>
        </div>
      )}

      {/* Auto-vínculo toast */}
      {autoVinculoMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-700 text-white text-sm px-5 py-3 rounded-2xl shadow-lg max-w-lg">
          <span>{autoVinculoMsg}</span>
          <button onClick={() => setAutoVinculoMsg(null)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Local de Estoque — pop-up de aviso ──────────────────────────────── */}
      {showLocalAlert && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30">
          <div className="bg-card rounded-2xl shadow-2xl border border-danger/30 max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 bg-danger/15 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground mb-1">Local de Estoque obrigatório</h3>
                <p className="text-sm text-muted-foreground">
                  {modoLocalEstoque === "GLOBAL"
                    ? "Selecione o Local de Estoque antes de salvar ou concluir este documento."
                    : "Um ou mais itens não possuem Local de Estoque definido. Preencha o campo antes de salvar ou concluir."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setLocalAlertDismissed(true)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de Divergência ──────────────────────────────────────── */}
      {showDivergenciaConfirm && (() => {
        const divergentItems = conferencia.itens
          .map((item, idx) => {
            const ei = editItems[idx];
            const pedida   = decimalToNumber(item.quantidadePedida);
            const recebida = parseFloat(ei?.quantidadeRecebida ?? "0") || 0;
            if (Math.abs(pedida - recebida) > 0.001) {
              return { codigo: item.item.codigo, descricao: item.item.descricao, unidade: item.item.unidadeMedida, pedida, recebida };
            }
            return null;
          })
          .filter(Boolean) as { codigo: string; descricao: string; unidade: string; pedida: number; recebida: number }[];

        return (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30">
            <div className="bg-card rounded-2xl shadow-2xl border border-warning/30 max-w-lg w-full mx-4 p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 w-10 h-10 bg-warning/15 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-1">Divergência de quantidades</h3>
                  <p className="text-sm text-muted-foreground">
                    {divergentItems.length === 1
                      ? "O item abaixo foi recebido em quantidade diferente da pedida."
                      : `Os ${divergentItems.length} itens abaixo foram recebidos em quantidades diferentes das pedidas.`}
                    {" "}O documento será concluído com status <span className="font-semibold text-warning">Divergência</span>.
                  </p>
                </div>
              </div>

              {/* Tabela de itens divergentes */}
              <div className="rounded-lg border border-border overflow-hidden mb-5">
                <table className="w-full text-xs">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produto</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qtd. Pedida</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qtd. Recebida</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {divergentItems.map((it) => (
                      <tr key={it.codigo}>
                        <td className="px-3 py-2">
                          <span className="font-mono text-muted-foreground mr-1.5">{it.codigo}</span>
                          <span className="text-foreground">{it.descricao}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {it.pedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {it.recebida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${it.recebida < it.pedida ? "text-danger" : "text-success"}`}>
                          {it.recebida > it.pedida ? "+" : ""}
                          {(it.recebida - it.pedida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDivergenciaConfirm(false)}
                  className="px-4 py-2 border border-border text-muted-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowDivergenciaConfirm(false);
                    concluir();
                  }}
                  disabled={actioning}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
                >
                  {actioning ? "Concluindo..." : "Confirmar mesmo assim"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <PageHeader
        title={`Documento de Entrada ${conferencia.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Doc. de Entrada", href: "/suprimentos/conferencias" },
          { label: conferencia.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={conferencia.status} />
            {canEdit && (
              <Button size="sm" onClick={salvarConferencia} disabled={saving}>
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</>
                  : <><Save className="w-4 h-4 mr-1.5" />Salvar</>
                }
              </Button>
            )}
            {!confirmDelete ? (
              <Button
                size="sm"
                variant="outline"
                className="text-danger border-danger/30 hover:bg-danger/10 hover:text-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Excluir
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 bg-danger/10 border border-danger/30 rounded-lg px-3 py-1.5">
                <span className="text-xs text-danger font-medium">Confirmar exclusão?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded"
                >
                  {deleting ? "..." : "Sim"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-red-500 hover:text-danger px-1"
                >
                  Não
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-6">
        {(actionError || validationError) && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
            {validationError || actionError}
          </div>
        )}

        {/* ── Banner: modo edição administrativa ───────────────────────────── */}
        {isConcluded && isAdmin && (
          <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 text-warning px-4 py-2.5 rounded-xl text-sm">
            <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
            <span className="font-medium">Modo edição administrativa</span>
            <span className="text-warning">— alterações salvas substituirão os dados do documento concluído.</span>
          </div>
        )}

        {/* ── Admin: Alterar Status (sempre visível para ADMIN) ────────────── */}
        {isAdmin && (
          <div className="bg-muted border border-border rounded-xl px-4 py-3 flex items-center gap-4">
            <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground shrink-0">Alterar status:</span>
            <select
              value={adminStatus}
              onChange={(e) => setAdminStatus(e.target.value)}
              className="h-8 px-3 border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="PENDENTE">Pendente</option>
              <option value="EM_CONFERENCIA">Em Conferência</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="DIVERGENCIA">Divergência</option>
            </select>
            <span className="text-xs text-muted-foreground">Salve para aplicar</span>
          </div>
        )}

        {/* ── Seção 1: Dados do Documento ───────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dados do Documento</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {/* Tipo de Documento */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo de Documento <span className="text-red-500">*</span></Label>
              {nfEditable ? (
                <select
                  value={tipoNota}
                  onChange={(e) => setTipoNota(e.target.value)}
                  className="w-full h-9 px-3 border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NF">NF — Nota Fiscal</option>
                  <option value="SN">SN — Sem Nota</option>
                </select>
              ) : (
                <Input
                  value={tipoNota === "SN" ? "SN — Sem Nota" : "NF — Nota Fiscal"}
                  readOnly
                  className="bg-muted"
                />
              )}
            </div>

            {/* Número NF */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Número NF{isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              {nfEditable ? (
                <Input
                  value={isSN ? "" : numeroNF}
                  onChange={(e) => setNumeroNF(e.target.value)}
                  placeholder={isSN ? "—" : "000000"}
                  disabled={isSN}
                  className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
                />
              ) : (
                <Input value={conferencia.numeroNF ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* Série */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Série{isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              {nfEditable ? (
                <Input
                  value={isSN ? "" : serie}
                  onChange={(e) => setSerie(e.target.value)}
                  placeholder={isSN ? "—" : "1"}
                  disabled={isSN}
                  className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
                />
              ) : (
                <Input value={conferencia.serie ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* DT Emissão */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">DT Emissão <span className="text-red-500">*</span></Label>
              {nfEditable ? (
                <DatePicker
                  value={dtEmissao}
                  onChange={(v) => setDtEmissao(v)}
                />
              ) : (
                <Input
                  value={conferencia.dtEmissao ? formatDate(conferencia.dtEmissao) : "—"}
                  readOnly
                  className="bg-muted"
                />
              )}
            </div>

            {/* Espécie de Documento */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Espécie de Documento{isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              {nfEditable ? (
                <Input
                  value={isSN ? "" : espDocumento}
                  onChange={(e) => setEspDocumento(e.target.value)}
                  placeholder={isSN ? "—" : "SPED"}
                  disabled={isSN}
                  className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
                />
              ) : (
                <Input value={conferencia.espDocumento ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* UF Origem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">UF Origem</Label>
              {nfEditable ? (
                <ComboboxWithCreate
                  value={ufOrigem}
                  onChange={(v) => setUfOrigem(v)}
                  noneLabel="—"
                  triggerClassName="h-9 rounded-md"
                  options={UF_LIST.map((uf) => ({ value: uf, label: uf }))}
                />
              ) : (
                <Input value={conferencia.ufOrigem ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* Loja */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Loja</Label>
              <Input value="01" readOnly className="bg-muted" />
            </div>

            {/* Nº Documento (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nº Documento</Label>
              <Input value={conferencia.numero} readOnly className="bg-muted font-mono text-xs" />
            </div>

            {/* Data Conferência (read-only) */}
            {conferencia.dataConferencia && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data Conferência</Label>
                <Input
                  value={formatDate(conferencia.dataConferencia)}
                  readOnly
                  className="bg-muted"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Seção 2: Fornecedor ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Fornecedor</CardTitle>
              {conferencia.pedido && (
                <Link
                  href={`/suprimentos/pedidos-compra/${conferencia.pedido.id}`}
                  className="text-xs text-info hover:underline font-mono"
                >
                  Pedido vinculado: {conferencia.pedido.numero}
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  Fornecedor <span className="text-red-500">*</span>
                </Label>
                {nfEditable ? (
                  <ComboboxWithCreate
                    options={fornecedores.map((f) => ({
                      value: f.id,
                      label: f.nomeFantasia || f.razaoSocial,
                      code: f.cpfCnpj ?? undefined,
                    }))}
                    value={fornecedorId}
                    onChange={setFornecedorId}
                    allowNone={false}
                    placeholder="Selecionar fornecedor..."
                    createHref="/suprimentos/fornecedores/novo"
                    createLabel="fornecedor"
                  />
                ) : (
                  <Input value={fornNome} readOnly className="bg-muted" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">CNPJ</Label>
                <Input
                  value={
                    nfEditable
                      ? (fornecedores.find((f) => f.id === fornecedorId)?.cpfCnpj ?? (fornInfo?.cpfCnpj ?? "—"))
                      : (fornInfo?.cpfCnpj ?? "—")
                  }
                  readOnly
                  className="bg-muted font-mono text-xs"
                />
              </div>
              {fornInfo?.contato && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Contato</Label>
                  <Input value={fornInfo.contato} readOnly className="bg-muted" />
                </div>
              )}
              {fornInfo?.email && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">E-mail</Label>
                  <Input value={fornInfo.email} readOnly className="bg-muted" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Seção 3: Local de Estoque ────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Local de Estoque</h2>
          </div>
          <div className="p-4 flex flex-col md:flex-row md:items-end gap-4">
            {/* Mode toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Modo de entrada</Label>
              <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted w-fit">
                <button
                  type="button"
                  onClick={() => nfEditable && handleModoChange("GLOBAL")}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-xs font-medium transition-colors",
                    modoLocalEstoque === "GLOBAL"
                      ? "bg-card text-info shadow-sm border border-info/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Global
                </button>
                <button
                  type="button"
                  onClick={() => nfEditable && handleModoChange("POR_ITEM")}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-xs font-medium transition-colors",
                    modoLocalEstoque === "POR_ITEM"
                      ? "bg-card text-info shadow-sm border border-info/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Por Item
                </button>
              </div>
            </div>

            {/* Global local selector */}
            {modoLocalEstoque === "GLOBAL" && (
              <div className="space-y-1.5 flex-1 max-w-xs">
                <Label className="text-xs text-muted-foreground">
                  Local de Estoque <span className="text-red-500">*</span>
                </Label>
                {nfEditable ? (
                  <ComboboxWithCreate
                    value={localEstoqueGlobalId}
                    onChange={(v) => handleGlobalLocalChange(v)}
                    placeholder="Selecionar local..."
                    noneLabel="Selecionar local..."
                    triggerClassName={cn("h-9 rounded-md", !localEstoqueGlobalId && "border-red-300")}
                    options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                  />
                ) : (
                  <Input
                    value={locaisEstoque.find((l) => l.id === localEstoqueGlobalId)?.nome ?? "—"}
                    readOnly
                    className="bg-muted"
                  />
                )}
              </div>
            )}

            {modoLocalEstoque === "POR_ITEM" && (
              <p className="text-xs text-muted-foreground pb-1.5">
                O local de estoque será definido individualmente para cada item na tabela abaixo.
              </p>
            )}
          </div>
        </div>

        {/* ── Seção 4: Itens ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Itens</CardTitle>
              {itemsEditable && (
                <button
                  type="button"
                  onClick={() => setShowAddRow((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-info hover:text-info transition-colors"
                >
                  <span className="text-base leading-none">+</span> Adicionar item
                </button>
              )}
            </div>
          </CardHeader>
          {/* ── Busca de produto para adicionar ──────────────────────────── */}
          {itemsEditable && showAddRow && (() => {
            const q = addItemSearch.toLowerCase().trim();
            const filteredProdutos = q
              ? produtos.filter((p) => p.descricao.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)).slice(0, 10)
              : [];
            return (
              <div className="px-4 py-3 border-b border-border bg-info/10">
                <div className="relative max-w-sm">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar produto por código ou descrição..."
                    value={addItemSearch}
                    onChange={(e) => setAddItemSearch(e.target.value)}
                    className="w-full h-8 px-3 border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {filteredProdutos.length > 0 && (
                    <div className="absolute top-9 left-0 z-50 w-full bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {filteredProdutos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-info/10 flex items-center gap-2 text-sm"
                          onClick={() => addNewItemRow(p)}
                        >
                          <span className="font-mono text-xs text-muted-foreground shrink-0">{p.codigo}</span>
                          <span className="text-foreground">{p.descricao}</span>
                          <span className="ml-auto text-xs text-muted-foreground shrink-0">{p.unidadeMedida}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {q && filteredProdutos.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Nenhum produto encontrado.</p>
                  )}
                </div>
              </div>
            );
          })()}
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">#NF</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Produto</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Descrição</th>
                    {modoLocalEstoque === "POR_ITEM" && (
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Local Estoque</th>
                    )}
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">U.M.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Qtd. Pedida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Qtd. Recebida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Vlr. Unit.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">% Desc.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Vlr. Total</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Vlr. IPI</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Vlr. ICMS</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                    {itemsEditable && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conferencia.itens.map((item, idx) => {
                    const ei = editItems[idx];
                    const qtdPedida = decimalToNumber(item.quantidadePedida);
                    const qtdRecebida = parseFloat(ei?.quantidadeRecebida ?? "0") || 0;
                    const itemStatus = getItemStatus(qtdPedida, qtdRecebida);
                    const localNome = item.localEstoque?.nome ?? null;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-muted ${item.divergencia && !itemsEditable ? "bg-warning/10" : ""}`}
                      >
                        <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.item.codigo}</td>
                        <td className="px-3 py-2 text-xs text-foreground max-w-[200px]">{item.item.descricao}</td>

                        {/* Local Estoque — only shown in Por Item mode */}
                        {modoLocalEstoque === "POR_ITEM" && (
                          <td className="px-3 py-2">
                            {canEdit && ei ? (
                              <ComboboxWithCreate
                                value={ei.localEstoqueId}
                                onChange={(v) => updateEditItem(item.id, "localEstoqueId", v)}
                                noneLabel="—"
                                triggerClassName={cn("h-7 rounded text-xs", !ei.localEstoqueId && "border-red-400 bg-danger/10 text-danger")}
                                options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{localNome ?? "—"}</span>
                            )}
                          </td>
                        )}

                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.item.unidadeMedida}</td>

                        {/* Qtd. Pedida */}
                        <td className="px-3 py-2 text-right text-xs text-foreground">
                          {qtdPedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>

                        {/* Qtd. Recebida (+ unidade de compra, se houver) */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  className="w-24 text-right h-7 text-xs"
                                  value={ei.quantidadeRecebida}
                                  onChange={(e) => updateItemAndCalc(item.id, "quantidadeRecebida", e.target.value)}
                                />
                                {ei.unidades.length > 1 && (
                                  <select
                                    value={ei.unidadeId}
                                    onChange={(e) => setEditItems((prev) => prev.map((x) => x.id === item.id ? { ...x, unidadeId: e.target.value } : x))}
                                    className="h-7 rounded border border-border bg-card px-1 text-xs"
                                    title="Unidade da compra"
                                  >
                                    {ei.unidades.map((u) => (
                                      <option key={u.unidadeId || "base"} value={u.unidadeId}>{u.sigla}{u.base ? "" : ` (×${u.fator})`}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              {(() => {
                                const u = ei.unidades.find((x) => x.unidadeId === ei.unidadeId);
                                const fator = u && !u.base ? u.fator : 1;
                                if (fator === 1) return null;
                                const base = (parseFloat(ei.quantidadeRecebida) || 0) * fator;
                                return <span className="text-[10px] text-muted-foreground">= {base.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {ei.baseSigla}</span>;
                              })()}
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                            </span>
                          )}
                        </td>

                        {/* Vlr. Unit (por unidade de compra; mostra o custo na base) */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-24 text-right h-7 text-xs"
                                value={ei.vlrUnitario}
                                onChange={(e) => updateItemAndCalc(item.id, "vlrUnitario", e.target.value)}
                              />
                              {(() => {
                                const u = ei.unidades.find((x) => x.unidadeId === ei.unidadeId);
                                const fator = u && !u.base ? u.fator : 1;
                                if (fator === 1) return null;
                                const custoBase = (parseFloat(ei.vlrUnitario) || 0) / fator;
                                return <span className="text-[10px] text-muted-foreground">{formatBRL(custoBase)}/{ei.baseSigla}</span>;
                              })()}
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrUnitario) > 0
                                ? formatBRL(decimalToNumber(item.vlrUnitario))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* % Desc. */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <div className="relative w-20 ml-auto">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className="w-20 text-right h-7 text-xs pr-5"
                                value={ei.desconto}
                                onChange={(e) => updateItemAndCalc(item.id, "desconto", e.target.value)}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.desconto) > 0
                                ? `${decimalToNumber(item.desconto)}%`
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Vlr. Total */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrTotal}
                              onChange={(e) => updateEditItem(item.id, "vlrTotal", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrTotal) > 0
                                ? formatBRL(decimalToNumber(item.vlrTotal))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Vlr. IPI */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrIPI}
                              onChange={(e) => updateEditItem(item.id, "vlrIPI", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrIPI) > 0
                                ? formatBRL(decimalToNumber(item.vlrIPI))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Vlr. ICMS */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrICMS}
                              onChange={(e) => updateEditItem(item.id, "vlrICMS", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrICMS) > 0
                                ? formatBRL(decimalToNumber(item.vlrICMS))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${itemStatus.cls}`}
                          >
                            {itemsEditable ? itemStatus.label : (item.divergencia ? "Divergência" : "OK")}
                          </span>
                        </td>
                        {itemsEditable && <td className="w-8" />}
                      </tr>
                    );
                  })}

                  {/* ── Novas linhas adicionadas ─────────────────────────── */}
                  {newItems.map((ni) => (
                    <tr key={ni._key} className="bg-info/10 hover:bg-info/10">
                      <td className="px-3 py-2 text-xs text-blue-400">+</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{ni.codigo}</td>
                      <td className="px-3 py-2 text-xs text-foreground max-w-[200px]">{ni.descricao}</td>
                      {modoLocalEstoque === "POR_ITEM" && (
                        <td className="px-3 py-2">
                          <ComboboxWithCreate
                            value={ni.localEstoqueId}
                            onChange={(v) => updateNewItem(ni._key, "localEstoqueId", v)}
                            noneLabel="—"
                            triggerClassName={cn("h-7 rounded text-xs", !ni.localEstoqueId && "border-red-400 bg-danger/10 text-danger")}
                            options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-xs text-muted-foreground">{ni.unidadeMedida}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" step="0.001" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.quantidadeRecebida}
                          onChange={(e) => updateNewItem(ni._key, "quantidadeRecebida", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrUnitario}
                          onChange={(e) => updateNewItem(ni._key, "vlrUnitario", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative w-20 ml-auto">
                          <Input
                            type="number" step="0.01" min="0" max="100"
                            className="w-20 text-right h-7 text-xs pr-5"
                            value={ni.desconto}
                            onChange={(e) => updateNewItem(ni._key, "desconto", e.target.value)}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrTotal}
                          onChange={(e) => updateNewItem(ni._key, "vlrTotal", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrIPI}
                          onChange={(e) => updateNewItem(ni._key, "vlrIPI", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrICMS}
                          onChange={(e) => updateNewItem(ni._key, "vlrICMS", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeNewItem(ni._key)}
                          className="text-red-400 hover:text-danger text-xs font-medium"
                          title="Remover"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Seção 4: Totais ──────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Totais</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vlr. Mercadoria</Label>
              {itemsEditable ? (
                <Input value={formatBRL(vlrMercadoria)} readOnly className="bg-muted text-right" />
              ) : (
                <Input value={vlrMercadoria > 0 ? formatBRL(vlrMercadoria) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Condição de Pagamento</Label>
              {nfEditable ? (
                <ComboboxWithCreate
                  value={condicaoPagamentoId}
                  onChange={(v) => setCondicaoPagamentoId(v)}
                  noneLabel="— Herdar do pedido / à vista —"
                  triggerClassName="h-9 rounded-md"
                  options={condicoes.map((c) => ({ value: c.id, label: c.nome }))}
                />
              ) : (
                <Input value={condicoes.find((c) => c.id === condicaoPagamentoId)?.nome ?? "—"} readOnly className="bg-muted" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Natureza Financeira</Label>
              {nfEditable ? (
                <NaturezaCombobox
                  value={naturezaFinanceiraId}
                  onChange={setNaturezaFinanceiraId}
                  naturezas={naturezas}
                  placeholder="— Selecionar natureza —"
                />
              ) : (
                <Input value={naturezas.find((n) => n.id === naturezaFinanceiraId)?.nome ?? "—"} readOnly className="bg-muted" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Frete</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={frete}
                  onChange={(e) => setFrete(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={freteNum > 0 ? formatBRL(freteNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Seguro</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={seguro}
                  onChange={(e) => setSeguro(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={seguroNum > 0 ? formatBRL(seguroNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Despesas</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={despesas}
                  onChange={(e) => setDespesas(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={despesasNum > 0 ? formatBRL(despesasNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desc. Total Itens</Label>
              <Input
                value={descontoTotalItens > 0 ? formatBRL(descontoTotalItens) : "—"}
                readOnly
                className="bg-muted text-right text-danger"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desc. Global (NF)</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={descontoNum > 0 ? formatBRL(descontoNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vlr. Bruto</Label>
              <Input
                value={vlrBruto > 0 ? formatBRL(vlrBruto) : "—"}
                readOnly
                className="bg-info/10 text-right font-bold text-blue-900 border-info/30"
              />
            </div>
          </div>
        </div>

        {/* ── Responsável ──────────────────────────────────────────────────── */}
        {(isEditable || isDivergencia || (isConcluded && isAdmin)) && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-1.5 max-w-xs">
                <Label>Responsável pela Conferência</Label>
                <ComboboxWithCreate
                  value={usuarioResponsavelId}
                  onChange={(v) => {
                    const selected = usuarios.find((u) => u.id === v);
                    setUsuarioResponsavelId(v);
                    setResponsavel(selected?.nome ?? "");
                  }}
                  noneLabel="— Selecionar usuário —"
                  triggerClassName="h-9 rounded-md"
                  options={usuarios.map((u) => ({ value: u.id, label: u.nome }))}
                />
              </div>
            </CardContent>
          </Card>
        )}


        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex gap-3 flex-wrap">
          {isPendente && (
            <Button onClick={iniciarConferencia} disabled={actioning}>
              {actioning ? "Iniciando..." : "Iniciar Conferência"}
            </Button>
          )}

          {canEdit && !actioning && (
            <Button variant="outline" onClick={salvarConferencia} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Progresso"}
            </Button>
          )}

          {(isEditable || isDivergencia) && (
            <Button
              onClick={() => {
                if (hasDivergencias) {
                  setShowDivergenciaConfirm(true);
                } else {
                  concluir();
                }
              }}
              disabled={actioning}
            >
              {actioning ? "Concluindo..." : "Concluir"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Popup: novos vínculos fornecedor × produto ───────────────────────── */}
      {vinculoPopup && (
        <div className="fixed inset-0 z-[9200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setVinculoPopup(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-border">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10">
                <LinkIcon className="w-5 h-5 text-info" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Novo vínculo fornecedor × produto</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ao concluir, {vinculoPopup.novos.length === 1 ? "o produto abaixo será vinculado" : `os ${vinculoPopup.novos.length} produtos abaixo serão vinculados`} ao fornecedor{" "}
                  <span className="font-medium text-foreground">{vinculoPopup.fornecedorNome}</span> pela primeira vez.
                </p>
              </div>
            </div>
            {/* Product list */}
            <ul className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
              {vinculoPopup.novos.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                  <span className="font-mono text-[11px] text-muted-foreground w-16 shrink-0">{item.codigo}</span>
                  <span className="text-sm text-foreground">{item.descricao}</span>
                </li>
              ))}
            </ul>
            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 bg-muted border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setVinculoPopup(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => doConcluir()}
              >
                Confirmar e concluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
