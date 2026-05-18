"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import {
  CheckSquare, Square, ChevronRight, Loader2, Search,
  X, Building2, AlertTriangle,
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
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              current === s.n ? "bg-blue-600 text-white" :
              current > s.n  ? "bg-green-500 text-white" :
                               "bg-gray-200 text-gray-500"
            )}>
              {current > s.n ? "✓" : s.n}
            </div>
            <span className={cn(
              "text-sm font-medium whitespace-nowrap",
              current === s.n ? "text-blue-700" :
              current > s.n  ? "text-green-600" :
                               "text-gray-400"
            )}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("w-12 h-px mx-2", current > s.n ? "bg-green-400" : "bg-gray-200")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NovaCotacaoWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const necessidadeIdParam = searchParams.get("necessidadeId");

  useTabTitle("Nova Cotação");

  // ── Read sessionStorage ONCE for lazy state initialization ──────────────
  // This runs synchronously before first render, so state is correct from the start.
  // The persist useEffect then keeps sessionStorage in sync on every change.
  function _ss<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = sessionStorage.getItem("cotacao-wizard");
      if (!raw) return fallback;
      const val = JSON.parse(raw)[key];
      return val !== undefined && val !== null ? val : fallback;
    } catch { return fallback; }
  }

  const [step, setStep] = useState<number>(() => _ss("step", 1));

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [scItems, setScItems]           = useState<SCItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set(_ss<string[]>("selectedItemIds", [])));
  const [itemSearch, setItemSearch]     = useState("");

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [nome, setNome]                 = useState<string>(() => _ss("nome", ""));
  const [dataLimite, setDataLimite]     = useState<string>(() => _ss("dataLimite", ""));
  const [infoEntrega, setInfoEntrega]   = useState<string>(() => _ss("infoEntrega", ""));
  const [step2Error, setStep2Error]     = useState("");

  // ── Step 3 state ──────────────────────────────────────────────────────────
  const [tab, setTab]                         = useState<"ultimos" | "todos">("ultimos");
  const [fornSearch, setFornSearch]           = useState("");
  const [allFornecedores, setAllFornecedores] = useState<Fornecedor[]>([]);
  const [ultFornecedores, setUltFornecedores] = useState<Fornecedor[]>([]);
  const [loadingForn, setLoadingForn]         = useState(false);
  const [selectedFornIds, setSelectedFornIds] = useState<Set<string>>(() => new Set(_ss<string[]>("selectedFornIds", [])));
  const [showConfirm, setShowConfirm]         = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState("");

  // ── Item-in-cotação warnings ──────────────────────────────────────────────
  type ItemWarning = { itemId: string; codigo: string; descricao: string; cotacoes: string[] };
  const [itemWarnings, setItemWarnings]       = useState<ItemWarning[]>([]);
  const [showItemWarning, setShowItemWarning] = useState(false);
  const [checkingItems, setCheckingItems]     = useState(false);

  // ── Persist wizard state on every change ─────────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem("cotacao-wizard", JSON.stringify({
        step,
        selectedItemIds: Array.from(selectedItemIds),
        nome,
        dataLimite,
        infoEntrega,
        selectedFornIds: Array.from(selectedFornIds),
      }));
    } catch { /* ignore */ }
  }, [step, selectedItemIds, nome, dataLimite, infoEntrega, selectedFornIds]);

  // ── Load SC items ─────────────────────────────────────────────────────────
  useEffect(() => {
    // State already restored from sessionStorage via lazy useState initializers above

    setLoadingItems(true);
    fetch("/api/suprimentos/necessidades?status=APROVADA")
      .then((r) => r.json())
      .then((json) => {
        const scs = Array.isArray(json) ? json : (json.data ?? []);
        const flat: SCItem[] = [];
        scs.forEach((sc: {
          id: string; numero: string; categoria: string | null;
          dataNecessidade: string | null;
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
        });
        setScItems(flat);

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
  useEffect(() => {
    if (step !== 3) return;
    setLoadingForn(true);
    const selectedItems = scItems.filter((i) => selectedItemIds.has(i.id));
    const itemIds = Array.from(new Set(selectedItems.map((i) => i.itemId))).join(",");
    Promise.all([
      fetch(`/api/suprimentos/fornecedores/ultimos?itemIds=${itemIds}`).then((r) => r.json()),
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
    ]).then(([ult, all]) => {
      setUltFornecedores(Array.isArray(ult.data) ? ult.data : []);
      const allList = Array.isArray(all) ? all : (all.data ?? []);
      setAllFornecedores(allList.filter((f: Fornecedor & { ativo?: boolean }) => f.ativo !== false));
    }).finally(() => setLoadingForn(false));
  }, [step, scItems, selectedItemIds]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return !q ? scItems : scItems.filter((i) =>
      i.descricao.toLowerCase().includes(q) ||
      i.codigo.toLowerCase().includes(q) ||
      i.scNumero.toLowerCase().includes(q)
    );
  }, [scItems, itemSearch]);

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
      sessionStorage.removeItem("cotacao-wizard");
      setShowConfirm(false);
      router.push(`/suprimentos/cotacoes/${json.data.id}`);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erro de conexão. Tente novamente.");
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-6 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
        <span className="hover:text-blue-500 cursor-pointer" onClick={() => router.push("/suprimentos/cotacoes")}>Cotações de Compra</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-700 font-medium">Nova Cotação</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-6">Nova Cotação de Compra</h1>

      <StepBar current={step} />

      {/* ── STEP 1 — Necessidades ─────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Necessidade de Compra</h2>
              <p className="text-xs text-gray-400 mt-0.5">Selecione os itens que deseja incluir nesta cotação.</p>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input type="text" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Buscar por item, código ou SC..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {loadingItems ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <button type="button" onClick={toggleAllVisible} className="text-gray-400 hover:text-blue-500">
                        {allVisibleSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-500" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-28">Solicitação</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-16">Item</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-36">Código</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Descrição do produto</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-40">Grupo / Categoria</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600 w-28">Qtd</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-32">Data necessidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400 italic">
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
                          "cursor-pointer transition-colors",
                          checked ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"
                        )}>
                        <td className="px-4 py-3">
                          {checked
                            ? <CheckSquare className="w-4 h-4 text-blue-500" />
                            : <Square className="w-4 h-4 text-gray-300" />}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-700">{item.scNumero}</td>
                        <td className="px-3 py-3 text-center text-gray-500">{String(item.ordem).padStart(4, "0")}</td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-600">{item.codigo}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{item.descricao}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{item.categoria ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">
                          {item.dataNecessidade
                            ? new Date(item.dataNecessidade).toLocaleDateString("pt-BR")
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bottom bar */}
          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => { sessionStorage.removeItem("cotacao-wizard"); router.back(); }}>Cancelar</Button>
            <div className="flex items-center gap-4">
              {selectedItemIds.size > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm px-3 py-1.5 rounded-full">
                  <CheckSquare className="w-3.5 h-3.5" />
                  {selectedItemIds.size} {selectedItemIds.size === 1 ? "registro selecionado" : "registros selecionados"}
                </div>
              )}
              <Button onClick={goStep2} disabled={selectedItemIds.size === 0 || checkingItems}
                className="gap-1.5">
                {checkingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Iniciar cotação <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2 — Dados da cotação ──────────────────────────────────────── */}
      {step === 2 && (
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-gray-800 mb-6">Solicitação de cotação</h2>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3">Dados da cotação</h3>

            <div className="space-y-1.5">
              <Label className="required">
                Apelido do grupo de cotações <span className="text-red-500">*</span>
              </Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Compras materiais elétricos Abril/2026"
                className={cn("focus-visible:ring-blue-400", !nome && step2Error && "border-red-400")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Recebimento cotação <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={dataLimite}
                onChange={(e) => setDataLimite(e.target.value)}
                className={cn("focus-visible:ring-blue-400", !dataLimite && step2Error && "border-red-400")}
              />
              <p className="text-xs text-gray-400">Prazo limite para os fornecedores enviarem suas propostas.</p>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Informações de entrega</h3>
              <Textarea
                value={infoEntrega}
                onChange={(e) => setInfoEntrega(e.target.value)}
                rows={4}
                className="font-mono text-sm focus-visible:ring-blue-400"
                placeholder="Endereço de entrega, instruções especiais..."
              />
              <p className="text-xs text-gray-400 mt-1">Preenchido automaticamente com os dados da empresa. Você pode editar.</p>
            </div>

            {step2Error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {step2Error}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>← Voltar</Button>
            <Button onClick={goStep3} className="gap-1.5">
              Próximo passo <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3 — Seleção de Fornecedores ─────────────────────────────── */}
      {step === 3 && (
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">Seleção de Fornecedores / Participantes</h2>
          <p className="text-xs text-gray-400 mb-5">Selecione os fornecedores que receberão a solicitação de cotação.</p>

          {/* Selected summary */}
          {selectedFornIds.size > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Fornecedores / Participantes selecionados
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedFornIds).map((fid) => {
                  const f = allFornecedores.find((x) => x.id === fid) ?? ultFornecedores.find((x) => x.id === fid);
                  return (
                    <span key={fid}
                      className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                      <Building2 className="w-3 h-3" />
                      {f?.nomeFantasia ?? f?.razaoSocial ?? fid}
                      <button type="button" onClick={() => toggleForn(fid)} className="ml-1 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs + Search */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4">
              <div className="flex gap-0">
                {(["ultimos", "todos"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => { setTab(t); setFornSearch(""); }}
                    className={cn(
                      "px-4 py-3.5 text-sm font-medium border-b-2 transition-colors",
                      tab === t ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
                    )}>
                    {t === "ultimos" ? "Últimos fornecedores" : "Todos os fornecedores"}
                  </button>
                ))}
              </div>
              <div className="relative w-72 py-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input type="text" value={fornSearch} onChange={(e) => setFornSearch(e.target.value)}
                  placeholder="Busque por CNPJ, nome fantasia, razão social..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            {tab === "ultimos" && (
              <p className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                Os últimos fornecedores são listados conforme cotações anteriores para os produtos selecionados.
              </p>
            )}

            <div className="divide-y divide-gray-100">
              {loadingForn ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : fornListForTab().length === 0 ? (
                <div className="text-center py-10 text-sm text-gray-400 italic">
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
                      "flex items-start gap-3 px-4 py-4 cursor-pointer transition-colors",
                      checked ? "bg-blue-50" : "hover:bg-gray-50"
                    )}>
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      checked ? "bg-blue-500 border-blue-500" : "border-gray-300"
                    )}>
                      {checked && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium text-sm", checked ? "text-blue-800" : "text-gray-900")}>
                        {f.nomeFantasia || f.razaoSocial}
                      </p>
                      <div className="flex flex-wrap gap-x-6 gap-y-0.5 mt-1 text-xs text-gray-500">
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
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>← Voltar</Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={selectedFornIds.size === 0}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              Gerar cotação
            </Button>
          </div>
        </div>
      )}

      {/* ── Item-in-cotação warning modal ─────────────────────────────────── */}
      {showItemWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">Itens em cotação aberta</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Os itens abaixo já estão em cotações em andamento. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div className="border rounded-lg divide-y max-h-56 overflow-y-auto mb-5">
              {itemWarnings.map((w) => (
                <div key={w.itemId} className="px-4 py-2.5">
                  <p className="text-sm font-medium text-gray-800">{w.codigo} — {w.descricao}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Em cotação: <span className="text-amber-600 font-medium">{w.cotacoes.join(", ")}</span>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Solicitação de cotação</h2>
              <button onClick={() => setShowConfirm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-2">Confirma a criação da cotação de compra?</p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1 mb-5">
              <p><span className="font-medium text-gray-700">Apelido:</span> {nome}</p>
              <p><span className="font-medium text-gray-700">Itens:</span> {selectedItemIds.size} item(s)</p>
              <p><span className="font-medium text-gray-700">Fornecedores:</span> {selectedFornIds.size} fornecedor(es)</p>
              <p><span className="font-medium text-gray-700">Prazo:</span> {dataLimite ? new Date(dataLimite + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
            </div>

            {saveError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
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
    </div>
  );
}
