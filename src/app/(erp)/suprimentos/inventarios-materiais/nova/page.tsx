"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Loader2, Save, Filter, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";

type LocalEstoqueOpt = { id: string; nome: string };
type ColaboradorOpt  = { id: string; nome: string; setorId: string | null };
type ItemOpt         = { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
type EstoqueItemOpt  = { id: string; quantidadeAtual: unknown; localizacao: string | null; item: ItemOpt };

type SampleRow = {
  _key:        string;
  itemId:      string;
  item:        ItemOpt | null;
  localizacao: string;
  saldoSistema: string;
};

function toNum(v: unknown) { return v == null ? 0 : parseFloat(String(v)); }

const ACTIVE_TAB_CLS = "border-b-2 border-indigo-600 text-indigo-700 font-medium";
const INACTIVE_TAB_CLS = "border-b-2 border-transparent text-gray-500 hover:text-gray-800";

export default function NovoInventarioPage() {
  useTabTitle("Novo Inventário de Materiais");
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [localEstoqueId, setLocalEstoqueId] = useState(searchParams.get("localEstoqueId") ?? "");
  const [colaboradorId,  setColaboradorId]  = useState("");
  const [data,           setData]           = useState(() => new Date().toISOString().split("T")[0]);
  const [tipo,           setTipo]           = useState("TOTAL");
  const [observacoes,    setObservacoes]    = useState("");

  const [activeTab, setActiveTab] = useState<"filtros" | "amostragem">("filtros");

  // Filtros de amostragem
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("");
  const [filtroClasse,      setFiltroClasse]      = useState("");
  const [filtroGrupo,       setFiltroGrupo]       = useState("");
  const [filtroMaterial,    setFiltroMaterial]    = useState("");

  // Amostragem rows
  const [rows, setRows] = useState<SampleRow[]>([]);

  // Options
  const [locais,       setLocais]       = useState<LocalEstoqueOpt[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [estoqueItens, setEstoqueItens]  = useState<EstoqueItemOpt[]>([]);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadOptions = useCallback(async () => {
    const [lRes, cRes] = await Promise.all([
      fetch("/api/suprimentos/locais-estoque?ativo=true"),
      fetch("/api/empresa/colaboradores?ativo=true"),
    ]);
    setLocais((await lRes.json()) || []);
    const cData = await cRes.json();
    setColaboradores(Array.isArray(cData.data) ? cData.data : []);
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Load estoque do almoxarifado selecionado
  useEffect(() => {
    if (!localEstoqueId) { setEstoqueItens([]); return; }
    fetch(`/api/suprimentos/locais-estoque/${localEstoqueId}`)
      .then(r => r.json())
      .then((d) => setEstoqueItens(d.estoqueItens ?? []));
  }, [localEstoqueId]);

  function handleFiltrarAmostragem() {
    let base = estoqueItens;
    if (filtroLocalizacao) base = base.filter(e => e.localizacao?.toLowerCase().includes(filtroLocalizacao.toLowerCase()));
    if (filtroMaterial)   base = base.filter(e => e.item.descricao.toLowerCase().includes(filtroMaterial.toLowerCase()) || e.item.codigo.toLowerCase().includes(filtroMaterial.toLowerCase()));
    setRows(base.map((e) => ({
      _key:        e.id,
      itemId:      e.item.id,
      item:        e.item,
      localizacao: e.localizacao ?? "",
      saldoSistema: String(toNum(e.quantidadeAtual)),
    })));
    setActiveTab("amostragem");
  }

  function handleFiltrarPendentes() {
    const base = estoqueItens.filter(e => toNum(e.quantidadeAtual) > 0);
    setRows(base.map((e) => ({
      _key:        e.id,
      itemId:      e.item.id,
      item:        e.item,
      localizacao: e.localizacao ?? "",
      saldoSistema: String(toNum(e.quantidadeAtual)),
    })));
    setActiveTab("amostragem");
  }

  function updateRow(key: string, field: keyof SampleRow, value: string) {
    setRows(p => p.map(r => r._key === key ? { ...r, [field]: value } : r));
  }

  async function handleSave(statusFinal: "RASCUNHO" | "EM_ANDAMENTO") {
    if (!localEstoqueId) { setSaveError("Almoxarifado é obrigatório"); return; }
    if (!data) { setSaveError("Data é obrigatória"); return; }
    setSaving(true); setSaveError("");
    try {
      const res = await fetch("/api/suprimentos/inventarios-materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localEstoqueId,
          colaboradorId: colaboradorId || null,
          data,
          tipo,
          observacoes: observacoes || null,
        }),
      });
      if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
      const { data: created } = await res.json();

      // Save items if any
      if (rows.length > 0) {
        await fetch(`/api/suprimentos/inventarios-materiais/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusFinal,
            itens: rows.map(r => ({
              itemId:      r.itemId,
              localizacao: r.localizacao || null,
              saldoSistema: parseFloat(r.saldoSistema) || 0,
              saldoFisico:  null,
              diferenca:    null,
            })),
          }),
        });
      } else if (statusFinal === "EM_ANDAMENTO") {
        await fetch(`/api/suprimentos/inventarios-materiais/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusFinal }),
        });
      }

      router.push(`/suprimentos/inventarios-materiais/${created.id}`);
    } catch (e) {
      setSaveError(String(e));
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-gray-500">
        <Link href="/suprimentos/inventarios-materiais" className="hover:text-gray-800 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Inventário de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-800 font-medium">Novo</span>
      </div>

      <div className="px-8 pb-8 space-y-6 max-w-4xl">
        {/* Header card */}
        <div className="rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inventário de Materiais</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1 block">Almoxarifado <span className="text-red-500">*</span></Label>
              <select value={localEstoqueId} onChange={(e) => setLocalEstoqueId(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <option value="">Selecione...</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Funcionário</Label>
              <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <option value="">Selecione...</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Data do Inventário <span className="text-red-500">*</span></Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Tipo do Inventário</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <option value="TOTAL">Total</option>
                <option value="PARCIAL">Parcial</option>
                <option value="CICLICO">Cíclico</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Observações</Label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4">
            <nav className="flex gap-0">
              {([
                { key: "filtros",    label: "Filtros de Amostragem do Inventário" },
                { key: "amostragem", label: `Amostragem do Inventário${rows.length > 0 ? ` (${rows.length})` : ""}` },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={cn("px-4 py-3 text-sm transition-colors", activeTab === t.key ? ACTIVE_TAB_CLS : INACTIVE_TAB_CLS)}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Filtros tab */}
          {activeTab === "filtros" && (
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-400">Defina os filtros para selecionar os materiais que serão inventariados.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-1 block">Localização de Material</Label>
                  <Input value={filtroLocalizacao} onChange={(e) => setFiltroLocalizacao(e.target.value)} placeholder="Ex: A1-01" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Classe de Material</Label>
                  <Input value={filtroClasse} onChange={(e) => setFiltroClasse(e.target.value)} placeholder="Classe" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Grupo de Material</Label>
                  <Input value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} placeholder="Grupo" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Material</Label>
                  <Input value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} placeholder="Código ou descrição" className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button size="sm" variant="outline" onClick={handleFiltrarAmostragem} disabled={!localEstoqueId}>
                  <Filter className="w-3.5 h-3.5 mr-1.5" />Filtrar Amostragem
                </Button>
                <Button size="sm" variant="outline" onClick={handleFiltrarPendentes} disabled={!localEstoqueId}>
                  <Filter className="w-3.5 h-3.5 mr-1.5" />Filtrar materiais com saldo
                </Button>
              </div>
              {!localEstoqueId && <p className="text-xs text-amber-600">Selecione um almoxarifado para usar os filtros.</p>}
            </div>
          )}

          {/* Amostragem tab */}
          {activeTab === "amostragem" && (
            <div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500">{rows.length} material(is) na amostragem</p>
                <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, {
                  _key: Math.random().toString(36).slice(2), itemId: "", item: null, localizacao: "", saldoSistema: "0",
                }])}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
                </Button>
              </div>
              {rows.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">Nenhum material na amostragem.</p>
                  <p className="text-xs mt-1">Use os filtros na aba anterior para adicionar materiais.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 font-medium">Material</th>
                        <th className="text-left px-4 py-2.5 font-medium">Unidade</th>
                        <th className="text-left px-4 py-2.5 font-medium">Localização</th>
                        <th className="text-right px-4 py-2.5 font-medium">Saldo Sistema</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r) => (
                        <tr key={r._key}>
                          <td className="px-4 py-2.5">
                            {r.item ? (
                              <div>
                                <span className="text-gray-800">{r.item.descricao}</span>
                                <span className="text-xs text-gray-400 ml-2 font-mono">{r.item.codigo}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">
                            {r.item?.unidade?.sigla ?? r.item?.unidadeMedida ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Input value={r.localizacao} onChange={(e) => updateRow(r._key, "localizacao", e.target.value)} className="h-7 text-xs w-28" />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Input type="number" step="0.001" value={r.saldoSistema} onChange={(e) => updateRow(r._key, "saldoSistema", e.target.value)} className="h-7 text-xs w-24 ml-auto" />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => setRows(p => p.filter(x => x._key !== r._key))} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={() => handleSave("EM_ANDAMENTO")} disabled={saving || !localEstoqueId || !data}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Iniciar Inventário
          </Button>
          <Button variant="outline" onClick={() => handleSave("RASCUNHO")} disabled={saving || !localEstoqueId || !data}>
            Salvar Rascunho
          </Button>
          <Button variant="ghost" onClick={() => router.push("/suprimentos/inventarios-materiais")} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
