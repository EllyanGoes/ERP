"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useCreateDrawer, useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import DatePicker from "@/components/shared/DatePicker";
import EscClose from "@/components/shared/EscClose";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import {
  EtapaLayout, EtapaSecao, EtapaCampos, EtapaCampoForm, EtapaResumo, EtapaRodapeAcoes, tabela,
} from "@/components/compras/etapa/EtapaUI";
import {
  CheckSquare, Square, ChevronRight, Loader2, Search,
  X, Building2, AlertTriangle, EyeOff,
  Plus, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SCItem = {
  id: string;
  scId: string;
  scNumero: string;
  ordem: number;
  itemId: string;
  codigo: string;
  descricao: string;
  categoria: string | null;
  quantidade: number;
  unidade: string;
  dataNecessidade: string | null;
};

type Fornecedor = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
};

type Empresa = {
  razaoSocial: string;
  cnpj: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
};

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Necessidade de Compra" },
  { n: 2, label: "Dados da Cotação" },
  { n: 3, label: "Seleção de Fornecedores" },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              current === s.n ? "bg-blue-600 text-white" :
              current > s.n  ? "bg-green-500 text-white" :
                               "bg-muted text-muted-foreground"
            )}>
              {current > s.n ? "✓" : s.n}
            </div>
            <span className={cn(
              "text-sm font-medium whitespace-nowrap",
              current === s.n ? "text-info" :
              current > s.n  ? "text-success" :
                               "text-muted-foreground"
            )}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("w-12 h-px mx-2", current > s.n ? "bg-green-400" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CotacaoCreateForm() {
  const drawer = useCreateDrawer();
  const voltar = useVoltarCriacao("/suprimentos/cotacoes");
  const searchParams = useSearchParams();
  const necessidadeIdParam = searchParams.get("necessidadeId");

  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "cotação",
    gender: "f",
    onNew: () => { window.location.href = "/suprimentos/cotacoes/nova"; },
    viewHref: (id) => `/suprimentos/cotacoes/${id}`,
  });

  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<{
    step: number;
    selectedItemIds: string[];
    nome: string;
    dataLimite: string;
    infoEntrega: string;
    selectedFornIds: string[];
  }>("cotacao:nova");

  const [step, setStep] = useState<number>(1);

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [scItems, setScItems]           = useState<SCItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch]     = useState("");
  // scId → progress tag label+color
  const [scTagMap, setScTagMap]         = useState<Map<string, { label: string; color: string }>>(new Map());
  // Step 1 filters
  const [filterScIds,    setFilterScIds]    = useState<string[]>([]);
  const [filterCats,     setFilterCats]     = useState<string[]>([]);
  const [hideEmCotacao,  setHideEmCotacao]  = useState(false);

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [nome, setNome]                 = useState<string>("");
  const [dataLimite, setDataLimite]     = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [infoEntrega, setInfoEntrega]   = useState<string>("");
  const [step2Error, setStep2Error]     = useState("");

  // ── Step 3 state ──────────────────────────────────────────────────────────
  const [tab, setTab]                         = useState<"ultimos" | "todos">("ultimos");
  const [fornSearch, setFornSearch]           = useState("");
  const [allFornecedores, setAllFornecedores] = useState<Fornecedor[]>([]);
  const [ultFornecedores, setUltFornecedores] = useState<Fornecedor[]>([]);
  const [loadingForn, setLoadingForn]         = useState(false);
  const [selectedFornIds, setSelectedFornIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm]         = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState("");

  const isDirty = !!(selectedItemIds.size > 0 || nome || selectedFornIds.size > 0);
  useDirtyForm(isDirty);

  // ── Item-in-cotação warnings ──────────────────────────────────────────────
  type ItemWarning = { itemId: string; codigo: string; descricao: string; cotacoes: string[] };
  const [itemWarnings, setItemWarnings]       = useState<ItemWarning[]>([]);
  const [showItemWarning, setShowItemWarning] = useState(false);
  const [checkingItems, setCheckingItems]     = useState(false);

  // ── Restore wizard state on mount ────────────────────────────────────────
  const formRestoredRef = useRef(false);
  useEffect(() => {
    if (formRestoredRef.current) return;
    formRestoredRef.current = true;
    const saved = loadForm();
    if (saved) {
      setStep(saved.step ?? 1);
      setSelectedItemIds(new Set(saved.selectedItemIds ?? []));
      setNome(saved.nome ?? "");
      setDataLimite(saved.dataLimite ?? (() => {
        const d = new Date(); d.setDate(d.getDate() + 7);
        return d.toISOString().split("T")[0];
      })());
      setInfoEntrega(saved.infoEntrega ?? "");
      setSelectedFornIds(new Set(saved.selectedFornIds ?? []));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist wizard state on every change ─────────────────────────────────
  useEffect(() => {
    saveForm({
      step,
      selectedItemIds: Array.from(selectedItemIds),
      nome,
      dataLimite,
      infoEntrega,
      selectedFornIds: Array.from(selectedFornIds),
    });
  }, [step, selectedItemIds, nome, dataLimite, infoEntrega, selectedFornIds, saveForm]);

  // ── Load SC items ─────────────────────────────────────────────────────────
  const COTACAO_ACTIVE_SET = new Set(["PENDENTE", "EM_ANALISE"]);
  const PC_ACTIVE_SET      = new Set(["RASCUNHO", "ENVIADO", "CONFIRMADO", "EM_TRANSITO"]);

  useEffect(() => {
    setLoadingItems(true);
    fetch("/api/suprimentos/necessidades?status=APROVADA")
      .then((r) => r.json())
      .then((json) => {
        const scs = Array.isArray(json) ? json : (json.data ?? []);
        const flat: SCItem[] = [];
        const tagMap = new Map<string, { label: string; color: string }>();

        scs.forEach((sc: {
          id: string; numero: string; categoria: string | null;
          dataNecessidade: string | null;
          cotacoes?: Array<{ id: string; status: string; pedidos: Array<{ id: string; status: string }> }>;
          itens: Array<{
            id: string; quantidade: unknown; unidade: string | null;
            item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade?: { sigla: string } | null };
          }>;
        }) => {
          sc.itens.forEach((it, idx) => {
            flat.push({
              id:   it.id,
              scId: sc.id,
              scNumero: sc.numero,
              ordem: idx + 1,
              itemId: it.item.id,
              codigo: it.item.codigo,
              descricao: it.item.descricao,
              categoria: sc.categoria ?? null,
              quantidade: parseFloat(String(it.quantidade ?? 0)),
              unidade: it.unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un",
              dataNecessidade: sc.dataNecessidade ?? null,
            });
          });

          // Compute progress tag for this SC
          if (sc.cotacoes?.length) {
            const hasActivePC  = sc.cotacoes.some((c) => c.pedidos?.some((p) => PC_ACTIVE_SET.has(p.status)));
            const hasActiveCot = sc.cotacoes.some((c) => COTACAO_ACTIVE_SET.has(c.status));
            if (hasActivePC)       tagMap.set(sc.id, { label: "Com PC",      color: "bg-info/15 text-info border-info/30" });
            else if (hasActiveCot) tagMap.set(sc.id, { label: "Em Cotação",  color: "bg-warning/15 text-warning border-warning/30" });
          }
        });

        setScItems(flat);
        setScTagMap(tagMap);

        // Se veio via ?necessidadeId=, pré-selecionar todos os itens dessa SC
        if (necessidadeIdParam) {
          const ids = new Set(flat.filter((i) => i.scId === necessidadeIdParam).map((i) => i.id));
          setSelectedItemIds(ids);
        }
      })
      .finally(() => setLoadingItems(false));
  }, [necessidadeIdParam]);

  // ── Load empresa for info entrega ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/empresa")
      .then((r) => r.json())
      .then((json) => {
        const e: Empresa = json.data;
        if (!e) return;
        const parts = [
          e.razaoSocial && `RAZÃO SOCIAL: ${e.razaoSocial}`,
          e.cnpj        && `CNPJ: ${e.cnpj}`,
          (e.logradouro || e.numero || e.bairro || e.cidade) && [
            "Endereço de entrega:",
            [e.logradouro, e.numero].filter(Boolean).join(", "),
            e.complemento,
            e.bairro,
            e.cidade && e.estado ? `${e.cidade}/${e.estado}` : (e.cidade ?? e.estado),
            e.cep && `CEP: ${e.cep}`,
          ].filter(Boolean).join(" - "),
        ].filter(Boolean).join(" - ");
        setInfoEntrega(parts);
      })
      .catch(() => {});
  }, []);

  // ── Load fornecedores when entering step 3 ────────────────────────────────
  const [refreshingForn, setRefreshingForn] = useState(false);

  function loadFornecedores(isRefresh = false) {
    if (isRefresh) setRefreshingForn(true);
    else setLoadingForn(true);
    const selectedItems = scItems.filter((i) => selectedItemIds.has(i.id));
    const itemIds = Array.from(new Set(selectedItems.map((i) => i.itemId))).join(",");
    Promise.all([
      fetch(`/api/suprimentos/fornecedores/ultimos?itemIds=${itemIds}`).then((r) => r.json()),
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
    ]).then(([ult, all]) => {
      setUltFornecedores(Array.isArray(ult.data) ? ult.data : []);
      const allList = Array.isArray(all) ? all : (all.data ?? []);
      setAllFornecedores(allList.filter((f: Fornecedor & { ativo?: boolean }) => f.ativo !== false));
    }).finally(() => { setLoadingForn(false); setRefreshingForn(false); });
  }

  useEffect(() => {
    if (step !== 3) return;
    loadFornecedores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scItems, selectedItemIds]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // Unique SC options for filter dropdown
  const scOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of scItems) if (!seen.has(i.scId)) seen.set(i.scId, i.scNumero);
    return Array.from(seen.entries()).map(([id, numero]) => ({ id, numero }));
  }, [scItems]);

  // Unique category options
  const catOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const i of scItems) if (i.categoria) seen.add(i.categoria);
    return Array.from(seen).sort();
  }, [scItems]);

  const filteredItems = useMemo(() => {
    let list = scItems;
    const q = itemSearch.toLowerCase().trim();
    if (q) list = list.filter((i) =>
      i.descricao.toLowerCase().includes(q) ||
      i.codigo.toLowerCase().includes(q) ||
      i.scNumero.toLowerCase().includes(q)
    );
    if (filterScIds.length > 0) list = list.filter((i) => filterScIds.includes(i.scId));
    if (filterCats.length > 0)  list = list.filter((i) => i.categoria && filterCats.includes(i.categoria));
    if (hideEmCotacao)           list = list.filter((i) => !scTagMap.has(i.scId));
    return list;
  }, [scItems, itemSearch, filterScIds, filterCats, hideEmCotacao, scTagMap]);

  const hasFilters = itemSearch || filterScIds.length > 0 || filterCats.length > 0 || hideEmCotacao;

  function clearFilters() {
    setItemSearch(""); setFilterScIds([]); setFilterCats([]); setHideEmCotacao(false);
  }

  // Helper: select/deselect all items of a given SC
  function toggleSC(scId: string) {
    const ids = scItems.filter((i) => i.scId === scId).map((i) => i.id);
    const allSelected = ids.every((id) => selectedItemIds.has(id));
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedItemIds.has(i.id));

  function toggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredItems.forEach((i) => next.delete(i.id));
      } else {
        filteredItems.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }

  function toggleForn(id: string) {
    setSelectedFornIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function fornListForTab() {
    const list = tab === "ultimos" ? ultFornecedores : allFornecedores;
    const q = fornSearch.toLowerCase();
    return !q ? list : list.filter((f) =>
      (f.nomeFantasia || f.razaoSocial).toLowerCase().includes(q) ||
      (f.cpfCnpj ?? "").toLowerCase().includes(q)
    );
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async function goStep2() {
    if (selectedItemIds.size === 0) return;
    setCheckingItems(true);
    try {
      const selectedItems = scItems.filter((i) => selectedItemIds.has(i.id));
      const itemIds = Array.from(new Set(selectedItems.map((i) => i.itemId))).join(",");
      const res = await fetch(`/api/suprimentos/cotacoes/verificar-itens?itemIds=${itemIds}`);
      const json = await res.json();
      const warnings: ItemWarning[] = json.data ?? [];
      if (warnings.length > 0) {
        setItemWarnings(warnings);
        setShowItemWarning(true);
      } else {
        setStep(2);
      }
    } catch {
      // If check fails, proceed anyway
      setStep(2);
    } finally {
      setCheckingItems(false);
    }
  }

  function goStep3() {
    if (!nome.trim()) { setStep2Error("Informe o apelido da cotação."); return; }
    if (!dataLimite)  { setStep2Error("Informe o prazo de recebimento."); return; }
    setStep2Error("");
    setStep(3);
  }

  // ── Final submit ──────────────────────────────────────────────────────────
  async function handleCreate() {
    setSaving(true);
    setSaveError("");
    try {
      const selectedItems = scItems.filter((i) => selectedItemIds.has(i.id));
      // Group by scId → use first scId as necessidadeId if single SC
      const scIds = Array.from(new Set(selectedItems.map((i) => i.scId)));
      const necessidadeId = scIds.length === 1 ? scIds[0] : null;

      // Build qty map: itemId → qty
      const qtdMap: Record<string, number> = {};
      selectedItems.forEach((i) => { qtdMap[i.itemId] = i.quantidade; });

      const res = await fetch("/api/suprimentos/cotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          necessidadeId,
          dataLimiteResposta: dataLimite || null,
          infoEntrega: infoEntrega.trim() || null,
          fornecedorIds: Array.from(selectedFornIds),
          itens: Object.entries(qtdMap).map(([itemId, quantidade]) => ({ itemId, quantidade })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error || "Erro ao criar cotação"); setSaving(false); return; }
      clearForm();
      setShowConfirm(false);
      confirmCreated(json.data.id);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erro de conexão. Tente novamente.");
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const itensSelecionados = scItems.filter((i) => selectedItemIds.has(i.id));
  const selectedScNumeros = Array.from(new Set(itensSelecionados.map((i) => i.scNumero)));
  const selectedFornNomes = Array.from(selectedFornIds).map((fid) => {
    const f = allFornecedores.find((x) => x.id === fid) ?? ultFornecedores.find((x) => x.id === fid);
    return { id: fid, nome: f?.nomeFantasia ?? f?.razaoSocial ?? fid };
  });

  const contagemItens = selectedItemIds.size > 0 && (
    <span className="inline-flex items-center gap-1.5 text-info">
      <CheckSquare className="w-3.5 h-3.5" />
      {selectedItemIds.size} {selectedItemIds.size === 1 ? "registro selecionado" : "registros selecionados"}
    </span>
  );

  const resumo = (
    <EtapaSecao titulo="Resumo">
      <EtapaResumo
        linhas={[
          { rotulo: "Itens", valor: `${selectedItemIds.size} item(s)` },
          { rotulo: "Solicitações", valor: selectedScNumeros.length > 0 ? selectedScNumeros.join(", ") : "—" },
          ...(step >= 2 && nome ? [{ rotulo: "Apelido", valor: nome }] : []),
          ...(step >= 2 ? [{ rotulo: "Prazo", valor: dataLimite ? new Date(dataLimite + "T12:00:00").toLocaleDateString("pt-BR") : "—" }] : []),
          ...(step === 3 ? [{ rotulo: "Fornecedores", valor: `${selectedFornIds.size} fornecedor(es)`, destaque: true }] : []),
        ]}
      />
    </EtapaSecao>
  );

  return (
    <div>
      {!drawer && (
        <PageHeader
          title="Nova Cotação de Compra"
          breadcrumbs={[
            { label: "Suprimentos" },
            { label: "Cotações de Compra", href: "/suprimentos/cotacoes" },
            { label: "Nova Cotação" },
          ]}
        />
      )}

      <EtapaLayout
        className={drawer ? "px-2 pb-0" : "max-w-7xl"}
        lateral={step === 1 ? undefined : (
          <>
            {resumo}
            {/* Selected summary */}
            {step === 3 && selectedFornIds.size > 0 && (
              <EtapaSecao titulo="Fornecedores / Participantes selecionados">
                <div className="flex flex-wrap gap-2">
                  {selectedFornNomes.map((f) => (
                    <span key={f.id}
                      className="inline-flex items-center gap-1 bg-info/10 border border-info/30 text-info text-xs px-2.5 py-1 rounded-full">
                      <Building2 className="w-3 h-3" />
                      {f.nome}
                      <button type="button" onClick={() => toggleForn(f.id)} className="ml-1 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </EtapaSecao>
            )}
          </>
        )}
      >
        <StepBar current={step} />

        {/* ── STEP 1 — Necessidades ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <EtapaSecao
              titulo="Itens"
              semPadding
              acoes={hasFilters ? (
                <button onClick={clearFilters}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-info bg-info/10 border border-info/30 rounded-full hover:bg-info/15 transition-colors">
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              ) : undefined}
            >
              <div className="px-5 py-3 border-b border-border space-y-3">
                <p className="text-xs text-muted-foreground">Selecione os itens da necessidade de compra que deseja incluir nesta cotação.</p>

                {/* Filter bar */}
                <div className="flex flex-wrap gap-2 items-center">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input type="text" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Buscar por item, código ou SC..."
                      className="h-8 pl-8 pr-8" />
                    {itemSearch && (
                      <button onClick={() => setItemSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Solicitação filter */}
                  {scOptions.length > 1 && (
                    <SelectMenu
                      value={filterScIds.length === 1 ? filterScIds[0] : ""}
                      onChange={(v) => setFilterScIds(v ? [v] : [])}
                      options={[
                        { value: "", label: "Todas as SCs" },
                        ...scOptions.map((sc) => ({ value: sc.id, label: sc.numero })),
                      ]}
                      className="w-44"
                      triggerClassName={cn("h-8", filterScIds.length > 0 && "border-blue-400 text-info bg-info/10")}
                    />
                  )}

                  {/* Categoria filter */}
                  {catOptions.length > 0 && (
                    <SelectMenu
                      value={filterCats.length === 1 ? filterCats[0] : ""}
                      onChange={(v) => setFilterCats(v ? [v] : [])}
                      options={[
                        { value: "", label: "Todas as categorias" },
                        ...catOptions.map((c) => ({ value: c, label: c })),
                      ]}
                      className="w-52"
                      triggerClassName={cn("h-8", filterCats.length > 0 && "border-blue-400 text-info bg-info/10")}
                    />
                  )}

                  {/* Hide Em Cotação toggle */}
                  <button
                    type="button"
                    onClick={() => setHideEmCotacao((p) => !p)}
                    className={cn(
                      "flex items-center gap-1.5 h-8 px-3 text-sm border rounded-lg transition-colors cursor-pointer select-none",
                      hideEmCotacao
                        ? "border-amber-400 bg-warning/10 text-warning"
                        : "border-border bg-card text-muted-foreground hover:border-border"
                    )}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Ocultar Em Cotação
                  </button>

                  {/* Result count */}
                  {hasFilters && !loadingItems && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {loadingItems ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={tabela.table}>
                    <thead className={tabela.thead}>
                      <tr>
                        <th className={cn(tabela.th, "w-10")}>
                          <button type="button" onClick={toggleAllVisible} className="text-muted-foreground hover:text-blue-500">
                            {allVisibleSelected
                              ? <CheckSquare className="w-4 h-4 text-blue-500" />
                              : <Square className="w-4 h-4" />}
                          </button>
                        </th>
                        <th className={cn(tabela.th, "w-28")}>Solicitação</th>
                        <th className={cn(tabela.th, "w-16")}>Item</th>
                        <th className={cn(tabela.th, "w-36")}>Código</th>
                        <th className={tabela.th}>Descrição do produto</th>
                        <th className={cn(tabela.th, "w-40")}>Grupo / Categoria</th>
                        <th className={cn(tabela.thNum, "w-28")}>Qtd</th>
                        <th className={cn(tabela.th, "w-32")}>Data necessidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-muted-foreground italic">
                            {scItems.length === 0
                              ? "Nenhuma solicitação aprovada encontrada."
                              : "Nenhum resultado para a busca."}
                          </td>
                        </tr>
                      ) : filteredItems.map((item) => {
                        const checked = selectedItemIds.has(item.id);
                        return (
                          <tr key={item.id}
                            onClick={() => toggleItem(item.id)}
                            className={cn(
                              tabela.tr,
                              "cursor-pointer transition-colors",
                              checked ? "bg-info/10 hover:bg-info/15" : "hover:bg-muted"
                            )}>
                            <td className={tabela.td}>
                              {checked
                                ? <CheckSquare className="w-4 h-4 text-blue-500" />
                                : <Square className="w-4 h-4 text-muted-foreground/60" />}
                            </td>
                            <td className={tabela.td}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleSC(item.scId); }}
                                  title="Selecionar/deselecionar todos itens desta SC"
                                  className="font-mono text-xs text-foreground hover:text-info hover:underline cursor-pointer"
                                >
                                  {item.scNumero}
                                </button>
                                {scTagMap.get(item.scId) && (
                                  <span className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border shrink-0",
                                    scTagMap.get(item.scId)!.color
                                  )}>
                                    {scTagMap.get(item.scId)!.label}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={cn(tabela.td, "text-muted-foreground tabular-nums")}>{String(item.ordem).padStart(4, "0")}</td>
                            <td className={tabela.tdCodigo}>{item.codigo}</td>
                            <td className={cn(tabela.td, "font-medium")}>{item.descricao}</td>
                            <td className={cn(tabela.td, "text-muted-foreground text-xs")}>{item.categoria ?? <span className="text-muted-foreground/60">—</span>}</td>
                            <td className={tabela.tdNum}>
                              {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade}
                            </td>
                            <td className={cn(tabela.td, "text-xs text-muted-foreground whitespace-nowrap")}>
                              {item.dataNecessidade
                                ? new Date(item.dataNecessidade).toLocaleDateString("pt-BR")
                                : <span className="text-muted-foreground/60">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </EtapaSecao>

            <EtapaRodapeAcoes info={contagemItens}>
              <Button type="button" variant="outline" onClick={() => { clearForm(); voltar(); }}>Cancelar</Button>
              <Button onClick={goStep2} disabled={selectedItemIds.size === 0 || checkingItems}
                className="gap-1.5">
                {checkingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Iniciar cotação <ChevronRight className="w-4 h-4" />
              </Button>
            </EtapaRodapeAcoes>
          </>
        )}

        {/* ── STEP 2 — Dados da cotação ──────────────────────────────────────── */}
        {step === 2 && (
          <>
            <EtapaSecao titulo="Dados da cotação">
              <div className="space-y-5">
                <EtapaCampos colunas={2}>
                  <EtapaCampoForm rotulo="Apelido do grupo de cotações" obrigatorio span={2}>
                    <Input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex.: Compras materiais elétricos Abril/2026"
                      className={cn("focus-visible:ring-blue-400", !nome && step2Error && "border-red-400")}
                    />
                  </EtapaCampoForm>

                  <EtapaCampoForm
                    rotulo="Recebimento cotação"
                    obrigatorio
                    ajuda="Prazo limite para os fornecedores enviarem suas propostas."
                  >
                    <DatePicker
                      value={dataLimite}
                      onChange={(v) => setDataLimite(v)}
                      invalid={!dataLimite && !!step2Error}
                    />
                  </EtapaCampoForm>

                  <EtapaCampoForm
                    rotulo="Informações de entrega"
                    span={2}
                    ajuda="Preenchido automaticamente com os dados da empresa. Você pode editar."
                  >
                    <Textarea
                      value={infoEntrega}
                      onChange={(e) => setInfoEntrega(e.target.value)}
                      rows={4}
                      className="font-mono text-sm focus-visible:ring-blue-400"
                      placeholder="Endereço de entrega, instruções especiais..."
                    />
                  </EtapaCampoForm>
                </EtapaCampos>

                {step2Error && (
                  <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {step2Error}
                  </div>
                )}
              </div>
            </EtapaSecao>

            <EtapaRodapeAcoes info={<>Campos com <span className="text-danger">*</span> são obrigatórios.</>}>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>← Voltar</Button>
              <Button onClick={goStep3} className="gap-1.5">
                Próximo passo <ChevronRight className="w-4 h-4" />
              </Button>
            </EtapaRodapeAcoes>
          </>
        )}

        {/* ── STEP 3 — Seleção de Fornecedores ─────────────────────────────── */}
        {step === 3 && (
          <>
            <EtapaSecao
              titulo="Fornecedores convidados"
              semPadding
              acoes={
                <>
                  {/* Novo Fornecedor — opens in new tab so the user keeps their progress */}
                  <a
                    href="/suprimentos/fornecedores/novo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-info border border-info/30 bg-info/10 hover:bg-info/15 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Fornecedor
                  </a>
                  {/* Refresh list */}
                  <button
                    type="button"
                    onClick={() => loadFornecedores(true)}
                    disabled={refreshingForn}
                    title="Atualizar lista"
                    className="flex items-center justify-center w-8 h-8 border border-border rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", refreshingForn && "animate-spin")} />
                  </button>
                </>
              }
            >
              {/* Tabs + Search */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5">
                <div className="flex gap-0">
                  {(["ultimos", "todos"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => { setTab(t); setFornSearch(""); }}
                      className={cn(
                        "px-4 py-3.5 text-sm font-medium border-b-2 transition-colors",
                        tab === t ? "border-blue-500 text-info" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}>
                      {t === "ultimos" ? "Últimos fornecedores" : "Todos os fornecedores"}
                    </button>
                  ))}
                </div>
                <div className="relative w-64 py-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input type="text" value={fornSearch} onChange={(e) => setFornSearch(e.target.value)}
                    placeholder="Busque por CNPJ, nome fantasia, razão social..."
                    className="h-8 pl-8 pr-3" />
                </div>
              </div>

              <p className="px-5 py-2 text-xs text-muted-foreground bg-muted border-b border-border">
                Selecione os fornecedores que receberão a solicitação de cotação.
                {tab === "ultimos" && " Os últimos fornecedores são listados conforme cotações anteriores para os produtos selecionados."}
              </p>

              <div className="divide-y divide-border">
                {loadingForn ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : fornListForTab().length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground italic">
                    {tab === "ultimos"
                      ? "Nenhum fornecedor encontrado para os itens selecionados."
                      : "Nenhum fornecedor cadastrado."}
                  </div>
                ) : fornListForTab().map((f) => {
                  const checked = selectedFornIds.has(f.id);
                  return (
                    <div key={f.id}
                      onClick={() => toggleForn(f.id)}
                      className={cn(
                        "flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors",
                        checked ? "bg-info/10" : "hover:bg-muted"
                      )}>
                      <div className={cn(
                        "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        checked ? "bg-blue-500 border-blue-500" : "border-border"
                      )}>
                        {checked && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium text-sm", checked ? "text-info" : "text-foreground")}>
                          {f.nomeFantasia || f.razaoSocial}
                        </p>
                        <div className="flex flex-wrap gap-x-6 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {f.cpfCnpj && (
                            <span>{f.cpfCnpj.length === 14 ? "CNPJ" : "CPF"}: {f.cpfCnpj}</span>
                          )}
                          {f.email   && <span>E-mail: {f.email}</span>}
                          {f.telefone && <span>Tel: {f.telefone}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </EtapaSecao>

            <EtapaRodapeAcoes info={selectedFornIds.size > 0 ? `${selectedFornIds.size} fornecedor(es) selecionado(s)` : "Selecione ao menos um fornecedor."}>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>← Voltar</Button>
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={selectedFornIds.size === 0}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                Gerar cotação
              </Button>
            </EtapaRodapeAcoes>
          </>
        )}
      </EtapaLayout>

      {/* ── Item-in-cotação warning modal ─────────────────────────────────── */}
      {showItemWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <EscClose onClose={() => setShowItemWarning(false)} />
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Itens em cotação aberta</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Os itens abaixo já estão em cotações em andamento. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div className="border rounded-lg divide-y max-h-56 overflow-y-auto mb-5">
              {itemWarnings.map((w) => (
                <div key={w.itemId} className="px-4 py-2.5">
                  <p className="text-sm font-medium text-foreground">{w.codigo} — {w.descricao}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Em cotação: <span className="text-warning font-medium">{w.cotacoes.join(", ")}</span>
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowItemWarning(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => { setShowItemWarning(false); setStep(2); }}
              >
                Continuar mesmo assim
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modal ────────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <EscClose onClose={() => { if (!saving) setShowConfirm(false); }} />
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Solicitação de cotação</h2>
              <button onClick={() => setShowConfirm(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-2">Confirma a criação da cotação de compra?</p>
            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1 mb-5">
              <p><span className="font-medium text-foreground">Apelido:</span> {nome}</p>
              <p><span className="font-medium text-foreground">Itens:</span> {selectedItemIds.size} item(s)</p>
              <p><span className="font-medium text-foreground">Fornecedores:</span> {selectedFornIds.size} fornecedor(es)</p>
              <p><span className="font-medium text-foreground">Prazo:</span> {dataLimite ? new Date(dataLimite + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
            </div>

            {saveError && (
              <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {saveError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowConfirm(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {createdDialog}
    </div>
  );
}
