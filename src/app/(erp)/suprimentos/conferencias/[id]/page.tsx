"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Search, Plus, X, ChevronDown, ShieldAlert } from "lucide-react";

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
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
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
  pedidoId: string | null;
  localEstoqueId: string | null;
  modoLocalEstoque: string | null;
  localEstoque: { id: string; nome: string } | null;
  pedido: {
    id: string;
    numero: string;
    fornecedor: FornecedorInfo;
  } | null;
  fornecedor: FornecedorInfo | null;
  itens: ConferenciaItem[];
};

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
};

type LocalEstoqueOption = { id: string; nome: string };

function getItemStatus(pedida: number, recebida: number): { label: string; cls: string } {
  if (recebida === 0) return { label: "Faltante", cls: "bg-red-100 text-red-700" };
  if (Math.abs(pedida - recebida) > 0.001) return { label: "Divergência", cls: "bg-amber-100 text-amber-700" };
  return { label: "OK", cls: "bg-green-100 text-green-700" };
}

export default function DocumentoEntradaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";

  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [actioning, setActioning] = useState(false);
  const [autoVinculoMsg, setAutoVinculoMsg] = useState<string | null>(null);
  const [scAtendidaMsg, setScAtendidaMsg] = useState<{ numero: string; status: string }[] | null>(null);

  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // NF fields (editable when PENDENTE)
  const [tipoNota, setTipoNota] = useState("");
  const [numeroNF, setNumeroNF] = useState("");
  const [serie, setSerie] = useState("");
  const [dtEmissao, setDtEmissao] = useState("");
  const [ufOrigem, setUfOrigem] = useState("");
  const [frete, setFrete] = useState("");
  const [seguro, setSeguro] = useState("");
  const [despesas, setDespesas] = useState("");
  const [desconto, setDesconto] = useState("");
  const [validationError, setValidationError] = useState("");

  // Local de estoque (header-level)
  const [modoLocalEstoque, setModoLocalEstoque] = useState<"GLOBAL" | "POR_ITEM">("POR_ITEM");
  const [localEstoqueGlobalId, setLocalEstoqueGlobalId] = useState("");

  // Fornecedor search (editable)
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([]);
  const [fornSearch, setFornSearch] = useState("");
  const [fornDropOpen, setFornDropOpen] = useState(false);
  const fornRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [locaisEstoque, setLocaisEstoque] = useState<LocalEstoqueOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`);
      const json = await res.json();
      const conf: Conferencia = json.data;
      setConferencia(conf);
      setAdminStatus(conf.status);
      setResponsavel(conf.responsavel ?? "");
      setObservacoes(conf.observacoes ?? "");
      setTipoNota(conf.tipoNota ?? "NORMAL");
      setNumeroNF(conf.numeroNF ?? "");
      setSerie(conf.serie ?? "");
      setDtEmissao(conf.dtEmissao ? conf.dtEmissao.slice(0, 10) : "");
      setUfOrigem(conf.ufOrigem ?? "");
      setFrete(decimalToNumber(conf.frete) > 0 ? String(decimalToNumber(conf.frete)) : "");
      const forn = conf.fornecedor ?? conf.pedido?.fornecedor ?? null;
      setFornecedorId(forn?.id ?? "");
      setFornSearch(forn ? (forn.nomeFantasia || forn.razaoSocial) : "");
      const modo = (conf.modoLocalEstoque === "GLOBAL" ? "GLOBAL" : "POR_ITEM") as "GLOBAL" | "POR_ITEM";
      setModoLocalEstoque(modo);
      setLocalEstoqueGlobalId(conf.localEstoqueId ?? "");
      setSeguro(decimalToNumber(conf.seguro) > 0 ? String(decimalToNumber(conf.seguro)) : "");
      setDespesas(decimalToNumber(conf.despesas) > 0 ? String(decimalToNumber(conf.despesas)) : "");
      setDesconto(decimalToNumber(conf.desconto) > 0 ? String(decimalToNumber(conf.desconto)) : "");

      const resolvedModo = conf.modoLocalEstoque === "GLOBAL" ? "GLOBAL" : "POR_ITEM";
      const globalLocalId = conf.localEstoqueId ?? "";
      setEditItems(
        conf.itens.map((i) => ({
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
        }))
      );
    } catch {
      setError("Erro ao carregar documento");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
    if (!fornDropOpen) return;
    function handle(e: MouseEvent) {
      if (fornRef.current && !fornRef.current.contains(e.target as Node)) setFornDropOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [fornDropOpen]);

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

    setSaving(true);
    setActionError("");
    try {
      const isConcludedStatus = conferencia?.status === "CONCLUIDA" || conferencia?.status === "DIVERGENCIA";
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
          frete: frete ? parseFloat(frete) : null,
          seguro: seguro ? parseFloat(seguro) : null,
          despesas: despesas ? parseFloat(despesas) : null,
          desconto: desconto ? parseFloat(desconto) : null,
          // Admin can change status on concluded DEs
          ...(isAdmin && isConcludedStatus ? { status: adminStatus } : {}),
          itens: editItems.map((i) => ({
            id: i.id,
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
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao salvar");
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function concluir() {
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
      if (json.autoVinculos?.length > 0) {
        setAutoVinculoMsg(
          `Vinculação automática: ${json.autoVinculos.join(", ")} ${json.autoVinculos.length === 1 ? "foi vinculado" : "foram vinculados"} ao fornecedor.`
        );
        setTimeout(() => setAutoVinculoMsg(null), 7000);
      }
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

  useTabTitle(conferencia ? `Doc. ${conferencia.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-gray-400">Carregando...</div>;
  if (!conferencia) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const isPendente   = conferencia.status === "PENDENTE";
  const isEditable   = conferencia.status === "EM_CONFERENCIA";
  const isConcluded  = conferencia.status === "CONCLUIDA" || conferencia.status === "DIVERGENCIA";
  const canEdit      = isPendente || isEditable || (isConcluded && isAdmin);
  const nfEditable   = canEdit;
  const itemsEditable = isEditable || (isConcluded && isAdmin);

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
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-6xl space-y-6">
        {(actionError || validationError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {validationError || actionError}
          </div>
        )}

        {/* ── Banner: modo edição administrativa ───────────────────────────── */}
        {isConcluded && isAdmin && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-sm">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium">Modo edição administrativa</span>
            <span className="text-amber-600">— alterações salvas substituirão os dados do documento concluído.</span>
          </div>
        )}

        {/* ── Seção 1: Nota Fiscal ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Nota Fiscal</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Tipo (obrigatório) */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Tipo <span className="text-red-500">*</span></Label>
              {nfEditable ? (
                <select
                  value={tipoNota}
                  onChange={(e) => setTipoNota(e.target.value)}
                  className={cn(
                    "w-full h-9 px-3 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500",
                    !tipoNota ? "border-red-300" : "border-gray-200"
                  )}
                >
                  <option value="">Selecione...</option>
                  <option value="NORMAL">Normal</option>
                  <option value="COMPLEMENTAR">Complementar</option>
                  <option value="DEVOLUCAO">Devolução</option>
                  <option value="ENTRADA_SIMBOLICA">Entrada Simbólica</option>
                </select>
              ) : (
                <Input value={conferencia.tipoNota ?? "—"} readOnly className="bg-gray-50" />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Série</Label>
              {nfEditable ? (
                <Input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="1" />
              ) : (
                <Input value={conferencia.serie ?? "—"} readOnly className="bg-gray-50" />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Número NF</Label>
              {nfEditable ? (
                <Input value={numeroNF} onChange={(e) => setNumeroNF(e.target.value)} placeholder="000000" />
              ) : (
                <Input value={conferencia.numeroNF ?? "—"} readOnly className="bg-gray-50" />
              )}
            </div>

            {/* DT Emissão (obrigatório) */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">DT Emissão <span className="text-red-500">*</span></Label>
              {nfEditable ? (
                <Input
                  type="date"
                  value={dtEmissao}
                  onChange={(e) => setDtEmissao(e.target.value)}
                  className={!dtEmissao ? "border-red-300" : ""}
                />
              ) : (
                <Input
                  value={conferencia.dtEmissao ? formatDate(conferencia.dtEmissao) : "—"}
                  readOnly
                  className="bg-gray-50"
                />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">UF Origem</Label>
              {nfEditable ? (
                <select
                  value={ufOrigem}
                  onChange={(e) => setUfOrigem(e.target.value)}
                  className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">—</option>
                  {UF_LIST.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              ) : (
                <Input value={conferencia.ufOrigem ?? "—"} readOnly className="bg-gray-50" />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Conferência</Label>
              <Input
                value={conferencia.dataConferencia ? formatDate(conferencia.dataConferencia) : "—"}
                readOnly
                className="bg-gray-50"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Nº Documento</Label>
              <Input value={conferencia.numero} readOnly className="bg-gray-50 font-mono text-xs" />
            </div>
          </div>
        </div>

        {/* ── Seção 2: Fornecedor ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Fornecedor</h2>
            {conferencia.pedido && (
              <Link
                href={`/suprimentos/pedidos-compra/${conferencia.pedido.id}`}
                className="text-xs text-blue-600 hover:underline font-mono"
              >
                Pedido vinculado: {conferencia.pedido.numero}
              </Link>
            )}
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Fornecedor search — editable when nfEditable */}
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-gray-500">
                Fornecedor <span className="text-red-500">*</span>
              </Label>
              {nfEditable ? (
                <div className="flex gap-2">
                  <div className="relative flex-1" ref={fornRef}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <Input
                      className={cn("pl-8 pr-8", !fornecedorId ? "border-red-300" : "")}
                      placeholder="Buscar fornecedor..."
                      value={fornSearch}
                      onChange={(e) => {
                        setFornSearch(e.target.value);
                        setFornecedorId("");
                        setFornDropOpen(true);
                      }}
                      onFocus={() => setFornDropOpen(true)}
                    />
                    {fornSearch && (
                      <button
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => { setFornSearch(""); setFornecedorId(""); }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {fornDropOpen && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                        {fornecedores
                          .filter((f) => {
                            const q = fornSearch.toLowerCase();
                            return !q || (f.nomeFantasia ?? "").toLowerCase().includes(q) || f.razaoSocial.toLowerCase().includes(q) || (f.cpfCnpj ?? "").includes(q);
                          })
                          .slice(0, 10)
                          .map((f) => (
                            <button
                              key={f.id}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm transition-colors"
                              onClick={() => {
                                setFornecedorId(f.id);
                                setFornSearch(f.nomeFantasia || f.razaoSocial);
                                setFornDropOpen(false);
                              }}
                            >
                              <span className="font-medium text-gray-800">{f.nomeFantasia || f.razaoSocial}</span>
                              {f.cpfCnpj && <span className="ml-2 text-xs text-gray-400 font-mono">{f.cpfCnpj}</span>}
                            </button>
                          ))}
                        {fornecedores.filter((f) => {
                          const q = fornSearch.toLowerCase();
                          return !q || (f.nomeFantasia ?? "").toLowerCase().includes(q) || f.razaoSocial.toLowerCase().includes(q);
                        }).length === 0 && (
                          <p className="px-3 py-2 text-sm text-gray-400">Nenhum fornecedor encontrado</p>
                        )}
                      </div>
                    )}
                  </div>
                  <a
                    href="/suprimentos/fornecedores/novo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo
                  </a>
                </div>
              ) : (
                <Input value={fornNome} readOnly className="bg-gray-50" />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">CNPJ</Label>
              <Input value={fornInfo?.cpfCnpj ?? "—"} readOnly className="bg-gray-50 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Contato</Label>
              <Input value={fornInfo?.contato ?? "—"} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">E-mail</Label>
              <Input value={fornInfo?.email ?? "—"} readOnly className="bg-gray-50" />
            </div>
          </div>
        </div>

        {/* ── Seção 3: Local de Estoque ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Local de Estoque</h2>
          </div>
          <div className="p-4 flex flex-col md:flex-row md:items-end gap-4">
            {/* Mode toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Modo de entrada</Label>
              <div className="flex items-center border border-gray-200 rounded-lg p-0.5 bg-gray-50 w-fit">
                <button
                  type="button"
                  onClick={() => nfEditable && handleModoChange("GLOBAL")}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-xs font-medium transition-colors",
                    modoLocalEstoque === "GLOBAL"
                      ? "bg-white text-blue-700 shadow-sm border border-blue-200"
                      : "text-gray-500 hover:text-gray-700"
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
                      ? "bg-white text-blue-700 shadow-sm border border-blue-200"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Por Item
                </button>
              </div>
            </div>

            {/* Global local selector */}
            {modoLocalEstoque === "GLOBAL" && (
              <div className="space-y-1.5 flex-1 max-w-xs">
                <Label className="text-xs text-gray-500">
                  Local de Estoque <span className="text-red-500">*</span>
                </Label>
                {nfEditable ? (
                  <select
                    value={localEstoqueGlobalId}
                    onChange={(e) => handleGlobalLocalChange(e.target.value)}
                    className={cn(
                      "w-full h-9 px-3 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500",
                      !localEstoqueGlobalId ? "border-red-300" : "border-gray-200"
                    )}
                  >
                    <option value="">Selecionar local...</option>
                    {locaisEstoque.map((l) => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={locaisEstoque.find((l) => l.id === localEstoqueGlobalId)?.nome ?? "—"}
                    readOnly
                    className="bg-gray-50"
                  />
                )}
              </div>
            )}

            {modoLocalEstoque === "POR_ITEM" && (
              <p className="text-xs text-gray-400 pb-1.5">
                O local de estoque será definido individualmente para cada item na tabela abaixo.
              </p>
            )}
          </div>
        </div>

        {/* ── Seção 4: Itens ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Itens</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">#NF</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Produto</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Descrição</th>
                    {modoLocalEstoque === "POR_ITEM" && (
                      <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Local Estoque</th>
                    )}
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">U.M.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Qtd. Pedida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Qtd. Recebida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Vlr. Unit.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">% Desc.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Vlr. Total</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Vlr. IPI</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Vlr. ICMS</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-600 text-xs">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {conferencia.itens.map((item, idx) => {
                    const ei = editItems[idx];
                    const qtdPedida = decimalToNumber(item.quantidadePedida);
                    const qtdRecebida = parseFloat(ei?.quantidadeRecebida ?? "0") || 0;
                    const itemStatus = getItemStatus(qtdPedida, qtdRecebida);
                    const localNome = item.localEstoque?.nome ?? null;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50 ${item.divergencia && !itemsEditable ? "bg-amber-50/50" : ""}`}
                      >
                        <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.item.codigo}</td>
                        <td className="px-3 py-2 text-xs text-gray-800 max-w-[200px]">{item.item.descricao}</td>

                        {/* Local Estoque — only shown in Por Item mode */}
                        {modoLocalEstoque === "POR_ITEM" && (
                          <td className="px-3 py-2">
                            {itemsEditable && ei ? (
                              <select
                                value={ei.localEstoqueId}
                                onChange={(e) => updateEditItem(item.id, "localEstoqueId", e.target.value)}
                                className="w-full h-7 px-2 border border-gray-200 rounded text-xs bg-white focus:outline-none"
                              >
                                <option value="">—</option>
                                {locaisEstoque.map((l) => (
                                  <option key={l.id} value={l.id}>{l.nome}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-600">{localNome ?? "—"}</span>
                            )}
                          </td>
                        )}

                        <td className="px-3 py-2 text-xs text-gray-500">{item.item.unidadeMedida}</td>

                        {/* Qtd. Pedida */}
                        <td className="px-3 py-2 text-right text-xs text-gray-700">
                          {qtdPedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>

                        {/* Qtd. Recebida */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.quantidadeRecebida}
                              onChange={(e) => updateItemAndCalc(item.id, "quantidadeRecebida", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-gray-700">
                              {decimalToNumber(item.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                            </span>
                          )}
                        </td>

                        {/* Vlr. Unit */}
                        <td className="px-3 py-2">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrUnitario}
                              onChange={(e) => updateItemAndCalc(item.id, "vlrUnitario", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-gray-700">
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
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-gray-700">
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
                            <span className="block text-right text-xs text-gray-700">
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
                            <span className="block text-right text-xs text-gray-700">
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
                            <span className="block text-right text-xs text-gray-700">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Seção 4: Totais ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Totais</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vlr. Mercadoria</Label>
              {itemsEditable ? (
                <Input value={formatBRL(vlrMercadoria)} readOnly className="bg-gray-50 text-right" />
              ) : (
                <Input value={vlrMercadoria > 0 ? formatBRL(vlrMercadoria) : "—"} readOnly className="bg-gray-50 text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Frete</Label>
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
                <Input value={freteNum > 0 ? formatBRL(freteNum) : "—"} readOnly className="bg-gray-50 text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Seguro</Label>
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
                <Input value={seguroNum > 0 ? formatBRL(seguroNum) : "—"} readOnly className="bg-gray-50 text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Despesas</Label>
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
                <Input value={despesasNum > 0 ? formatBRL(despesasNum) : "—"} readOnly className="bg-gray-50 text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Desc. Total Itens</Label>
              <Input
                value={descontoTotalItens > 0 ? formatBRL(descontoTotalItens) : "—"}
                readOnly
                className="bg-gray-50 text-right text-red-600"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Desc. Global (NF)</Label>
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
                <Input value={descontoNum > 0 ? formatBRL(descontoNum) : "—"} readOnly className="bg-gray-50 text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vlr. Bruto</Label>
              <Input
                value={vlrBruto > 0 ? formatBRL(vlrBruto) : "—"}
                readOnly
                className="bg-blue-50 text-right font-bold text-blue-900 border-blue-200"
              />
            </div>
          </div>
        </div>

        {/* ── Responsável ──────────────────────────────────────────────────── */}
        {(isEditable || (isConcluded && isAdmin)) && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-1.5 max-w-xs">
                <Label>Responsável pela Conferência</Label>
                <Input
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  placeholder="Nome do conferente"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Admin: Alterar Status ──────────────────────────────────────── */}
        {isConcluded && isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-4">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800 shrink-0">Alterar status:</span>
            <select
              value={adminStatus}
              onChange={(e) => setAdminStatus(e.target.value)}
              className="h-8 px-3 border border-amber-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="PENDENTE">Pendente</option>
              <option value="EM_CONFERENCIA">Em Conferência</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="DIVERGENCIA">Divergência</option>
            </select>
          </div>
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

          {isEditable && (
            <Button
              onClick={concluir}
              disabled={actioning}
              className={hasDivergencias ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              {actioning
                ? "Concluindo..."
                : hasDivergencias
                ? "Concluir com Divergências"
                : "Concluir"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
