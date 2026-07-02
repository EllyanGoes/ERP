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
import DatePicker from "@/components/shared/DatePicker";
import StatusBadge from "@/components/shared/StatusBadge";

type Fornecedor = {
  id: string; razaoSocial: string; nomeFantasia: string | null;
  cpfCnpj: string | null; contato: string | null; email: string | null;
};
type ItemUnidadeOpt = { unidadeId: string; fatorConversao: unknown; isPrincipal: boolean; unidade: { sigla: string } };
type ItemOption = {
  id: string; codigo: string; descricao: string; unidadeMedida: string;
  unidade?: { sigla: string } | null;
  itemUnidades?: ItemUnidadeOpt[];
};

type ItemRow = {
  itemId: string;
  quantidade: string;
  precoUnitario: string;
  situacao: "CONSIDERA" | "NAO_CONSIDERA";
  unidadeId?: string;   // unidade de compra ("" = base do item)
  centroCustoId?: string; // herança/orçamento (default p/ entrada e RM); não classifica custo
  tesId?: string;         // TES da operação (preset); herda para a entrada
  compoeCusto?: boolean | null; // preenchido pelo TES (null = herda item)
};

type CentroCustoOpt = { id: string; codigo: string; nome: string };
type CondicaoOpt = { id: string; nome: string; pagamentoAntecipado?: boolean };
type TesOpt = { id: string; codigo: string; nome: string; sentido: string; compoeCusto: boolean; centroCustoSugeridoId: string | null; ativo: boolean };

// Opções de unidade de um item (base + alternativas) com o fator de conversão.
function unidadesDoItem(opt: ItemOption | undefined): { unidadeId: string; sigla: string; fator: number; base: boolean }[] {
  const baseSigla = opt?.unidade?.sigla ?? opt?.unidadeMedida ?? "un";
  const alt = (opt?.itemUnidades ?? [])
    .filter((iu) => !iu.isPrincipal && iu.fatorConversao != null)
    .map((iu) => ({ unidadeId: iu.unidadeId, sigla: iu.unidade.sigla, fator: parseFloat(String(iu.fatorConversao)), base: false }))
    .filter((u) => Number.isFinite(u.fator) && u.fator > 0);
  return [{ unidadeId: "", sigla: baseSigla, fator: 1, base: true }, ...alt];
}

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
  condicaoPagamentoId: string;
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
  const [condicoesList, setCondicoesList] = useState<CondicaoOpt[]>([]);
  const [centrosList, setCentrosList]     = useState<CentroCustoOpt[]>([]);
  const [tesList, setTesList]             = useState<TesOpt[]>([]);

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
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState("");
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
    saveForm({ fornecedorId, descricao, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, condicaoPagamentoId, dataEntregaPrevista, itens });
  }, [fornecedorId, descricao, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, condicaoPagamentoId, dataEntregaPrevista, itens, saveForm]);

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
      if (saved.condicaoPagamentoId !== undefined) setCondicaoPagamentoId(saved.condicaoPagamentoId);
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
    fetch("/api/empresa/centros-custo?ativo=true")
      .then((r) => r.json())
      .then((j) => setCentrosList(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/suprimentos/tipos-operacao")
      .then((r) => r.json())
      .then((j) => setTesList((Array.isArray(j) ? j : (j.data ?? [])).filter((t: TesOpt) => t.ativo !== false && t.sentido !== "SAIDA")))
      .catch(() => {});
  }, []);

  // Escolher o TES preenche as flags da linha (editáveis) e grava o tesId p/ herdar
  // à entrada. NÃO decide destino — só carrega comportamento (centro, compõe custo).
  function applyTesRow(i: number, tesId: string) {
    const tes = tesList.find((t) => t.id === tesId);
    setItens((prev) => prev.map((row, idx) => {
      if (idx !== i) return row;
      const next = { ...row, tesId };
      if (tes) {
        next.compoeCusto = tes.compoeCusto;
        if (tes.centroCustoSugeridoId) next.centroCustoId = tes.centroCustoSugeridoId;
      } else { next.compoeCusto = null; }
      return next;
    }));
  }

  // Condição selecionada é PA? (mostra o aviso de que o título nasce no pedido)
  const condicaoSelecionada = condicoesList.find((c) => c.id === condicaoPagamentoId);
  const condicaoEhPA = condicaoSelecionada?.pagamentoAntecipado === true;

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
    // TES e centro de custo são obrigatórios por item (herdam para a entrada).
    if (validItens.some((r) => !r.tesId)) { setError("Selecione o TES em cada item."); return; }
    if (validItens.some((r) => !r.centroCustoId)) { setError("Informe o centro de custo em cada item."); return; }

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

  async function doSubmit(validItens?: { itemId: string; quantidade: string; precoUnitario: string; situacao: string; unidadeId?: string; centroCustoId?: string; tesId?: string; compoeCusto?: boolean | null }[]) {
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
          condicaoPagamentoId: condicaoPagamentoId || null,
          confirmAvulso:       avulsoConfirmed,
          itens: validItens.map((row) => ({
            itemId:       row.itemId,
            unidadeId:    row.unidadeId || null,
            centroCustoId: row.centroCustoId || null,
            tesId:        row.tesId || null,
            compoeCusto:  row.compoeCusto ?? null,
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
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* ── Anti-duplicidade: Cotações abertas compatíveis ───────────────── */}
        {!avulsoConfirmed && cotacaoMatchLoading && cotacaoMatches.length === 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-border border-t-transparent rounded-full animate-spin" />
            Verificando Cotações compatíveis…
          </div>
        )}

        {!avulsoConfirmed && cotacaoMatches.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm text-warning">
                <p className="font-medium">
                  {cotacaoMatches.length === 1
                    ? "Encontramos 1 Cotação aberta compatível com este pedido."
                    : `Encontramos ${cotacaoMatches.length} Cotações abertas compatíveis com este pedido.`}
                </p>
                <p className="text-xs text-warning mt-0.5">
                  Mesmo fornecedor e itens em comum. Formalize a Cotação para gerar o Pedido a partir dela (com baixa na Solicitação), ou confirme que este é um pedido avulso.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {cotacaoMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 bg-card border border-amber-100 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-foreground text-sm">{m.numero}</span>
                      {m.necessidadeNumero && (
                        <span className="text-xs text-muted-foreground">SC {m.necessidadeNumero}</span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                        {m.matchCount} de {m.totalItens} {m.totalItens === 1 ? "item" : "itens"} em comum
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.nome || m.fornecedor.nomeFantasia || m.fornecedor.razaoSocial}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/suprimentos/cotacoes/${m.id}`}
                      target="_blank"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
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
                className="text-xs text-warning hover:text-amber-900 underline"
              >
                Não, criar pedido avulso mesmo assim
              </button>
            </div>
          </div>
        )}

        {necessidadeId ? (
          <div className="flex items-center justify-between bg-info/10 border border-info/30 rounded-lg px-3 py-2 text-xs text-info">
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
              className="text-blue-500 hover:text-info underline"
            >
              Revisar
            </button>
          </div>
        ) : (!choiceOpen && !cotacaoMatchLoading && (cotacaoMatches.length === 0 || avulsoConfirmed)) && (
          <div className="flex items-center justify-between bg-muted border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
            <span>Pedido avulso — sem vínculo com SC.</span>
            <button
              type="button"
              onClick={() => { setChoiceOpen(true); setChoiceStep("choose"); }}
              className="text-info hover:text-info underline font-medium"
            >
              Vincular a uma SC/Cotação
            </button>
          </div>
        )}

        {/* ── Seção Fornecedor ─────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Código fornecedor</Label>
              <Input value={codigoForn || "—"} readOnly className="font-mono bg-muted" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Loja</Label>
              <Input value="01" readOnly className="bg-muted" />
            </div>
            <div className="space-y-1 md:col-span-1">
              <Label className="text-xs text-muted-foreground">Nome Fornecedor</Label>
              <Input value={fornNome || "—"} readOnly className="bg-muted" />
            </div>

            {/* Fornecedor selector — spans full row */}
            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-muted-foreground">Fornecedor <span className="text-red-500">*</span></Label>
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
              <Label className="text-xs text-muted-foreground">Descrição <span className="text-red-500">*</span></Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição do pedido (ex.: materiais para manutenção preventiva)"
                className={!descricao.trim() && error ? "border-red-400" : ""}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contato</Label>
              <Input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome do contato" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fornecedor.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Proposta</Label>
              <Input value="PROPOSTA 01" readOnly className="bg-muted font-mono" />
            </div>
          </div>
        </div>

        {/* ── Seção Financeiro ─────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total itens</Label>
              <Input
                value={totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly className="bg-muted text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total Cotação</Label>
              <Input value={formatBRL(totalCotacao)} readOnly className="bg-muted text-right font-semibold" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">% Desconto</Label>
              <Input
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vr Desconto</Label>
              <Input value={formatBRL(vrDescontoCalc)} readOnly className="bg-muted text-right" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Frete</Label>
              <Input
                inputMode="decimal"
                value={frete} onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo Frete</Label>
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
              <Label className="text-xs text-muted-foreground">Condição pagamento</Label>
              <Select
                value={condicaoPagamentoId || "__none__"}
                onValueChange={(v) => {
                  const c = condicoesList.find((x) => x.id === v);
                  setCondicaoPagamentoId(v === "__none__" ? "" : v);
                  setCondicoesPagamento(c ? c.nome : "");
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar condição..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {condicoesList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}{c.pagamentoAntecipado ? " · PA" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {condicaoEhPA && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Pagamento antecipado: o título a pagar nasce já com este pedido (adiantamento a fornecedor).
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Despesas</Label>
              <Input
                inputMode="decimal"
                value={despesas} onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Seguro</Label>
              <Input
                inputMode="decimal"
                value={seguro} onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Entrega Prevista</Label>
              <DatePicker value={dataEntregaPrevista} onChange={(v) => setDataEntregaPrevista(v)} />
            </div>
          </div>
        </div>

        {/* ── Itens da cotação ─────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Itens da cotação</h2>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground min-w-[320px]">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground min-w-[160px]" title="TES: preset de comportamento que herda para a entrada. Não decide destino.">TES</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-44" title="Centro de custo herdado pela entrada e pela requisição (default editável). Não classifica destino de custo.">Centro de custo</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Total Item</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((row, i) => {
                  const opt = itemOptions.find((o) => o.id === row.itemId);
                  const preco = parseDecimal(row.precoUnitario) || 0;
                  const qtd   = parseDecimal(row.quantidade)   || 0;
                  const total = row.situacao === "CONSIDERA" ? preco * qtd : 0;
                  const isNao = row.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={i} className={cn("hover:bg-muted", isNao && "opacity-50")}>
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
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {(() => {
                          const uns = unidadesDoItem(opt);
                          if (uns.length <= 1) return <span>{opt?.unidade?.sigla ?? opt?.unidadeMedida ?? "—"}</span>;
                          const sel = uns.find((u) => u.unidadeId === (row.unidadeId ?? "")) ?? uns[0];
                          const qtdBase = (parseDecimal(row.quantidade) || 0) * sel.fator;
                          return (
                            <div className="flex flex-col gap-0.5">
                              <select
                                value={row.unidadeId ?? ""}
                                onChange={(e) => updateRow(i, "unidadeId", e.target.value)}
                                className="h-8 rounded border border-border bg-card px-1 text-xs"
                                title="Unidade da compra"
                              >
                                {uns.map((u) => (
                                  <option key={u.unidadeId || "base"} value={u.unidadeId}>{u.sigla}{u.base ? "" : ` (×${u.fator})`}</option>
                                ))}
                              </select>
                              {!sel.base && (
                                <span className="text-[10px] text-muted-foreground">= {qtdBase.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {uns[0].sigla}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <select value={row.tesId ?? ""} onChange={(e) => applyTesRow(i, e.target.value)}
                          className={cn("h-8 text-xs w-full min-w-[150px] rounded-md border bg-card px-1", error && !row.tesId ? "border-red-400 bg-danger/10" : "border-border")} title="Tipo de operação (preset)">
                          <option value="">— TES —</option>
                          {tesList.map((t) => <option key={t.id} value={t.id}>{t.codigo} {t.nome}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <ComboboxWithCreate
                          options={centrosList.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))}
                          value={row.centroCustoId ?? ""}
                          onChange={(v) => updateRow(i, "centroCustoId", v)}
                          placeholder="— Centro —"
                          triggerClassName={cn("h-8 text-xs", error && !row.centroCustoId && "border-red-400 bg-danger/10")}
                        />
                      </td>
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
                      <td className="px-4 py-2 text-right font-medium text-foreground">
                        {isNao ? "—" : formatBRL(total)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {itens.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted">
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-right font-semibold text-foreground text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-foreground">{formatBRL(totalCotacao)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Situação badge legend */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 text-success bg-success/10 border border-success/30 rounded px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Considera
          </span>
          <span>— item incluído no total</span>
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
                  Ao criar este pedido, {vinculoPopup.novos.length === 1 ? "o produto abaixo será vinculado" : `os ${vinculoPopup.novos.length} produtos abaixo serão vinculados`} ao fornecedor{" "}
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
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">
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
                  className="text-muted-foreground hover:text-muted-foreground"
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
                  className="text-muted-foreground hover:text-muted-foreground"
                  aria-label="Voltar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {choiceStep === "choose" ? (
              <div className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  O pedido nasce de uma Solicitação de Compras (SC). Escolha a SC — ela pode já ter uma cotação em andamento ou não.
                </p>

                {/* Vincular a uma SC */}
                <button
                  type="button"
                  onClick={() => setChoiceStep("vincular")}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-info/30 bg-info/10 hover:bg-info/15 text-left transition-colors"
                >
                  <Link2 className="w-5 h-5 text-info mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-info">
                      Vincular a uma Solicitação de Compras (SC)
                    </span>
                    <span className="block text-xs text-info mt-0.5">
                      Se a SC já tem cotação, você pode formalizá-la; se não, cria o pedido direto na SC ou inicia uma cotação.
                    </span>
                  </span>
                </button>

                {/* Avulso */}
                <button
                  type="button"
                  onClick={closeChoice}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted text-left transition-colors"
                >
                  <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      Pedido avulso
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
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
                    <div className="rounded-lg bg-muted border border-border px-3 py-2.5 text-sm space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-foreground">{selectedSc.numero}</span>
                        <span className="text-muted-foreground">· {nItens} {nItens === 1 ? "item" : "itens"}</span>
                        {cot ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">cotação</span>
                            <span className="font-mono text-muted-foreground">{cot.numero}</span>
                            <StatusBadge status={cot.status} />
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">sem cotação</span>
                        )}
                      </div>
                      {desc && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{desc}</p>
                      )}
                      <ul className="divide-y divide-border border-t border-border max-h-40 overflow-y-auto">
                        {selectedSc.itens.map((it, i) => (
                          <li key={it.item?.id ?? i} className="flex items-center gap-2 py-1 text-xs">
                            <span className="font-mono text-muted-foreground shrink-0">{it.item?.codigo ?? "—"}</span>
                            <span className="flex-1 min-w-0 truncate text-foreground">{it.item?.descricao ?? "—"}</span>
                            <span className="shrink-0 text-muted-foreground">
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
                        className="w-full flex items-start gap-3 p-4 rounded-xl border border-info/30 bg-info/10 hover:bg-info/15 text-left transition-colors"
                      >
                        <FileSpreadsheet className="w-5 h-5 text-info mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-sm font-semibold text-info">Ir para a Formalização da cotação</span>
                          <span className="block text-xs text-info mt-0.5">
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
                        cot ? "border-border bg-card hover:bg-muted" : "border-info/30 bg-info/10 hover:bg-info/15"
                      )}
                    >
                      <FileText className={cn("w-5 h-5 mt-0.5 shrink-0", cot ? "text-muted-foreground" : "text-info")} />
                      <span>
                        <span className={cn("block text-sm font-semibold", cot ? "text-foreground" : "text-info")}>
                          Criar pedido direto na SC
                        </span>
                        <span className={cn("block text-xs mt-0.5", cot ? "text-muted-foreground" : "text-info")}>
                          Abre o formulário já vinculado à SC, com os itens pré-preenchidos.
                        </span>
                      </span>
                    </button>

                    {/* Iniciar cotação (só quando não há cotação) */}
                    {!cot && (
                      <button
                        type="button"
                        onClick={() => iniciarCotacao(selectedSc)}
                        className="w-full flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted text-left transition-colors"
                      >
                        <FileSpreadsheet className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-sm font-semibold text-foreground">Iniciar uma cotação</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            Cria uma cotação a partir da SC; o pedido nasce ao formalizá-la.
                          </span>
                        </span>
                      </button>
                    )}

                    <div className="pt-1">
                      <button type="button" onClick={() => setSelectedSc(null)} className="text-xs text-muted-foreground hover:text-foreground">
                        ← Escolher outra SC
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div>
                {/* Busca */}
                <div className="p-4 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={scSearch}
                      onChange={(e) => setScSearch(e.target.value)}
                      placeholder="Buscar SC… (número)"
                      className="w-full pl-8 pr-3 h-9 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Lista de SCs elegíveis */}
                {scLoading && scOptions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                  </div>
                ) : (() => {
                  const q = scSearch.trim().toLowerCase();
                  const lista = q ? scOptions.filter((sc) => sc.numero.toLowerCase().includes(q)) : scOptions;
                  if (lista.length === 0) {
                    return (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                              className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-info/10 transition-colors"
                            >
                              <FileText className="w-4 h-4 text-info shrink-0 mt-0.5" />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-semibold text-sm text-foreground">{sc.numero}</span>
                                  <span className="text-xs text-muted-foreground">{sc.itens.length} {sc.itens.length === 1 ? "item" : "itens"}</span>
                                  {cot ? (
                                    <span className="inline-flex items-center gap-1 text-xs">
                                      <span className="font-mono text-muted-foreground">{cot.numero}</span>
                                      <StatusBadge status={cot.status} />
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/60">sem cotação</span>
                                  )}
                                </span>
                                {desc && (
                                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">{desc}</span>
                                )}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
                  <button
                    type="button"
                    onClick={() => { setChoiceStep("choose"); setScSearch(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={closeChoice}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
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
