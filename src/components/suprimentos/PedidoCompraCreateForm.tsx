"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatBRL, parseDecimal } from "@/lib/utils";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useCreateDrawer, useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { useTabsContext } from "@/lib/tabs-context";
import {
  Plus, Trash2, Loader2, Save, CheckCircle2, LinkIcon,
  X, Search, AlertTriangle, ExternalLink, FileText, Link2, FileSpreadsheet,
} from "lucide-react";
import { useEscToClose } from "@/lib/use-esc-to-close";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import StatusBadge from "@/components/shared/StatusBadge";

type Fornecedor = {
  id: string; razaoSocial: string; nomeFantasia: string | null;
  cpfCnpj: string | null; contato: string | null; email: string | null;
};
type ItemOption = { id: string; codigo: string; descricao: string; unidadeMedida: string };

type ItemRow = {
  itemId: string;
  quantidade: string;
  precoUnitario: string;
  situacao: "CONSIDERA" | "NAO_CONSIDERA";
};

type FormSnapshot = {
  fornecedorId: string;
  descricao: string;
  contato: string;
  email: string;
  frete: string;
  tipoFrete: string;
  desconto: string;
  despesas: string;
  seguro: string;
  condicoesPagamento: string;
  dataEntregaPrevista: string;
  itens: ItemRow[];
};

// Cotação aberta compatível (anti-duplicidade) — retornada por /cotacoes/match.
type CotacaoMatch = {
  id: string;
  numero: string;
  nome: string | null;
  necessidadeNumero: string | null;
  matchCount: number;
  totalItens: number;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
};

// SC elegível para vincular o pedido (com itens p/ pré-preenchimento e cotações p/ ramificar o fluxo).
type ScEligible = {
  id: string;
  numero: string;
  status: string;
  justificativa: string | null;
  cotacoes: {
    id: string; numero: string; status: string;
    pedidos: { id: string; numero: string; status: string }[];
  }[];
  pedidosCompra: { id: string; numero: string; status: string }[];
  itens: {
    quantidade: unknown;
    unidade: string | null;
    item: {
      id: string; codigo: string; descricao: string;
      unidadeMedida: string; unidade: { sigla: string } | null;
    } | null;
  }[];
};

// Cotação "em andamento" de uma SC = ainda não concluída/cancelada.
function cotacaoEmAndamento(sc: ScEligible) {
  return sc.cotacoes.find((c) => c.status === "PENDENTE" || c.status === "EM_ANALISE") ?? null;
}

// SC já tem Pedido de Compra ativo (direto ou via cotação)? Pedido cancelado não conta.
function temPedidoAtivo(sc: ScEligible) {
  const direto     = sc.pedidosCompra.some((p) => p.status !== "CANCELADO");
  const viaCotacao = sc.cotacoes.some((c) => c.pedidos.some((p) => p.status !== "CANCELADO"));
  return direto || viaCotacao;
}

// Rótulo de unidade de um item da SC.
function unidadeItem(it: ScEligible["itens"][number]) {
  return it.item?.unidade?.sigla || it.unidade || it.item?.unidadeMedida || "UN";
}

const TIPO_FRETE_OPTIONS = [
  { value: "C", label: "C-CIF" },
  { value: "F", label: "F-FOB" },
  { value: "T", label: "T-CIF/FOB" },
  { value: "O", label: "Outro" },
];

export default function PedidoCompraCreateForm() {
  const drawer = useCreateDrawer();
  const voltar = useVoltarCriacao("/suprimentos/pedidos-compra");
  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "pedido de compra",
    onNew: () => { window.location.href = "/suprimentos/pedidos-compra/novo"; },
    viewHref: (id) => `/suprimentos/pedidos-compra/${id}`,
  });
  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<FormSnapshot>("pc:novo");

  // Data
  const [fornecedores, setFornecedores]   = useState<Fornecedor[]>([]);
  const [itemOptions, setItemOptions]     = useState<ItemOption[]>([]);
  const [condicoesList, setCondicoesList] = useState<{ id: string; nome: string }[]>([]);

  // Fornecedor section
  const [fornecedorId, setFornecedorIdState] = useState("");
  const [descricao, setDescricao]            = useState("");
  const [contato, setContato]                = useState("");
  const [email, setEmail]                    = useState("");

  // Financeiro section
  const [frete, setFrete]                         = useState("");
  const [tipoFrete, setTipoFrete]                 = useState("");
  const [desconto, setDesconto]                   = useState("");
  const [despesas, setDespesas]                   = useState("");
  const [seguro, setSeguro]                       = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [dataEntregaPrevista, setDataEntregaPrevista] = useState("");

  // Items
  const [itens, setItens] = useState<ItemRow[]>([
    { itemId: "", quantidade: "1", precoUnitario: "", situacao: "CONSIDERA" },
  ]);

  // Form state
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // Popup: novos vínculos fornecedor × produto
  type VinculoItem = { id: string; codigo: string; descricao: string };
  const [vinculoPopup, setVinculoPopup] = useState<{ fornecedorNome: string; novos: VinculoItem[] } | null>(null);
  useEscToClose(() => setVinculoPopup(null), !!vinculoPopup);

  // ── Tabs (fechar / transferir a aba do "Novo PC") ───────────────────────────
  const { closeCurrentTab, replaceCurrentTab } = useTabsContext();

  // ── Popup de escolha ao abrir: vincular a uma SC ou criar avulso ────────────
  const [choiceOpen, setChoiceOpen] = useState(true);
  const [choiceStep, setChoiceStep] = useState<"choose" | "vincular">("choose");

  // Picker de Solicitações de Compra (passo "vincular")
  const [scSearch, setScSearch]     = useState("");
  const [scOptions, setScOptions]   = useState<ScEligible[]>([]);
  const [scLoading, setScLoading]   = useState(false);
  const [selectedSc, setSelectedSc] = useState<ScEligible | null>(null);

  // Vínculo direto com a SC (sem passar por cotação)
  const [necessidadeId, setNecessidadeId]         = useState("");
  const [necessidadeNumero, setNecessidadeNumero] = useState("");

  // Anti-duplicidade: cotações abertas compatíveis + confirmação de avulso.
  const [cotacaoMatches, setCotacaoMatches]           = useState<CotacaoMatch[]>([]);
  const [cotacaoMatchLoading, setCotacaoMatchLoading] = useState(false);
  const [avulsoConfirmed, setAvulsoConfirmed]         = useState(false);

  function closeChoice() {
    setChoiceOpen(false);
    setChoiceStep("choose");
    setScSearch("");
    setSelectedSc(null);
  }

  // Ir formalizar a Cotação existente da SC (gera o próprio PC ao concluir).
  function goToFormalizacao(cotacaoId: string) {
    clearForm();
    replaceCurrentTab(`/suprimentos/cotacoes/${cotacaoId}/formalizacao`);
  }

  // Iniciar uma cotação a partir da SC.
  function iniciarCotacao(sc: ScEligible) {
    clearForm();
    replaceCurrentTab(`/suprimentos/cotacoes/nova?necessidadeId=${sc.id}`);
  }

  // Criar o PC direto, vinculado à SC (preenche itens da SC; libera o formulário).
  function criarDiretoNaSc(sc: ScEligible) {
    setNecessidadeId(sc.id);
    setNecessidadeNumero(sc.numero);
    const rows = sc.itens
      .filter((it) => it.item)
      .map((it) => ({
        itemId: it.item!.id,
        quantidade: String(Number(it.quantidade) || 1),
        precoUnitario: "",
        situacao: "CONSIDERA" as const,
      }));
    if (rows.length) setItens(rows);
    setAvulsoConfirmed(true); // optou conscientemente — pula o aviso de anti-duplicidade
    closeChoice();
  }

  // Carrega as SCs elegíveis ao entrar no passo "vincular".
  useEffect(() => {
    if (!(choiceOpen && choiceStep === "vincular")) return;
    const ctrl = new AbortController();
    setScLoading(true);
    fetch("/api/suprimentos/necessidades", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const all: ScEligible[] = Array.isArray(j?.data) ? j.data : [];
        // SCs que ainda podem gerar pedido de compra: aprovadas/em cotação e
        // que ainda NÃO têm um pedido ativo (direto ou via cotação).
        const elegiveis = all.filter(
          (sc) => ["APROVADA", "EM_COTACAO"].includes(sc.status) && !temPedidoAtivo(sc)
        );
        setScOptions(elegiveis);
      })
      .catch(() => { /* abort/erro — ignora */ })
      .finally(() => setScLoading(false));
    return () => ctrl.abort();
  }, [choiceOpen, choiceStep]);

  // Itens selecionados (só itemIds) — chave estável p/ o efeito anti-duplicidade.
  const itemIdsKey = itens.map((r) => r.itemId).filter(Boolean).join(",");

  // Anti-duplicidade: avisa se há Cotação aberta compatível (mesmo fornecedor +
  // itens em comum). Não roda com o popup aberto nem após confirmar avulso.
  useEffect(() => {
    if (choiceOpen || avulsoConfirmed || !fornecedorId || !itemIdsKey) {
      setCotacaoMatches([]);
      return;
    }
    const ctrl = new AbortController();
    setCotacaoMatchLoading(true);
    const t = setTimeout(() => {
      fetch(
        `/api/suprimentos/cotacoes/match?fornecedorId=${encodeURIComponent(fornecedorId)}&itemIds=${encodeURIComponent(itemIdsKey)}`,
        { signal: ctrl.signal },
      )
        .then((r) => r.json())
        .then((j) => setCotacaoMatches(Array.isArray(j?.matches) ? j.matches : []))
        .catch(() => { /* abort/erro — ignora */ })
        .finally(() => setCotacaoMatchLoading(false));
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [choiceOpen, avulsoConfirmed, fornecedorId, itemIdsKey]);

  const isDirty = !!(fornecedorId || itens.some(r => r.itemId));
  useDirtyForm(isDirty);

  // Auto-save effect
  useEffect(() => {
    saveForm({ fornecedorId, descricao, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, itens });
  }, [fornecedorId, descricao, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, itens, saveForm]);

  // Restore on mount
  const formRestoredRef = useRef(false);
  useEffect(() => {
    if (formRestoredRef.current) return;
    formRestoredRef.current = true;
    const saved = loadForm();
    if (saved) {
      if (saved.fornecedorId !== undefined) setFornecedorIdState(saved.fornecedorId);
      if (saved.descricao   !== undefined) setDescricao(saved.descricao);
      if (saved.contato !== undefined) setContato(saved.contato);
      if (saved.email !== undefined) setEmail(saved.email);
      if (saved.frete !== undefined) setFrete(saved.frete);
      if (saved.tipoFrete !== undefined) setTipoFrete(saved.tipoFrete);
      if (saved.desconto !== undefined) setDesconto(saved.desconto);
      if (saved.despesas !== undefined) setDespesas(saved.despesas);
      if (saved.seguro !== undefined) setSeguro(saved.seguro);
      if (saved.condicoesPagamento !== undefined) setCondicoesPagamento(saved.condicoesPagamento);
      if (saved.dataEntregaPrevista !== undefined) setDataEntregaPrevista(saved.dataEntregaPrevista);
      if (saved.itens !== undefined) setItens(saved.itens);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : j.data ?? []));
    fetch("/api/itens?tipo=PRODUTO&limit=200")
      .then((r) => r.json())
      .then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
    fetch("/api/suprimentos/condicoes-pagamento")
      .then((r) => r.json())
      .then((list) => { if (Array.isArray(list)) setCondicoesList(list); })
      .catch(() => {});
  }, []);

  function setFornecedorId(id: string) {
    setFornecedorIdState(id);
    const f = fornecedores.find((f) => f.id === id);
    if (f) {
      setContato(f.contato ?? "");
      setEmail(f.email ?? "");
    }
  }

  function addRow() {
    setItens((p) => [...p, { itemId: "", quantidade: "1", precoUnitario: "", situacao: "CONSIDERA" }]);
  }
  function removeRow(i: number) {
    setItens((p) => p.filter((_, idx) => idx !== i));
  }
  function updateRow<K extends keyof ItemRow>(i: number, key: K, value: ItemRow[K]) {
    setItens((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  // ── Computed values ────────────────────────────────────────────────────────
  const totalItensQtd = itens.reduce((s, i) => s + (parseDecimal(i.quantidade) || 0), 0);

  const subtotalItens = itens
    .filter((i) => i.situacao === "CONSIDERA")
    .reduce((s, i) => s + (parseDecimal(i.quantidade) || 0) * (parseDecimal(i.precoUnitario) || 0), 0);

  const descontoVal    = parseDecimal(desconto)  || 0;
  const freteVal       = parseDecimal(frete)     || 0;
  const despesasVal    = parseDecimal(despesas)  || 0;
  const seguroVal      = parseDecimal(seguro)    || 0;
  const vrDescontoCalc = (subtotalItens * descontoVal) / 100;
  const totalCotacao   = subtotalItens - vrDescontoCalc + freteVal + despesasVal + seguroVal;

  const selectedForn = fornecedores.find((f) => f.id === fornecedorId);
  const fornNome     = selectedForn ? (selectedForn.nomeFantasia || selectedForn.razaoSocial) : "";
  const codigoForn   = fornecedorId ? fornecedorId.slice(-8).toUpperCase() : "";

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!fornecedorId) { setError("Selecione um fornecedor"); return; }
    if (!descricao.trim()) { setError("Descrição é obrigatória"); return; }
    const validItens = itens.filter(
      (row) => row.itemId && parseDecimal(row.quantidade) > 0
    );
    if (validItens.length === 0) { setError("Adicione pelo menos um item"); return; }

    // Anti-duplicidade: se há Cotação aberta compatível e o usuário não confirmou
    // que é avulso, bloqueia o envio e mantém o aviso (já visível no banner).
    if (!avulsoConfirmed && cotacaoMatches.length > 0) {
      setError("Existe Cotação aberta compatível. Vá para a Formalização dela ou confirme que este é um pedido avulso.");
      return;
    }

    // Verificar novos vínculos fornecedor × produto antes de criar o pedido
    const itemIds = validItens.map((r) => r.itemId).join(",");
    try {
      const checkRes = await fetch(
        `/api/suprimentos/fornecedor-vinculos-check?fornecedorId=${fornecedorId}&itemIds=${encodeURIComponent(itemIds)}`
      );
      if (checkRes.ok) {
        const { novos } = await checkRes.json() as { novos: { id: string; codigo: string; descricao: string }[] };
        if (novos?.length > 0) {
          setVinculoPopup({ fornecedorNome: fornNome, novos });
          return; // aguarda confirmação do usuário
        }
      }
    } catch { /* ignora erros de verificação — segue com o submit */ }

    await doSubmit(validItens);
  }

  async function doSubmit(validItens?: { itemId: string; quantidade: string; precoUnitario: string; situacao: string }[]) {
    setVinculoPopup(null);
    if (!validItens) {
      validItens = itens.filter((row) => row.itemId && parseDecimal(row.quantidade) > 0);
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/suprimentos/pedidos-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId,
          necessidadeId: necessidadeId || null,
          descricao: descricao.trim() || null,
          contato: contato || null,
          email:   email   || null,
          dataEntregaPrevista: dataEntregaPrevista || null,
          frete:               freteVal    || null,
          tipoFrete:           tipoFrete   || null,
          desconto:            descontoVal || null,
          vrDesconto:          vrDescontoCalc || null,
          despesas:            despesasVal || null,
          seguro:              seguroVal   || null,
          condicoesPagamento:  condicoesPagamento || null,
          confirmAvulso:       avulsoConfirmed,
          itens: validItens.map((row) => ({
            itemId:       row.itemId,
            quantidade:   parseDecimal(row.quantidade),
            precoUnitario: parseDecimal(row.precoUnitario) || 0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Rede de segurança do servidor: existe Cotação aberta compatível.
        // Mostra o aviso (banner) em vez de uma mensagem de erro genérica.
        if (res.status === 409 && json.error === "COTACAO_COMPATIVEL") {
          setCotacaoMatches(Array.isArray(json.matches) ? json.matches : []);
          setAvulsoConfirmed(false);
          setError("Existe Cotação aberta compatível. Vá para a Formalização dela ou confirme que este é um pedido avulso.");
          return;
        }
        setError(json.error || "Erro ao criar pedido");
        return;
      }
      clearForm();
      confirmCreated(json.data.id);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const acoes = (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={voltar}>Cancelar</Button>
      <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        {saving ? "Criando..." : "Criar Pedido de Compra"}
      </Button>
    </div>
  );

  return (
    <div>
      {!drawer && (
        <PageHeader
          title="Novo Pedido de Compra"
          breadcrumbs={[
            { label: "Suprimentos" },
            { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
            { label: "Novo" },
          ]}
          action={acoes}
        />
      )}
      {drawer && <div className="flex justify-end mb-4">{acoes}</div>}

      <div className={drawer ? "max-w-5xl space-y-6" : "px-8 pb-8 max-w-5xl space-y-6"}>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* ── Anti-duplicidade: Cotações abertas compatíveis ───────────────── */}
        {!avulsoConfirmed && cotacaoMatchLoading && cotacaoMatches.length === 0 && (
          <div className="text-xs text-gray-400 flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            Verificando Cotações compatíveis…
          </div>
        )}

        {!avulsoConfirmed && cotacaoMatches.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">
                  {cotacaoMatches.length === 1
                    ? "Encontramos 1 Cotação aberta compatível com este pedido."
                    : `Encontramos ${cotacaoMatches.length} Cotações abertas compatíveis com este pedido.`}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Mesmo fornecedor e itens em comum. Formalize a Cotação para gerar o Pedido a partir dela (com baixa na Solicitação), ou confirme que este é um pedido avulso.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {cotacaoMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 bg-white border border-amber-100 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-gray-800 text-sm">{m.numero}</span>
                      {m.necessidadeNumero && (
                        <span className="text-xs text-gray-500">SC {m.necessidadeNumero}</span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        {m.matchCount} de {m.totalItens} {m.totalItens === 1 ? "item" : "itens"} em comum
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {m.nome || m.fornecedor.nomeFantasia || m.fornecedor.razaoSocial}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/suprimentos/cotacoes/${m.id}`}
                      target="_blank"
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => goToFormalizacao(m.id)}
                      className="h-7 gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Link2 className="w-3 h-3" /> Ir p/ Formalização
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setAvulsoConfirmed(true)}
                className="text-xs text-amber-700 hover:text-amber-900 underline"
              >
                Não, criar pedido avulso mesmo assim
              </button>
            </div>
          </div>
        )}

        {necessidadeId ? (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            <span>Vinculado à Solicitação de Compras <span className="font-mono font-semibold">{necessidadeNumero}</span>.</span>
            <button
              type="button"
              onClick={() => {
                setNecessidadeId("");
                setNecessidadeNumero("");
                setAvulsoConfirmed(false);
                setChoiceOpen(true);
                setChoiceStep("choose");
              }}
              className="text-blue-500 hover:text-blue-700 underline"
            >
              Revisar
            </button>
          </div>
        ) : (!choiceOpen && !cotacaoMatchLoading && (cotacaoMatches.length === 0 || avulsoConfirmed)) && (
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
            <span>Pedido avulso — sem vínculo com SC.</span>
            <button
              type="button"
              onClick={() => { setChoiceOpen(true); setChoiceStep("choose"); }}
              className="text-blue-600 hover:text-blue-800 underline font-medium"
            >
              Vincular a uma SC/Cotação
            </button>
          </div>
        )}

        {/* ── Seção Fornecedor ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Código fornecedor</Label>
              <Input value={codigoForn || "—"} readOnly className="font-mono bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Loja</Label>
              <Input value="01" readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1 md:col-span-1">
              <Label className="text-xs text-gray-500">Nome Fornecedor</Label>
              <Input value={fornNome || "—"} readOnly className="bg-gray-50" />
            </div>

            {/* Fornecedor selector — spans full row */}
            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-gray-500">Fornecedor <span className="text-red-500">*</span></Label>
              <ComboboxWithCreate
                options={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
                value={fornecedorId}
                onChange={setFornecedorId}
                allowNone={false}
                placeholder="Selecionar fornecedor..."
                createHref="/suprimentos/fornecedores/novo"
                createParam="nome"
                createLabel="fornecedor"
              />
            </div>

            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-gray-500">Descrição <span className="text-red-500">*</span></Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição do pedido (ex.: materiais para manutenção preventiva)"
                className={!descricao.trim() && error ? "border-red-400" : ""}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Contato</Label>
              <Input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome do contato" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fornecedor.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Proposta</Label>
              <Input value="PROPOSTA 01" readOnly className="bg-gray-50 font-mono" />
            </div>
          </div>
        </div>

        {/* ── Seção Financeiro ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total itens</Label>
              <Input
                value={totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total Cotação</Label>
              <Input value={formatBRL(totalCotacao)} readOnly className="bg-gray-50 text-right font-semibold" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">% Desconto</Label>
              <Input
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vr Desconto</Label>
              <Input value={formatBRL(vrDescontoCalc)} readOnly className="bg-gray-50 text-right" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Frete</Label>
              <Input
                inputMode="decimal"
                value={frete} onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Tipo Frete</Label>
              <Select value={tipoFrete || "__none__"} onValueChange={(v) => setTipoFrete(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecionar</SelectItem>
                  {TIPO_FRETE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Condição pagamento</Label>
              <Select
                value={condicoesPagamento || "__none__"}
                onValueChange={(v) => setCondicoesPagamento(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar condição..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {condicoesList.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Despesas</Label>
              <Input
                inputMode="decimal"
                value={despesas} onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Seguro</Label>
              <Input
                inputMode="decimal"
                value={seguro} onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Entrega Prevista</Label>
              <Input type="date" value={dataEntregaPrevista} onChange={(e) => setDataEntregaPrevista(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Itens da cotação ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Itens da cotação</h2>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 min-w-[320px]">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">Total Item</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((row, i) => {
                  const opt = itemOptions.find((o) => o.id === row.itemId);
                  const preco = parseDecimal(row.precoUnitario) || 0;
                  const qtd   = parseDecimal(row.quantidade)   || 0;
                  const total = row.situacao === "CONSIDERA" ? preco * qtd : 0;
                  const isNao = row.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={i} className={cn("hover:bg-gray-50", isNao && "opacity-50")}>
                      <td className="px-4 py-2 min-w-[320px]">
                        <ComboboxWithCreate
                          options={itemOptions.map((o) => ({ value: o.id, label: `[${o.codigo}] ${o.descricao}` }))}
                          value={row.itemId}
                          onChange={(v) => updateRow(i, "itemId", v)}
                          allowNone={false}
                          placeholder="Produto..."
                          createHref="/suprimentos/produtos/novo"
                          createParam="descricao"
                          createLabel="produto"
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{opt?.unidadeMedida ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={row.situacao}
                          onValueChange={(v) => updateRow(i, "situacao", v as ItemRow["situacao"])}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CONSIDERA">Considera</SelectItem>
                            <SelectItem value="NAO_CONSIDERA">Não Considera</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          inputMode="decimal"
                          value={row.quantidade}
                          onChange={(e) => updateRow(i, "quantidade", e.target.value)}
                          className="text-right h-8 w-24 ml-auto"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          inputMode="decimal"
                          disabled={isNao}
                          value={row.precoUnitario}
                          onChange={(e) => updateRow(i, "precoUnitario", e.target.value)}
                          placeholder="0,00"
                          className="text-right h-8"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {isNao ? "—" : formatBRL(total)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {itens.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{formatBRL(totalCotacao)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Situação badge legend */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Considera
          </span>
          <span>— item incluído no total</span>
        </div>
      </div>

      {/* ── Popup: novos vínculos fornecedor × produto ───────────────────────── */}
      {vinculoPopup && (
        <div className="fixed inset-0 z-[9200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setVinculoPopup(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <LinkIcon className="w-5 h-5 text-blue-600" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Novo vínculo fornecedor × produto</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ao criar este pedido, {vinculoPopup.novos.length === 1 ? "o produto abaixo será vinculado" : `os ${vinculoPopup.novos.length} produtos abaixo serão vinculados`} ao fornecedor{" "}
                  <span className="font-medium text-gray-700">{vinculoPopup.fornecedorNome}</span> pela primeira vez.
                </p>
              </div>
            </div>
            {/* Product list */}
            <ul className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
              {vinculoPopup.novos.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                  <span className="font-mono text-[11px] text-gray-400 w-16 shrink-0">{item.codigo}</span>
                  <span className="text-sm text-gray-800">{item.descricao}</span>
                </li>
              ))}
            </ul>
            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={() => setVinculoPopup(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => doSubmit()}
              >
                Confirmar e criar pedido
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Popup de escolha (vincular a uma Cotação ou avulso) ───────────── */}
      {choiceOpen && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {choiceStep === "choose"
                  ? "Como deseja criar este pedido de compra?"
                  : selectedSc
                    ? `Solicitação ${selectedSc.numero}`
                    : "Vincular a uma Solicitação de Compras"}
              </h2>
              {/* Sem escape "silencioso": no passo de escolha o X fecha o diálogo
                  E a página (aba) — ficar no formulário sem optar é o que
                  queremos impedir; no passo de vínculo o X volta à escolha. */}
              {choiceStep === "choose" ? (
                <button
                  type="button"
                  onClick={closeCurrentTab}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Fechar página"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedSc) setSelectedSc(null);
                    else { setChoiceStep("choose"); setScSearch(""); }
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Voltar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {choiceStep === "choose" ? (
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-500">
                  O pedido nasce de uma Solicitação de Compras (SC). Escolha a SC — ela pode já ter uma cotação em andamento ou não.
                </p>

                {/* Vincular a uma SC */}
                <button
                  type="button"
                  onClick={() => setChoiceStep("vincular")}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-left transition-colors"
                >
                  <Link2 className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-blue-800">
                      Vincular a uma Solicitação de Compras (SC)
                    </span>
                    <span className="block text-xs text-blue-700 mt-0.5">
                      Se a SC já tem cotação, você pode formalizá-la; se não, cria o pedido direto na SC ou inicia uma cotação.
                    </span>
                  </span>
                </button>

                {/* Avulso */}
                <button
                  type="button"
                  onClick={closeChoice}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
                >
                  <FileText className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">
                      Pedido avulso
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Pedido sem SC. Você preenche fornecedor e itens manualmente.
                    </span>
                  </span>
                </button>
              </div>
            ) : selectedSc ? (
              /* ── Painel de ações da SC selecionada ───────────────────── */
              (() => {
                const cot = cotacaoEmAndamento(selectedSc);
                const nItens = selectedSc.itens.length;
                const desc = selectedSc.justificativa?.trim();
                return (
                  <div className="p-5 space-y-3">
                    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-sm space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-gray-800">{selectedSc.numero}</span>
                        <span className="text-gray-400">· {nItens} {nItens === 1 ? "item" : "itens"}</span>
                        {cot ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-gray-400">cotação</span>
                            <span className="font-mono text-gray-600">{cot.numero}</span>
                            <StatusBadge status={cot.status} />
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">sem cotação</span>
                        )}
                      </div>
                      {desc && (
                        <p className="text-xs text-gray-600 whitespace-pre-wrap">{desc}</p>
                      )}
                      <ul className="divide-y divide-gray-100 border-t border-gray-100 max-h-40 overflow-y-auto">
                        {selectedSc.itens.map((it, i) => (
                          <li key={it.item?.id ?? i} className="flex items-center gap-2 py-1 text-xs">
                            <span className="font-mono text-gray-400 shrink-0">{it.item?.codigo ?? "—"}</span>
                            <span className="flex-1 min-w-0 truncate text-gray-700">{it.item?.descricao ?? "—"}</span>
                            <span className="shrink-0 text-gray-500">
                              {(Number(it.quantidade) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unidadeItem(it)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {cot && (
                      <button
                        type="button"
                        onClick={() => goToFormalizacao(cot.id)}
                        className="w-full flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-left transition-colors"
                      >
                        <FileSpreadsheet className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-sm font-semibold text-blue-800">Ir para a Formalização da cotação</span>
                          <span className="block text-xs text-blue-700 mt-0.5">
                            Gera o pedido a partir da proposta vencedora e dá baixa na SC.
                          </span>
                        </span>
                      </button>
                    )}

                    {/* Criar direto na SC */}
                    <button
                      type="button"
                      onClick={() => criarDiretoNaSc(selectedSc)}
                      className={cn(
                        "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-colors",
                        cot ? "border-gray-200 bg-white hover:bg-gray-50" : "border-blue-200 bg-blue-50 hover:bg-blue-100"
                      )}
                    >
                      <FileText className={cn("w-5 h-5 mt-0.5 shrink-0", cot ? "text-gray-500" : "text-blue-600")} />
                      <span>
                        <span className={cn("block text-sm font-semibold", cot ? "text-gray-800" : "text-blue-800")}>
                          Criar pedido direto na SC
                        </span>
                        <span className={cn("block text-xs mt-0.5", cot ? "text-gray-500" : "text-blue-700")}>
                          Abre o formulário já vinculado à SC, com os itens pré-preenchidos.
                        </span>
                      </span>
                    </button>

                    {/* Iniciar cotação (só quando não há cotação) */}
                    {!cot && (
                      <button
                        type="button"
                        onClick={() => iniciarCotacao(selectedSc)}
                        className="w-full flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
                      >
                        <FileSpreadsheet className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-sm font-semibold text-gray-800">Iniciar uma cotação</span>
                          <span className="block text-xs text-gray-500 mt-0.5">
                            Cria uma cotação a partir da SC; o pedido nasce ao formalizá-la.
                          </span>
                        </span>
                      </button>
                    )}

                    <div className="pt-1">
                      <button type="button" onClick={() => setSelectedSc(null)} className="text-xs text-gray-500 hover:text-gray-700">
                        ← Escolher outra SC
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div>
                {/* Busca */}
                <div className="p-4 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={scSearch}
                      onChange={(e) => setScSearch(e.target.value)}
                      placeholder="Buscar SC… (número)"
                      className="w-full pl-8 pr-3 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Lista de SCs elegíveis */}
                {scLoading && scOptions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                  </div>
                ) : (() => {
                  const q = scSearch.trim().toLowerCase();
                  const lista = q ? scOptions.filter((sc) => sc.numero.toLowerCase().includes(q)) : scOptions;
                  if (lista.length === 0) {
                    return (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">
                        {q ? "Nenhuma SC encontrada." : "Nenhuma Solicitação de Compras elegível."}
                      </div>
                    );
                  }
                  return (
                    <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                      {lista.map((sc) => {
                        const cot = cotacaoEmAndamento(sc);
                        const desc = sc.justificativa?.trim();
                        return (
                          <li key={sc.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedSc(sc)}
                              className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-blue-50 transition-colors"
                            >
                              <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-semibold text-sm text-gray-800">{sc.numero}</span>
                                  <span className="text-xs text-gray-400">{sc.itens.length} {sc.itens.length === 1 ? "item" : "itens"}</span>
                                  {cot ? (
                                    <span className="inline-flex items-center gap-1 text-xs">
                                      <span className="font-mono text-gray-500">{cot.numero}</span>
                                      <StatusBadge status={cot.status} />
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-300">sem cotação</span>
                                  )}
                                </span>
                                {desc && (
                                  <span className="block text-xs text-gray-500 mt-0.5 truncate">{desc}</span>
                                )}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => { setChoiceStep("choose"); setScSearch(""); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={closeChoice}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    É um pedido avulso
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createdDialog}
    </div>
  );
}
