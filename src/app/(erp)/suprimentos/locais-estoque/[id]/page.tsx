"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Package, AlertTriangle, ChevronRight, ArrowLeft,
  Pencil, Trash2, Save, X, Loader2, Plus, Hash, CheckCircle2, Circle,
  ClipboardList, ClipboardCheck, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Autoria } from "@/components/shared/Autoria";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemUnidade = {
  id: string;
  fatorConversao: unknown;
  isPrincipal: boolean;
  unidade: { sigla: string; nome: string };
};

type EstoqueItem = {
  id: string;
  quantidadeAtual: unknown;
  quantidadeMin: unknown;
  quantidadeMax: unknown | null;
  localizacao: string | null;
  item: {
    id: string;
    codigo: string;
    descricao: string;
    tipo: string;
    ativo: boolean;
    unidadeMedida: string;
    precoCusto: unknown;
    unidade: { sigla: string } | null;
    itemUnidades: ItemUnidade[];
  };
};

type Endereco = {
  id: string;
  codigo: string;
  descricao: string | null;
  ativo: boolean;
};

type Filial = { id: string; razaoSocial: string; nomeFantasia: string | null };

type Local = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  filialId: string | null;
  filial: Filial | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  estoqueItens: EstoqueItem[];
};

function toNum(v: unknown) {
  if (v == null) return 0;
  return parseFloat(String(v));
}

const TABS = [
  { key: "estoque",   label: "Estoque" },
  { key: "enderecos", label: "Endereçamentos" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function LocalEstoqueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [local, setLocal]   = useState<Local | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("estoque");

  // ── Local edit ───────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [form, setForm]         = useState({ nome: "", descricao: "", ativo: true, filialId: "" });
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filiais, setFiliais]   = useState<Filial[]>([]);

  // ── Local delete ─────────────────────────────────────────────────────────────
  const [showDelete, setShowDelete]   = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ── Endereços state ──────────────────────────────────────────────────────────
  const [enderecos, setEnderecos]         = useState<Endereco[]>([]);
  const [endLoading, setEndLoading]       = useState(false);
  const [endLoaded, setEndLoaded]         = useState(false);

  // Add form (inline at top of list)
  const [showAddEnd, setShowAddEnd]       = useState(false);
  const [addForm, setAddForm]             = useState({ codigo: "", descricao: "" });
  const [addSaving, setAddSaving]         = useState(false);
  const [addError, setAddError]           = useState("");

  // Edit row
  const [editEndId, setEditEndId]         = useState<string | null>(null);
  const [editEndForm, setEditEndForm]     = useState({ codigo: "", descricao: "", ativo: true });
  const [editEndSaving, setEditEndSaving] = useState(false);
  const [editEndError, setEditEndError]   = useState("");

  // Delete confirm
  const [deleteEndId, setDeleteEndId]     = useState<string | null>(null);
  const [deleteEndLoading, setDeleteEndLoading] = useState(false);
  const [deleteEndError, setDeleteEndError] = useState("");

  // ── Load local ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const data: Local = await res.json();
    setLocal(data);
    setForm({ nome: data.nome, descricao: data.descricao ?? "", ativo: data.ativo, filialId: data.filialId ?? "" });
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Load endereços (lazy — only when tab is opened) ──────────────────────────
  const loadEnderecos = useCallback(async () => {
    setEndLoading(true);
    const res  = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos`);
    const data = await res.json();
    setEnderecos(Array.isArray(data) ? data : []);
    setEndLoaded(true);
    setEndLoading(false);
  }, [id]);

  function handleTabClick(key: string) {
    setActiveTab(key);
    if (key === "enderecos" && !endLoaded) loadEnderecos();
  }

  // Load filiais when entering edit mode
  useEffect(() => {
    if (!editMode || filiais.length > 0) return;
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((d) => setFiliais(Array.isArray(d) ? d : []));
  }, [editMode]); // eslint-disable-line

  // ── Local save ───────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!local) return;
    if (!form.filialId) { setSaveError("Filial é obrigatória"); return; }
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome:     form.nome.trim(),
        descricao: form.descricao.trim() || null,
        ativo:    form.ativo,
        filialId: form.filialId || null,
      }),
    });
    if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
    await load(); setEditMode(false); setSaving(false);
  }

  async function handleDelete() {
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}`, { method: "DELETE" });
    if (!res.ok) { setDeleteError((await res.json()).error || "Erro ao excluir"); setDeleteLoading(false); return; }
    router.push("/suprimentos/locais-estoque");
  }

  // ── Endereço: add ────────────────────────────────────────────────────────────
  async function addEndereco() {
    if (!addForm.codigo.trim()) return;
    setAddSaving(true); setAddError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: addForm.codigo.trim(), descricao: addForm.descricao.trim() || null }),
    });
    if (!res.ok) { setAddError((await res.json()).error || "Erro ao salvar"); setAddSaving(false); return; }
    setAddForm({ codigo: "", descricao: "" });
    setShowAddEnd(false);
    await loadEnderecos();
    setAddSaving(false);
  }

  // ── Endereço: edit ───────────────────────────────────────────────────────────
  function openEditEnd(e: Endereco) {
    setEditEndId(e.id);
    setEditEndForm({ codigo: e.codigo, descricao: e.descricao ?? "", ativo: e.ativo });
    setEditEndError("");
  }

  async function saveEditEnd() {
    if (!editEndId) return;
    setEditEndSaving(true); setEditEndError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos/${editEndId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: editEndForm.codigo.trim(), descricao: editEndForm.descricao.trim() || null, ativo: editEndForm.ativo }),
    });
    if (!res.ok) { setEditEndError((await res.json()).error || "Erro ao salvar"); setEditEndSaving(false); return; }
    setEditEndId(null);
    await loadEnderecos();
    setEditEndSaving(false);
  }

  // ── Endereço: delete ─────────────────────────────────────────────────────────
  async function confirmDeleteEnd() {
    if (!deleteEndId) return;
    setDeleteEndLoading(true); setDeleteEndError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos/${deleteEndId}`, { method: "DELETE" });
    if (!res.ok) { setDeleteEndError((await res.json()).error || "Erro ao excluir"); setDeleteEndLoading(false); return; }
    setDeleteEndId(null);
    await loadEnderecos();
    setDeleteEndLoading(false);
  }

  // ── Folha de conferência (PDF para impressão) ─────────────────────────────────
  async function downloadConferencia() {
    if (!local) return;
    const loc = local;
    const { default: jsPDF }     = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Cabeçalho com faixa colorida (verde = módulo Almoxarifado/Estoque)
    doc.setFillColor(5, 150, 105);
    doc.rect(0, 0, pageW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("Folha de Conferência de Estoque", 14, 11);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(loc.nome, 14, 18);
    if (loc.filial) {
      doc.setFontSize(8);
      doc.text(loc.filial.nomeFantasia || loc.filial.razaoSocial, pageW - 14, 18, { align: "right" });
    }

    // Linha de informações
    const custoTotalPdf = loc.estoqueItens.reduce(
      (s, e) => s + toNum(e.item.precoCusto) * toNum(e.quantidadeAtual),
      0,
    );
    doc.setTextColor(90);
    doc.setFontSize(8);
    doc.text(
      `Gerado em: ${new Date().toLocaleString("pt-BR")}   ·   ${loc.estoqueItens.length} produto(s)` +
        (custoTotalPdf > 0 ? `   ·   Custo total: ${formatBRL(custoTotalPdf)}` : ""),
      14,
      30,
    );
    doc.setTextColor(0);

    const hasEnderecosPdf = loc.estoqueItens.some((e) => !!e.localizacao);

    // Linhas: código, descrição, [endereço], qtd. sistema (com conversões), qtd. contada (em branco)
    const body = loc.estoqueItens.map((e) => {
      const atual   = toNum(e.quantidadeAtual);
      const unidade = e.item.unidade?.sigla || e.item.unidadeMedida;
      let qtdStr = `${atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`;
      const convs = e.item.itemUnidades
        .filter((iu) => !iu.isPrincipal && Number(iu.fatorConversao) > 0)
        .map(
          (iu) =>
            `${(atual / Number(iu.fatorConversao)).toLocaleString("pt-BR", {
              maximumFractionDigits: 3,
            })} ${iu.unidade.sigla}`,
        );
      if (convs.length) qtdStr += `\n${convs.join("  ·  ")}`;

      const row: string[] = [e.item.codigo, e.item.descricao];
      if (hasEnderecosPdf) row.push(e.localizacao || "—");
      row.push(qtdStr);
      row.push(""); // Qtd. contada — preenchida à mão
      return row;
    });

    const head = [
      [
        "Código",
        "Descrição",
        ...(hasEnderecosPdf ? ["Endereço"] : []),
        "Qtd. Sistema",
        "Qtd. Contada",
      ],
    ];

    // Larguras das colunas (índices deslocam conforme a coluna Endereço aparece)
    const idxQtd     = hasEnderecosPdf ? 3 : 2;
    const idxContada = hasEnderecosPdf ? 4 : 3;
    const columnStyles: Record<number, Partial<{ cellWidth: number; halign: "right"; fontStyle: "bold" }>> = {
      0: { cellWidth: 26, fontStyle: "bold" },
      [idxQtd]:     { cellWidth: 34, halign: "right" },
      [idxContada]: { cellWidth: 38, halign: "right" },
    };
    if (hasEnderecosPdf) columnStyles[2] = { cellWidth: 24 };

    autoTable(doc, {
      startY: 34,
      head,
      body,
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: "middle",
        minCellHeight: 9,
        lineColor: [210, 210, 210],
        lineWidth: 0.1,
      },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles,
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(loc.nome, 14, pageH - 8);
        doc.text(`Página ${data.pageNumber}`, pageW - 14, pageH - 8, { align: "right" });
        doc.setTextColor(0);
      },
    });

    // Linhas de assinatura no fim do relatório
    let y = (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } })
      .lastAutoTable.finalY + 18;
    if (y > pageH - 24) { doc.addPage(); y = 34; }
    const colW = (pageW - 28) / 2;
    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.line(14, y, 14 + colW - 12, y);
    doc.line(14 + colW + 12, y, pageW - 14, y);
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text("Contado por / Data", 14, y + 4);
    doc.text("Conferido por / Data", 14 + colW + 12, y + 4);
    doc.setTextColor(0);

    const slug = loc.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    doc.save(`conferencia-${slug || "estoque"}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ── Tab title ────────────────────────────────────────────────────────────────
  useTabTitle(local?.nome ?? null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!local) return <div className="px-8 pt-8 text-red-500">Local não encontrado</div>;

  const custoTotal = local.estoqueItens.reduce((s, e) => {
    return s + toNum(e.item.precoCusto) * toNum(e.quantidadeAtual);
  }, 0);
  const abaixoMinimo = local.estoqueItens.filter(
    (e) => toNum(e.quantidadeMin) > 0 && toNum(e.quantidadeAtual) < toNum(e.quantidadeMin)
  ).length;

  // Detect which optional columns have at least one non-empty value
  const hasEnderecos = local.estoqueItens.some((e) => !!e.localizacao);
  const hasMin       = local.estoqueItens.some((e) => toNum(e.quantidadeMin) > 0);
  const hasMax       = local.estoqueItens.some((e) => e.quantidadeMax != null && toNum(e.quantidadeMax) > 0);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-muted-foreground">
        <Link href="/suprimentos/locais-estoque" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Locais de Estoque
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-foreground font-medium">{local.nome}</span>
      </div>

      {/* Header */}
      <div className="px-8 py-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-success" />
          </div>
          {editMode ? (
            <div className="space-y-2 flex-1">
              <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} className="text-lg font-semibold h-9 w-72" autoFocus />
              <Input value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Descrição (opcional)" className="h-8 text-sm w-72" />
              {/* Filial select */}
              <div className="w-72">
                <Label className="text-xs text-muted-foreground mb-1 block">Filial <span className="text-red-500">*</span></Label>
                <ComboboxWithCreate
                  value={form.filialId}
                  onChange={(v) => setForm((p) => ({ ...p, filialId: v }))}
                  noneLabel="Sem filial vinculada"
                  triggerClassName="h-8 rounded-md"
                  options={filiais.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ativo" checked={form.ativo} onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))} className="rounded" />
                <Label htmlFor="ativo" className="text-sm cursor-pointer">Ativo</Label>
              </div>
              {saveError && <p className="text-xs text-danger">{saveError}</p>}
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-foreground">{local.nome}</h1>
              {local.descricao && <p className="text-sm text-muted-foreground mt-0.5">{local.descricao}</p>}
              {local.filial && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {local.filial.nomeFantasia || local.filial.razaoSocial}
                </p>
              )}
              <Autoria criadoPor={local.criadoPor} atualizadoPor={local.atualizadoPor} className="mt-1" />
            </div>
          )}
          <span className={`ml-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${local.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
            {local.ativo ? "Ativo" : "Inativo"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editMode ? (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving || !form.nome.trim() || !form.filialId}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditMode(false); setSaveError(""); setForm({ nome: local.nome, descricao: local.descricao ?? "", ativo: local.ativo, filialId: local.filialId ?? "" }); }}>
                <X className="w-4 h-4 mr-1" />Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:bg-teal-500/15 border-teal-200 dark:border-teal-500/30"
                onClick={() => router.push(`/suprimentos/requisicoes-materiais/nova?localEstoqueId=${local.id}`)}>
                <ClipboardList className="w-4 h-4 mr-1" />Req/Dev
              </Button>
              <Button size="sm" variant="outline" className="text-success hover:bg-success/10 border-success/30"
                onClick={downloadConferencia} disabled={local.estoqueItens.length === 0}
                title="Baixar folha de conferência para impressão">
                <Printer className="w-4 h-4 mr-1" />Conferência
              </Button>
              <Button size="sm" variant="outline" className="text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30"
                onClick={() => router.push(`/suprimentos/inventarios-materiais/nova?localEstoqueId=${local.id}`)}>
                <ClipboardCheck className="w-4 h-4 mr-1" />Inventário
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                <Pencil className="w-4 h-4 mr-1" />Editar
              </Button>
              <span className="w-px h-6 bg-muted mx-1 self-center" />
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-danger hover:bg-danger/10" onClick={() => setShowDelete(true)}>
                <Trash2 className="w-4 h-4 mr-1" />Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-8 pb-8 space-y-6">
        {/* Summary bar */}
        <div className="inline-flex items-stretch rounded-xl border border-border bg-card shadow-sm divide-x divide-border overflow-hidden">
          <div className="px-5 py-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Produtos</p>
            <p className="text-2xl font-bold text-info mt-0.5 tabular-nums">{local.estoqueItens.length}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Custo Total</p>
            <p className="text-xl font-bold text-violet-700 dark:text-violet-300 mt-0.5 tabular-nums leading-tight">
              {custoTotal !== 0 ? formatBRL(custoTotal) : <span className="text-muted-foreground/60">—</span>}
            </p>
          </div>
          {abaixoMinimo > 0 ? (
            <div className="px-5 py-3 bg-danger/10 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <div>
                <p className="text-xs text-danger font-medium uppercase tracking-wide">Abaixo do mínimo</p>
                <p className="text-2xl font-bold text-danger mt-0.5 tabular-nums">{abaixoMinimo} produto{abaixoMinimo > 1 ? "s" : ""}</p>
              </div>
            </div>
          ) : (
            <div className="px-5 py-3 bg-success/10 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-success font-medium uppercase tracking-wide">Situação</p>
                <p className="text-sm font-semibold text-success mt-0.5">Tudo normal</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabClick(t.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === t.key
                    ? "border-blue-600 text-info"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Tab: Estoque ───────────────────────────────────────────────────── */}
        {activeTab === "estoque" && (
          local.estoqueItens.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum produto neste local</p>
              <p className="text-sm mt-1">O estoque é alimentado ao registrar movimentações de entrada.</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-semibold">Código</th>
                    <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                    {hasEnderecos && <th className="text-left px-4 py-3 font-semibold">Endereço</th>}
                    <th className="text-right px-4 py-3 font-semibold">Qtd. Atual</th>
                    {hasMin && <th className="text-right px-4 py-3 font-semibold">Mínimo</th>}
                    {hasMax && <th className="text-right px-4 py-3 font-semibold">Máximo</th>}
                    <th className="text-right px-4 py-3 font-semibold">Custo Total</th>
                    <th className="text-center px-4 py-3 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {local.estoqueItens.map((e) => {
                    const atual   = toNum(e.quantidadeAtual);
                    const min     = toNum(e.quantidadeMin);
                    const max     = e.quantidadeMax ? toNum(e.quantidadeMax) : null;
                    const abaixo  = min > 0 && atual < min;
                    const acima   = max !== null && atual > max;
                    const unidade = e.item.unidade?.sigla || e.item.unidadeMedida;
                    const itemCusto = toNum(e.item.precoCusto) * atual;
                    return (
                      <tr key={e.id} className={cn("hover:bg-muted transition-colors", abaixo && "bg-danger/10 hover:bg-danger/10", !e.item.ativo && "opacity-50")}>
                        <td className="px-4 py-3 align-middle">
                          <Link href={`/suprimentos/produtos/${e.item.id}`} className="font-mono text-xs font-semibold text-info hover:text-info hover:underline">
                            {e.item.codigo}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground align-middle">{e.item.descricao}</td>
                        {hasEnderecos && (
                          <td className="px-4 py-3 align-middle">
                            {e.localizacao
                              ? <span className="font-mono text-xs font-medium bg-muted border border-border text-foreground px-1.5 py-0.5 rounded">{e.localizacao}</span>
                              : <span className="text-muted-foreground/60">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right align-middle">
                          <div className="flex flex-col items-end gap-1">
                            <div>
                              <span className={cn("font-bold text-base tabular-nums", abaixo ? "text-danger" : "text-foreground")}>
                                {atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </span>
                              <span className="text-xs font-medium text-muted-foreground ml-1">{unidade}</span>
                            </div>
                            {e.item.itemUnidades.filter((iu) => !iu.isPrincipal && iu.fatorConversao).map((iu) => (
                              <span key={iu.id} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-100 px-1.5 py-0.5 rounded tabular-nums">
                                {(atual / Number(iu.fatorConversao)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                <span className="font-medium text-indigo-500">{iu.unidade.sigla}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        {hasMin && (
                          <td className="px-4 py-3 text-right align-middle">
                            <span className={cn("font-medium text-sm tabular-nums", min > 0 ? "text-foreground" : "text-muted-foreground/60")}>
                              {min > 0 ? min.toLocaleString("pt-BR") : "—"}
                            </span>
                          </td>
                        )}
                        {hasMax && (
                          <td className="px-4 py-3 text-right align-middle">
                            <span className={cn("font-medium text-sm tabular-nums", max !== null ? "text-foreground" : "text-muted-foreground/60")}>
                              {max !== null ? max.toLocaleString("pt-BR") : "—"}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-semibold text-violet-700 dark:text-violet-300 align-middle">
                          {atual !== 0 ? formatBRL(itemCusto) : <span className="text-muted-foreground/60 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          {abaixo ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger bg-danger/15 border border-danger/30 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" />Baixo
                            </span>
                          ) : acima ? (
                            <span className="text-xs font-semibold text-warning bg-warning/15 border border-warning/30 px-2 py-0.5 rounded-full">Acima máx.</span>
                          ) : (
                            <span className="text-xs font-semibold text-success bg-success/15 border border-success/30 px-2 py-0.5 rounded-full">Normal</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {local.estoqueItens.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted">
                      <td colSpan={2 + (hasEnderecos ? 1 : 0) + (hasMin ? 1 : 0) + (hasMax ? 1 : 0)} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-violet-700 dark:text-violet-300 text-base">
                        {custoTotal !== 0 ? formatBRL(custoTotal) : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )
        )}

        {/* ── Tab: Endereçamentos ────────────────────────────────────────────── */}
        {activeTab === "enderecos" && (
          <div className="space-y-4">
            {/* Header bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Endereços físicos de armazenagem dentro deste local (ex: A-01-01, B-02-03).
              </p>
              {!showAddEnd && (
                <Button size="sm" onClick={() => { setShowAddEnd(true); setAddForm({ codigo: "", descricao: "" }); setAddError(""); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  Novo Endereço
                </Button>
              )}
            </div>

            {/* Inline add form */}
            {showAddEnd && (
              <div className="rounded-xl border border-info/30 bg-info/10 p-4 space-y-3">
                <p className="text-sm font-medium text-info">Novo Endereço</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Código *</Label>
                    <Input
                      value={addForm.codigo}
                      onChange={(e) => setAddForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                      placeholder="Ex: A-01-01"
                      className="h-8 text-sm font-mono"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") addEndereco(); if (e.key === "Escape") setShowAddEnd(false); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={addForm.descricao}
                      onChange={(e) => setAddForm((p) => ({ ...p, descricao: e.target.value }))}
                      placeholder="Opcional"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {addError && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-2 py-1">{addError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={addEndereco} disabled={addSaving || !addForm.codigo.trim()}>
                    {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                    Adicionar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddEnd(false)} disabled={addSaving}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* List */}
            {endLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : enderecos.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground border border-dashed border-border rounded-xl">
                <Hash className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">Nenhum endereço cadastrado</p>
                <p className="text-xs mt-1">Clique em &quot;Novo Endereço&quot; para começar.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b-2 border-border">
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-semibold">Código</th>
                      <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                      <th className="text-center px-4 py-3 font-semibold">Status</th>
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {enderecos.map((end) => (
                      <tr key={end.id} className={cn("hover:bg-muted transition-colors", !end.ativo && "opacity-50")}>
                        {editEndId === end.id ? (
                          /* ── Inline edit row ── */
                          <>
                            <td className="px-4 py-2">
                              <Input
                                value={editEndForm.codigo}
                                onChange={(e) => setEditEndForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                                className="h-7 text-sm font-mono w-32"
                                autoFocus
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                value={editEndForm.descricao}
                                onChange={(e) => setEditEndForm((p) => ({ ...p, descricao: e.target.value }))}
                                placeholder="Descrição"
                                className="h-7 text-sm"
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editEndForm.ativo}
                                  onChange={(e) => setEditEndForm((p) => ({ ...p, ativo: e.target.checked }))}
                                  className="rounded"
                                />
                                <span className="text-xs text-muted-foreground">Ativo</span>
                              </label>
                            </td>
                            <td className="px-4 py-2">
                              {editEndError && <p className="text-xs text-danger mb-1">{editEndError}</p>}
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={saveEditEnd} disabled={editEndSaving || !editEndForm.codigo.trim()}>
                                  {editEndSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditEndId(null)} disabled={editEndSaving}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          /* ── Normal row ── */
                          <>
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm font-semibold text-foreground">{end.codigo}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-sm">
                              {end.descricao || <span className="text-muted-foreground/60">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {end.ativo
                                ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" />Ativo
                                  </span>
                                : <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    <Circle className="w-3 h-3" />Inativo
                                  </span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openEditEnd(end)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setDeleteEndId(end.id); setDeleteEndError(""); }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 bg-muted border-t border-border text-xs text-muted-foreground">
                  {enderecos.length} endereço{enderecos.length !== 1 ? "s" : ""} · {enderecos.filter(e => e.ativo).length} ativo{enderecos.filter(e => e.ativo).length !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete local confirm ──────────────────────────────────────────────── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir local?</p>
                <p className="text-sm text-muted-foreground mt-0.5">{local.nome}</p>
              </div>
            </div>
            {local.estoqueItens.length > 0 && (
              <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mb-3">
                Este local possui {local.estoqueItens.length} produto(s) vinculado(s).
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDelete(false)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete endereço confirm ───────────────────────────────────────────── */}
      {deleteEndId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir endereço?</p>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                  {enderecos.find(e => e.id === deleteEndId)?.codigo}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteEndError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{deleteEndError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteEndId(null)} disabled={deleteEndLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDeleteEnd} disabled={deleteEndLoading}>
                {deleteEndLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
