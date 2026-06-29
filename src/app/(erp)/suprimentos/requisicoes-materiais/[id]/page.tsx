"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Loader2, Pencil, Trash2, Save, X, Plus, CheckCircle2,
  XCircle, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatDate, formatBRL } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type ItemRow = {
  id:           string;
  itemId:       string;
  quantidade:   string;
  unidade:      string;
  localizacao:  string;
  centroCustoId: string;
  naturezaFinanceiraId: string;
  destinoManual: string;
  os:           string;
  requisicaoRef: string;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null } | null;
  centroCusto: { id: string; codigo: string; nome: string } | null;
  naturezaFinanceira: { id: string; nome: string; cif: boolean } | null;
  custoUnitario?: number;
  valorTotal?: number;
};

type Req = {
  id: string;
  numero: string;
  tipo: "REQUISICAO" | "DEVOLUCAO";
  status: string;
  data: string;
  os: string | null;
  centroCustoId: string | null;
  observacoes: string | null;
  localEstoque: { id: string; nome: string } | null;
  localDestino: { id: string; nome: string } | null;
  colaborador:  { id: string; nome: string } | null;
  setor:        { id: string; nome: string } | null;
  almoxarife:   { id: string; nome: string } | null;
  centroCusto:  { id: string; codigo: string; nome: string } | null;
  itens: ItemRow[];
  valorTotal?: number;
};

type ColaboradorOpt = { id: string; nome: string; setorId: string | null };
type SetorOpt       = { id: string; nome: string };
type CentroCustoOpt = { id: string; codigo: string; nome: string };
type ItemOpt        = { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO:  "bg-muted text-muted-foreground",
  ABERTA:    "bg-info/15 text-info",
  ATENDIDA:  "bg-success/15 text-success",
  CANCELADA: "bg-danger/15 text-danger",
};
const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho", ABERTA: "Aberta", ATENDIDA: "Atendida", CANCELADA: "Cancelada",
};

function emptyEditRow(base?: Partial<ItemRow>): ItemRow {
  return {
    id: base?.id ?? "",
    itemId: base?.itemId ?? "",
    quantidade: base?.quantidade ?? "",
    unidade: base?.unidade ?? "",
    localizacao: base?.localizacao ?? "",
    centroCustoId: base?.centroCustoId ?? "",
    naturezaFinanceiraId: base?.naturezaFinanceiraId ?? "",
    destinoManual: base?.destinoManual ?? "",
    os: base?.os ?? "",
    requisicaoRef: base?.requisicaoRef ?? "",
    item: base?.item ?? null,
    centroCusto: base?.centroCusto ?? null,
    naturezaFinanceira: base?.naturezaFinanceira ?? null,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RequisicaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [req, setReq]       = useState<Req | null>(null);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    colaboradorId: "", setorId: "", almoxarifeId: "",
    os: "", centroCustoId: "", data: "", observacoes: "",
  });
  const [editRows, setEditRows] = useState<ItemRow[]>([]);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");

  const [showDelete, setShowDelete]     = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Aviso de saldo negativo ao Atender: itens que ficariam negativos + status alvo.
  const [negConfirm, setNegConfirm] = useState<{ status: string; itens: { itemId: string; descricao?: string | null; saldoAtual: number; saldoDepois: number }[] } | null>(null);

  // Options
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [setores,       setSetores]       = useState<SetorOpt[]>([]);
  const [centros,       setCentros]       = useState<CentroCustoOpt[]>([]);
  const [naturezas,     setNaturezas]     = useState<{ id: string; nome: string; cif?: boolean }[]>([]);
  const [itensCat,      setItensCat]      = useState<ItemOpt[]>([]);
  const [itemSearch,    setItemSearch]    = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/suprimentos/requisicoes-materiais/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const { data } = await res.json();
    setReq(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editMode) return;
    Promise.all([
      fetch("/api/empresa/colaboradores?ativo=true").then(r => r.json()),
      fetch("/api/empresa/setores?ativo=true").then(r => r.json()),
      fetch("/api/empresa/centros-custo?ativo=true").then(r => r.json()),
      fetch("/api/suprimentos/produtos?ativo=true&limit=9999").then(r => r.json()),
      fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then(r => r.json()),
    ]).then(([cData, sData, ccData, itData, nData]) => {
      setColaboradores(Array.isArray(cData.data) ? cData.data : []);
      setSetores(sData.data ?? []);
      setCentros(ccData.data ?? []);
      setItensCat(Array.isArray(itData.data) ? itData.data : []);
      setNaturezas(Array.isArray(nData) ? nData : nData.data ?? []);
    });
  }, [editMode]);

  function enterEdit() {
    if (!req) return;
    setEditForm({
      colaboradorId: req.colaborador?.id ?? "",
      setorId:       req.setor?.id       ?? "",
      almoxarifeId:  req.almoxarife?.id  ?? "",
      os:            req.os              ?? "",
      centroCustoId: req.centroCusto?.id ?? "",
      data:          req.data.split("T")[0],
      observacoes:   req.observacoes     ?? "",
    });
    setEditRows(req.itens.map((r) => ({
      ...r,
      quantidade:    String(r.quantidade),
      centroCustoId: r.centroCusto?.id ?? "",
      naturezaFinanceiraId: r.naturezaFinanceira?.id ?? "",
      destinoManual: r.destinoManual ?? "",
    })));
    setEditMode(true);
  }

  async function saveEdit() {
    setSaving(true); setSaveError("");
    const validRows = editRows.filter((r) => r.itemId && r.quantidade);
    const res = await fetch(`/api/suprimentos/requisicoes-materiais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editForm,
        data: editForm.data || null,
        itens: validRows.map((r) => ({
          itemId:        r.itemId,
          quantidade:    parseFloat(r.quantidade),
          unidade:       r.unidade      || null,
          localizacao:   r.localizacao  || null,
          centroCustoId: r.centroCustoId || null,
          naturezaFinanceiraId: r.naturezaFinanceiraId || null,
          destinoManual: r.destinoManual || null,
          os:            r.os           || null,
          requisicaoRef: r.requisicaoRef || null,
        })),
      }),
    });
    if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
    await load(); setEditMode(false); setSaving(false);
  }

  async function updateStatus(status: string, permitirSaldoNegativo = false) {
    setSaveError("");
    const res = await fetch(`/api/suprimentos/requisicoes-materiais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, permitirSaldoNegativo }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      // Saldo negativo: não trava — avisa o usuário (verifique o saldo, vai ficar
      // negativo) e deixa atender mesmo assim ao confirmar.
      if (j.codigo === "SALDO_NEGATIVO" && Array.isArray(j.negativos)) {
        setNegConfirm({ status, itens: j.negativos });
        return;
      }
      setSaveError(j.error || "Não foi possível alterar o status da requisição.");
      return;
    }
    setNegConfirm(null);
    await load();
  }

  async function handleDelete() {
    setDeleteLoading(true);
    const res = await fetch(`/api/suprimentos/requisicoes-materiais/${id}`, { method: "DELETE" });
    if (!res.ok) { setDeleteLoading(false); return; }
    router.push("/suprimentos/requisicoes-materiais");
  }

  // edit row helpers
  function updateEditRow(idx: number, field: keyof ItemRow, value: string) {
    setEditRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }
  function handleEditItemSelect(idx: number, itemId: string) {
    const item = itensCat.find((i) => i.id === itemId);
    setEditRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, itemId, item: item ?? null, unidade: item?.unidade?.sigla ?? item?.unidadeMedida ?? "" } : r
    ));
  }
  function filteredItems(key: string) {
    const q = (itemSearch[key] ?? "").toLowerCase();
    if (!q) return itensCat.slice(0, 50);
    return itensCat.filter((i) =>
      i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
    ).slice(0, 50);
  }

  useTabTitle(req ? `${req.tipo === "REQUISICAO" ? "RM" : "DV"} ${req.numero}` : null);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!req) return <div className="px-8 pt-8 text-red-500">Requisição não encontrada</div>;

  const canEdit = req.status === "RASCUNHO" || req.status === "ABERTA";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-muted-foreground">
        <Link href="/suprimentos/requisicoes-materiais" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Req/Dev de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-foreground font-medium">{req.numero}</span>
      </div>

      {/* Header */}
      <div className="px-8 py-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{req.numero}</h1>
            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground")}>
              {req.localDestino && req.status === "ATENDIDA" ? "Liberada" : (STATUS_LABEL[req.status] ?? req.status)}
            </span>
            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium",
              req.tipo === "REQUISICAO" ? "bg-info/10 text-info" : "bg-warning/10 text-warning"
            )}>
              {req.tipo === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{req.localEstoque?.nome} · {formatDate(req.data)}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {req.status === "RASCUNHO" && (
            <Button size="sm" onClick={() => updateStatus("ABERTA")}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Emitir
            </Button>
          )}
          {req.status === "ABERTA" && (
            <Button size="sm" onClick={() => updateStatus("ATENDIDA")}>
              <CheckCircle2 className="w-4 h-4 mr-1" />{req.localDestino ? "Liberar" : "Marcar Atendida"}
            </Button>
          )}
          {canEdit && !editMode && (
            <Button size="sm" variant="outline" onClick={enterEdit}>
              <Pencil className="w-4 h-4 mr-1" />Editar
            </Button>
          )}
          {editMode && (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditMode(false); setSaveError(""); }}>
                <X className="w-4 h-4 mr-1" />Cancelar
              </Button>
            </>
          )}
          {req.status === "RASCUNHO" && (
            <Button size="sm" variant="outline" className="text-danger hover:bg-danger/10 border-danger/30" onClick={() => setShowDelete(true)}>
              <Trash2 className="w-4 h-4 mr-1" />Excluir
            </Button>
          )}
          {req.status === "ABERTA" && (
            <Button size="sm" variant="outline" className="text-danger hover:bg-danger/10 border-danger/30" onClick={() => updateStatus("CANCELADA")}>
              <XCircle className="w-4 h-4 mr-1" />Cancelar
            </Button>
          )}
        </div>
      </div>

      {saveError && <p className="px-8 pb-2 text-sm text-danger">{saveError}</p>}

      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {/* Info card */}
        <div className="rounded-xl border border-border p-5">
          {editMode ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Funcionário</Label>
                <ComboboxWithCreate value={editForm.colaboradorId} onChange={(v) => setEditForm(p => ({ ...p, colaboradorId: v }))}
                  noneLabel="—" triggerClassName="h-8 rounded-md"
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Setor</Label>
                <ComboboxWithCreate value={editForm.setorId} onChange={(v) => setEditForm(p => ({ ...p, setorId: v }))}
                  noneLabel="—" triggerClassName="h-8 rounded-md"
                  options={setores.map((s) => ({ value: s.id, label: s.nome }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Almoxarife</Label>
                <ComboboxWithCreate value={editForm.almoxarifeId} onChange={(v) => setEditForm(p => ({ ...p, almoxarifeId: v }))}
                  noneLabel="—" triggerClassName="h-8 rounded-md"
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Data</Label>
                <Input type="date" value={editForm.data} onChange={(e) => setEditForm(p => ({ ...p, data: e.target.value }))} className="h-8 text-sm" />
              </div>
              {req.tipo === "REQUISICAO" && <>
                <div>
                  <Label className="text-xs mb-1 block">O.S.</Label>
                  <Input value={editForm.os} onChange={(e) => setEditForm(p => ({ ...p, os: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Centro de Custo</Label>
                  <ComboboxWithCreate value={editForm.centroCustoId} onChange={(v) => setEditForm(p => ({ ...p, centroCustoId: v }))}
                    noneLabel="—" triggerClassName="h-8 rounded-md"
                    options={centros.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))} />
                </div>
              </>}
              <div className="col-span-full">
                <Label className="text-xs mb-1 block">Observações</Label>
                <textarea value={editForm.observacoes} onChange={(e) => setEditForm(p => ({ ...p, observacoes: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-none" />
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-xs text-muted-foreground font-medium">Almoxarifado</dt><dd className="text-foreground mt-0.5">{req.localEstoque?.nome ?? "—"}</dd></div>
              {req.localDestino && <div><dt className="text-xs text-muted-foreground font-medium">Liberar para</dt><dd className="text-foreground mt-0.5">{req.localDestino.nome} <span className="text-xs text-muted-foreground">(transferência)</span></dd></div>}
              <div><dt className="text-xs text-muted-foreground font-medium">Funcionário</dt><dd className="text-foreground mt-0.5">{req.colaborador?.nome ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground font-medium">Setor</dt><dd className="text-foreground mt-0.5">{req.setor?.nome ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground font-medium">Almoxarife</dt><dd className="text-foreground mt-0.5">{req.almoxarife?.nome ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground font-medium">Data</dt><dd className="text-foreground mt-0.5">{formatDate(req.data)}</dd></div>
              {req.tipo === "REQUISICAO" && <>
                <div><dt className="text-xs text-muted-foreground font-medium">O.S.</dt><dd className="text-foreground mt-0.5">{req.os ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground font-medium">Centro de Custo</dt><dd className="text-foreground mt-0.5">{req.centroCusto ? `${req.centroCusto.codigo} — ${req.centroCusto.nome}` : "—"}</dd></div>
              </>}
              {req.observacoes && <div className="col-span-full"><dt className="text-xs text-muted-foreground font-medium">Observações</dt><dd className="text-foreground mt-0.5">{req.observacoes}</dd></div>}
            </dl>
          )}
        </div>

        {/* Items */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
            <h3 className="text-sm font-semibold text-foreground">Materiais ({editMode ? editRows.length : req.itens.length})</h3>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => setEditRows((p) => [...p, emptyEditRow()])}>
                <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
              </Button>
            )}
          </div>

          {editMode ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-medium w-64">Material</th>
                    <th className="text-left px-3 py-2 font-medium w-16">Un.</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Qtde</th>
                    {req.tipo === "REQUISICAO" && <>
                      <th className="text-left px-3 py-2 font-medium w-36">Centro de Custo</th>
                      <th className="text-left px-3 py-2 font-medium w-40">Natureza</th>
                      <th className="text-left px-3 py-2 font-medium w-32">Destino</th>
                      <th className="text-left px-3 py-2 font-medium w-24">O.S.</th>
                    </>}
                    <th className="text-left px-3 py-2 font-medium w-28">Localização</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {editRows.map((row, idx) => {
                    const rowKey = String(idx);
                    return (
                      <tr key={rowKey}>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <Input
                              value={row.itemId ? (row.item?.descricao ?? itensCat.find(i => i.id === row.itemId)?.descricao ?? "") : (itemSearch[rowKey] ?? "")}
                              onChange={(e) => {
                                if (row.itemId) {
                                  updateEditRow(idx, "itemId", "");
                                  setItemSearch(p => ({ ...p, [rowKey]: e.target.value }));
                                } else {
                                  setItemSearch(p => ({ ...p, [rowKey]: e.target.value }));
                                }
                              }}
                              placeholder="Buscar material..."
                              className="h-7 text-xs"
                            />
                            {!row.itemId && (itemSearch[rowKey] ?? "").length > 0 && (
                              <div className="absolute top-full left-0 z-50 w-80 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-0.5">
                                {filteredItems(rowKey).map((it) => (
                                  <button key={it.id} onClick={() => { handleEditItemSelect(idx, it.id); setItemSearch(p => ({ ...p, [rowKey]: "" })); }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2">
                                    <span className="font-mono text-muted-foreground shrink-0">{it.codigo}</span>
                                    <span className="text-foreground truncate">{it.descricao}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input value={row.unidade} onChange={(e) => updateEditRow(idx, "unidade", e.target.value)} className="h-7 text-xs w-14" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" step="0.001" min="0" value={row.quantidade} onChange={(e) => updateEditRow(idx, "quantidade", e.target.value)} className="h-7 text-xs w-20" />
                        </td>
                        {req.tipo === "REQUISICAO" && <>
                          <td className="px-3 py-2">
                            <ComboboxWithCreate value={row.centroCustoId} onChange={(v) => updateEditRow(idx, "centroCustoId", v)}
                              noneLabel="—" triggerClassName="h-7 rounded text-xs"
                              options={centros.map((c) => ({ value: c.id, label: c.codigo }))} />
                          </td>
                          <td className="px-3 py-2">
                            <ComboboxWithCreate value={row.naturezaFinanceiraId} onChange={(v) => updateEditRow(idx, "naturezaFinanceiraId", v)}
                              noneLabel="—" triggerClassName="h-7 rounded text-xs"
                              options={naturezas.map((n) => ({ value: n.id, label: `${n.nome}${n.cif ? " · CIF" : ""}` }))} />
                          </td>
                          <td className="px-3 py-2">
                            <select value={row.destinoManual} onChange={(e) => updateEditRow(idx, "destinoManual", e.target.value)}
                              className="h-7 text-xs w-full rounded border border-border bg-card px-1">
                              <option value="">Automático</option>
                              <option value="PEP_MD">PEP-MD</option>
                              <option value="CIF">CIF</option>
                              <option value="IMOBILIZADO">Imobilizado</option>
                              <option value="DESPESA">Despesa</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <Input value={row.os} onChange={(e) => updateEditRow(idx, "os", e.target.value)} className="h-7 text-xs" />
                          </td>
                        </>}
                        <td className="px-3 py-2">
                          <Input value={row.localizacao} onChange={(e) => updateEditRow(idx, "localizacao", e.target.value)} className="h-7 text-xs" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => setEditRows(p => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-danger">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : req.itens.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum material adicionado</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Código</th>
                  <th className="text-left px-4 py-2.5 font-medium">Material</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qtde</th>
                  <th className="text-left px-4 py-2.5 font-medium">Un.</th>
                  {req.tipo === "REQUISICAO" && <>
                    <th className="text-left px-4 py-2.5 font-medium">Centro de Custo</th>
                    <th className="text-left px-4 py-2.5 font-medium">Natureza</th>
                    <th className="text-left px-4 py-2.5 font-medium">Destino</th>
                    <th className="text-left px-4 py-2.5 font-medium">O.S.</th>
                  </>}
                  <th className="text-left px-4 py-2.5 font-medium">Localização</th>
                  <th className="text-right px-4 py-2.5 font-medium">Preço unit.</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {req.itens.map((it) => (
                  <tr key={it.id} className="hover:bg-muted">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{it.item?.codigo ?? "—"}</td>
                    <td className="px-4 py-2.5 text-foreground">{it.item?.descricao ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{parseFloat(String(it.quantidade)).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{it.unidade || it.item?.unidade?.sigla || it.item?.unidadeMedida || "—"}</td>
                    {req.tipo === "REQUISICAO" && <>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{it.centroCusto ? `${it.centroCusto.codigo}` : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{it.naturezaFinanceira ? `${it.naturezaFinanceira.nome}${it.naturezaFinanceira.cif ? " · CIF" : ""}` : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{it.destinoManual ?? "auto"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{it.os ?? "—"}</td>
                    </>}
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{it.localizacao ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{it.custoUnitario ? formatBRL(it.custoUnitario) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">{it.valorTotal ? formatBRL(it.valorTotal) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td colSpan={req.tipo === "REQUISICAO" ? 10 : 6} className="px-4 py-2.5 text-right text-muted-foreground">Total da requisição</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{req.valorTotal != null ? formatBRL(req.valorTotal) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Excluir requisição?</h3>
            <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Excluir"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowDelete(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de saldo negativo ao Atender */}
      {negConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-semibold text-foreground">Estoque ficará negativo</h3>
            <p className="text-sm text-muted-foreground">
              Atender esta requisição deixará o saldo dos itens abaixo <span className="font-semibold">negativo</span>.
              Verifique o estoque antes de confirmar.
            </p>
            <div className="rounded-lg border border-warning/30 bg-warning/10 divide-y divide-amber-100 text-sm">
              {negConfirm.itens.map((it) => (
                <div key={it.itemId} className="flex items-center justify-between px-3 py-2">
                  <span className="text-foreground">{it.descricao ?? it.itemId}</span>
                  <span className="font-mono text-xs">
                    <span className="text-muted-foreground">{it.saldoAtual.toLocaleString("pt-BR")}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span className="font-semibold text-danger">{it.saldoDepois.toLocaleString("pt-BR")}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => updateStatus(negConfirm.status, true)}>
                Atender mesmo assim
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setNegConfirm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
