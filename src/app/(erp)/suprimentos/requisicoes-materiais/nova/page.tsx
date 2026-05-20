"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Plus, Trash2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type LocalEstoqueOpt = { id: string; nome: string };
type ColaboradorOpt  = { id: string; nome: string; setorId: string | null };
type SetorOpt        = { id: string; nome: string };
type CentroCustoOpt  = { id: string; codigo: string; nome: string };
type ItemOpt         = { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };

type ItemRow = {
  _key:         string;
  itemId:       string;
  quantidade:   string;
  unidade:      string;
  localizacao:  string;
  centroCustoId: string;
  contaContabil: string;
  os:           string;
  requisicaoRef: string;
};

function emptyRow(): ItemRow {
  return {
    _key:         Math.random().toString(36).slice(2),
    itemId:       "",
    quantidade:   "",
    unidade:      "",
    localizacao:  "",
    centroCustoId: "",
    contaContabil: "",
    os:           "",
    requisicaoRef: "",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NovaRequisicaoPage() {
  useTabTitle("Nova Req/Dev de Materiais");
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Header fields
  const [tipo,           setTipo]           = useState<"REQUISICAO" | "DEVOLUCAO">("REQUISICAO");
  const [localEstoqueId, setLocalEstoqueId] = useState(searchParams.get("localEstoqueId") ?? "");
  const [colaboradorId,  setColaboradorId]  = useState("");
  const [setorId,        setSetorId]        = useState("");
  const [almoxarifeId,   setAlmoxarifeId]   = useState("");
  const [data,           setData]           = useState(() => new Date().toISOString().split("T")[0]);
  const [os,             setOs]             = useState("");
  const [centroCustoId,  setCentroCustoId]  = useState("");
  const [contaContabil,  setContaContabil]  = useState("");
  const [observacoes,    setObservacoes]    = useState("");

  // Items
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);

  // Options
  const [locais,       setLocais]       = useState<LocalEstoqueOpt[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [setores,      setSetores]      = useState<SetorOpt[]>([]);
  const [centros,      setCentros]      = useState<CentroCustoOpt[]>([]);
  const [itensCat,     setItensCat]     = useState<ItemOpt[]>([]);

  // UI
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  // Item search
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});

  const loadOptions = useCallback(async () => {
    const [lRes, cRes, sRes, ccRes, itRes] = await Promise.all([
      fetch("/api/suprimentos/locais-estoque?ativo=true"),
      fetch("/api/empresa/colaboradores?ativo=true"),
      fetch("/api/empresa/setores?ativo=true"),
      fetch("/api/empresa/centros-custo?ativo=true"),
      fetch("/api/suprimentos/produtos?ativo=true&limit=9999"),
    ]);
    setLocais(       (await lRes.json())  || []);
    const colData = await cRes.json();
    setColaboradores(Array.isArray(colData.data) ? colData.data : []);
    setSetores(      (await sRes.json()).data || []);
    setCentros(      (await ccRes.json()).data || []);
    const itData = await itRes.json();
    setItensCat(Array.isArray(itData.data) ? itData.data : []);
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Auto-fill setor when colaborador changes
  function handleColaboradorChange(id: string) {
    setColaboradorId(id);
    const col = colaboradores.find((c) => c.id === id);
    if (col?.setorId) setSetorId(col.setorId);
  }

  // Row helpers
  function updateRow(key: string, field: keyof ItemRow, value: string) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, [field]: value } : r));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r._key !== key));
  }

  function handleItemSelect(key: string, itemId: string) {
    const item = itensCat.find((i) => i.id === itemId);
    setRows((prev) => prev.map((r) =>
      r._key === key ? { ...r, itemId, unidade: item?.unidade?.sigla ?? item?.unidadeMedida ?? "" } : r
    ));
  }

  // Filtered items for each row search
  function filteredItems(key: string) {
    const q = (itemSearch[key] ?? "").toLowerCase();
    if (!q) return itensCat.slice(0, 50);
    return itensCat.filter((i) =>
      i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
    ).slice(0, 50);
  }

  async function handleSave(statusFinal: "RASCUNHO" | "ABERTA") {
    if (!localEstoqueId) { setSaveError("Almoxarifado é obrigatório"); return; }
    const validRows = rows.filter((r) => r.itemId && r.quantidade);
    if (validRows.length === 0) { setSaveError("Adicione pelo menos um item"); return; }

    setSaving(true); setSaveError("");
    try {
      const res = await fetch("/api/suprimentos/requisicoes-materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          localEstoqueId,
          colaboradorId:  colaboradorId  || null,
          setorId:        setorId        || null,
          almoxarifeId:   almoxarifeId   || null,
          os:             os             || null,
          centroCustoId:  centroCustoId  || null,
          contaContabil:  contaContabil  || null,
          data,
          observacoes:    observacoes    || null,
          itens: validRows.map((r) => ({
            itemId:       r.itemId,
            quantidade:   parseFloat(r.quantidade),
            unidade:      r.unidade      || null,
            localizacao:  r.localizacao  || null,
            centroCustoId: r.centroCustoId || null,
            contaContabil: r.contaContabil || null,
            os:           r.os           || null,
            requisicaoRef: r.requisicaoRef || null,
          })),
        }),
      });
      if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
      const { data: created } = await res.json();

      // If needs to be ABERTA, update status
      if (statusFinal === "ABERTA") {
        await fetch(`/api/suprimentos/requisicoes-materiais/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ABERTA" }),
        });
      }
      router.push(`/suprimentos/requisicoes-materiais/${created.id}`);
    } catch (e) {
      setSaveError(String(e));
      setSaving(false);
    }
  }

  const tipoLabel = tipo === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-gray-500">
        <Link href="/suprimentos/requisicoes-materiais" className="hover:text-gray-800 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Req/Dev de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-800 font-medium">Nova</span>
      </div>

      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {/* Type toggle */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(["REQUISICAO", "DEVOLUCAO"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  tipo === t
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {t === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais"}
              </button>
            ))}
          </div>
        </div>

        {/* Header card */}
        <div className="rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tipoLabel}</h2>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {/* Almoxarifado */}
            <div>
              <Label className="text-xs mb-1 block">Almoxarifado <span className="text-red-500">*</span></Label>
              <select
                value={localEstoqueId}
                onChange={(e) => setLocalEstoqueId(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Selecione...</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>

            {/* Funcionário / Solicitante */}
            <div>
              <Label className="text-xs mb-1 block">Funcionário</Label>
              <select
                value={colaboradorId}
                onChange={(e) => handleColaboradorChange(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Selecione...</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>

            {/* Setor */}
            <div>
              <Label className="text-xs mb-1 block">Setor</Label>
              <select
                value={setorId}
                onChange={(e) => setSetorId(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Selecione...</option>
                {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>

            {/* Almoxarife */}
            <div>
              <Label className="text-xs mb-1 block">Almoxarife</Label>
              <select
                value={almoxarifeId}
                onChange={(e) => setAlmoxarifeId(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Selecione...</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>

            {/* Data */}
            <div>
              <Label className="text-xs mb-1 block">Data <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* O.S. (Requisição only) */}
            {tipo === "REQUISICAO" && (
              <div>
                <Label className="text-xs mb-1 block">O.S.</Label>
                <Input value={os} onChange={(e) => setOs(e.target.value)} className="h-8 text-sm" placeholder="Ordem de serviço" />
              </div>
            )}

            {/* Centro de Custo (Requisição only) */}
            {tipo === "REQUISICAO" && (
              <div>
                <Label className="text-xs mb-1 block">Centro de Custo</Label>
                <select
                  value={centroCustoId}
                  onChange={(e) => setCentroCustoId(e.target.value)}
                  className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">Selecione...</option>
                  {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
                </select>
              </div>
            )}

            {/* Conta Contábil (Requisição only) */}
            {tipo === "REQUISICAO" && (
              <div>
                <Label className="text-xs mb-1 block">Conta Contábil</Label>
                <Input value={contaContabil} onChange={(e) => setContaContabil(e.target.value)} className="h-8 text-sm" placeholder="Conta contábil" />
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <Label className="text-xs mb-1 block">Observações</Label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Materiais</h3>
            <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, emptyRow()])}>
              <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium w-64">Material</th>
                  <th className="text-left px-3 py-2 font-medium w-16">Un.</th>
                  <th className="text-left px-3 py-2 font-medium w-24">Qtde</th>
                  {tipo === "REQUISICAO" && <>
                    <th className="text-left px-3 py-2 font-medium w-36">Centro de Custo</th>
                    <th className="text-left px-3 py-2 font-medium w-28">Conta Contábil</th>
                    <th className="text-left px-3 py-2 font-medium w-24">O.S.</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Requisição</th>
                  </>}
                  <th className="text-left px-3 py-2 font-medium w-28">Localização</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row._key}>
                    {/* Material */}
                    <td className="px-3 py-2">
                      <div className="relative">
                        <Input
                          value={row.itemId ? (itensCat.find(i => i.id === row.itemId)?.descricao ?? "") : (itemSearch[row._key] ?? "")}
                          onChange={(e) => {
                            if (row.itemId) {
                              updateRow(row._key, "itemId", "");
                              setItemSearch((p) => ({ ...p, [row._key]: e.target.value }));
                            } else {
                              setItemSearch((p) => ({ ...p, [row._key]: e.target.value }));
                            }
                          }}
                          placeholder="Buscar material..."
                          className="h-7 text-xs"
                        />
                        {!row.itemId && (itemSearch[row._key] ?? "").length > 0 && (
                          <div className="absolute top-full left-0 z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-0.5">
                            {filteredItems(row._key).map((it) => (
                              <button
                                key={it.id}
                                onClick={() => {
                                  handleItemSelect(row._key, it.id);
                                  setItemSearch((p) => ({ ...p, [row._key]: "" }));
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                              >
                                <span className="font-mono text-gray-400 shrink-0">{it.codigo}</span>
                                <span className="text-gray-700 truncate">{it.descricao}</span>
                              </button>
                            ))}
                            {filteredItems(row._key).length === 0 && (
                              <p className="px-3 py-2 text-xs text-gray-400">Nenhum material encontrado</p>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Un. */}
                    <td className="px-3 py-2">
                      <Input value={row.unidade} onChange={(e) => updateRow(row._key, "unidade", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    {/* Qtde */}
                    <td className="px-3 py-2">
                      <Input
                        type="number" step="0.001" min="0"
                        value={row.quantidade}
                        onChange={(e) => updateRow(row._key, "quantidade", e.target.value)}
                        className="h-7 text-xs w-20"
                      />
                    </td>
                    {/* CC / Conta / OS / Req (Requisição only) */}
                    {tipo === "REQUISICAO" && <>
                      <td className="px-3 py-2">
                        <select
                          value={row.centroCustoId}
                          onChange={(e) => updateRow(row._key, "centroCustoId", e.target.value)}
                          className="h-7 text-xs border border-gray-200 rounded px-1.5 bg-white w-full"
                        >
                          <option value="">—</option>
                          {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.contaContabil} onChange={(e) => updateRow(row._key, "contaContabil", e.target.value)} className="h-7 text-xs" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.os} onChange={(e) => updateRow(row._key, "os", e.target.value)} className="h-7 text-xs" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.requisicaoRef} onChange={(e) => updateRow(row._key, "requisicaoRef", e.target.value)} className="h-7 text-xs" />
                      </td>
                    </>}
                    {/* Localização */}
                    <td className="px-3 py-2">
                      <Input value={row.localizacao} onChange={(e) => updateRow(row._key, "localizacao", e.target.value)} className="h-7 text-xs" placeholder="Ex: A1-01" />
                    </td>
                    {/* Remove */}
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => removeRow(row._key)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={() => handleSave("ABERTA")} disabled={saving || !localEstoqueId}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {tipo === "REQUISICAO" ? "Emitir Requisição" : "Emitir Devolução"}
          </Button>
          <Button variant="outline" onClick={() => handleSave("RASCUNHO")} disabled={saving || !localEstoqueId}>
            Salvar Rascunho
          </Button>
          <Button variant="ghost" onClick={() => router.push("/suprimentos/requisicoes-materiais")} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
