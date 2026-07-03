"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Loader2, Pencil, Save, X, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { Autoria } from "@/components/shared/Autoria";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";

type FornecedorOpt = { id: string; razaoSocial: string; nomeFantasia: string | null };

type InvItem = {
  id: string;
  itemId: string;
  localizacao:   string | null;
  saldoSistema:  unknown;
  saldoFisico:   unknown | null;
  diferenca:     unknown | null;
  custoUnitario: unknown | null;
  fornecedorId:  string | null;
  fornecedor:    FornecedorOpt | null;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string; precoCusto: unknown; unidade: { sigla: string } | null } | null;
};

type Inv = {
  id: string;
  numero: string;
  tipo: string;
  status: string;
  data: string;
  observacoes: string | null;
  localEstoque: { id: string; nome: string } | null;
  colaborador:  { id: string; nome: string } | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  itens: InvItem[];
};

type ColaboradorOpt = { id: string; nome: string };

function toNum(v: unknown) { return v == null ? 0 : parseFloat(String(v)); }

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO:    "bg-muted text-muted-foreground",
  EM_ANDAMENTO: "bg-info/15 text-info",
  CONCLUIDO:   "bg-success/15 text-success",
  CANCELADO:   "bg-danger/15 text-danger",
};
const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho", EM_ANDAMENTO: "Em Andamento", CONCLUIDO: "Concluído", CANCELADO: "Cancelado",
};
const TIPO_LABEL: Record<string, string> = { TOTAL: "Total", PARCIAL: "Parcial", CICLICO: "Cíclico" };

export default function InventarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [inv, setInv]         = useState<Inv | null>(null);
  const [loading, setLoading] = useState(true);

  // edit state
  const [editMode, setEditMode] = useState(false);
  const [editColaborador, setEditColaborador] = useState("");
  const [editData,        setEditData]        = useState("");
  const [editObs,         setEditObs]         = useState("");
  const [editRows,        setEditRows]        = useState<InvItem[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [fornecedores,  setFornecedores]  = useState<FornecedorOpt[]>([]);
  const [showDelete, setShowDelete]       = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/suprimentos/inventarios-materiais/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const { data } = await res.json();
    setInv(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editMode) return;
    Promise.all([
      fetch("/api/empresa/colaboradores?ativo=true").then(r => r.json()),
      fetch("/api/suprimentos/fornecedores?ativo=true").then(r => r.json()),
    ]).then(([cData, fData]) => {
      setColaboradores(Array.isArray(cData.data) ? cData.data : []);
      const fArr = Array.isArray(fData) ? fData : Array.isArray(fData.data) ? fData.data : [];
      setFornecedores(fArr);
    });
  }, [editMode]);

  function enterEdit() {
    if (!inv) return;
    setEditColaborador(inv.colaborador?.id ?? "");
    setEditData(inv.data.split("T")[0]);
    setEditObs(inv.observacoes ?? "");
    setEditRows(inv.itens.map(r => ({ ...r })));
    setEditMode(true);
  }

  async function saveEdit() {
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/suprimentos/inventarios-materiais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        colaboradorId: editColaborador || null,
        data:          editData || null,
        observacoes:   editObs  || null,
        itens: editRows.map(r => ({
          itemId:        r.itemId,
          localizacao:   r.localizacao || null,
          saldoSistema:  toNum(r.saldoSistema),
          saldoFisico:   r.saldoFisico   != null ? toNum(r.saldoFisico)   : null,
          diferenca:     r.diferenca     != null ? toNum(r.diferenca)     : null,
          custoUnitario: r.custoUnitario != null && r.custoUnitario !== "" ? toNum(r.custoUnitario) : null,
          fornecedorId:  r.fornecedorId  || null,
        })),
      }),
    });
    if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
    await load(); setEditMode(false); setSaving(false);
  }

  async function updateStatus(status: string) {
    const body: Record<string, unknown> = { status };
    // When concluding, pass current items so precoCusto can be updated
    if (status === "CONCLUIDO") {
      body.itens = inv!.itens.map(r => ({
        itemId:        r.itemId,
        localizacao:   r.localizacao || null,
        saldoSistema:  toNum(r.saldoSistema),
        saldoFisico:   r.saldoFisico   != null ? toNum(r.saldoFisico)   : null,
        diferenca:     r.diferenca     != null ? toNum(r.diferenca)     : null,
        custoUnitario: r.custoUnitario != null ? toNum(r.custoUnitario) : null,
        fornecedorId:  r.fornecedorId  || null,
      }));
    }
    await fetch(`/api/suprimentos/inventarios-materiais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function handleDelete() {
    setDeleteLoading(true);
    await fetch(`/api/suprimentos/inventarios-materiais/${id}`, { method: "DELETE" });
    router.push("/suprimentos/inventarios-materiais");
  }

  function updateEditRow(idx: number, field: keyof InvItem, value: string) {
    setEditRows(p => p.map((r, i) => {
      if (i !== idx) return r;
      if (field === "saldoFisico") {
        const sf = value === "" ? null : value;
        const ss = toNum(r.saldoSistema);
        const sfNum = value === "" ? null : parseFloat(value);
        const dif = sfNum != null ? sfNum - ss : null;
        return { ...r, saldoFisico: sf, diferenca: dif };
      }
      return { ...r, [field]: value };
    }));
  }

  useTabTitle(inv ? `INV ${inv.numero}` : null);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!inv) return <div className="px-8 pt-8 text-red-500">Inventário não encontrado</div>;

  const canEdit = inv.status === "RASCUNHO" || inv.status === "EM_ANDAMENTO";

  return (
    <div>
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-muted-foreground">
        <Link href="/suprimentos/inventarios-materiais" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Inventário de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-foreground font-medium">{inv.numero}</span>
      </div>

      <div className="px-8 py-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{inv.numero}</h1>
            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", STATUS_COLOR[inv.status] ?? "bg-muted text-muted-foreground")}>
              {STATUS_LABEL[inv.status] ?? inv.status}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
              {TIPO_LABEL[inv.tipo] ?? inv.tipo}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{inv.localEstoque?.nome} · {new Date(inv.data).toLocaleDateString("pt-BR")}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {inv.status === "RASCUNHO" && (
            <Button size="sm" onClick={() => updateStatus("EM_ANDAMENTO")}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Iniciar
            </Button>
          )}
          {inv.status === "EM_ANDAMENTO" && (
            <Button size="sm" onClick={() => updateStatus("CONCLUIDO")}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Concluir
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
          {inv.status === "RASCUNHO" && !editMode && (
            <Button size="sm" variant="outline" className="text-danger hover:bg-danger/10 border-danger/30" onClick={() => setShowDelete(true)}>
              <Trash2 className="w-4 h-4 mr-1" />Excluir
            </Button>
          )}
          {inv.status === "EM_ANDAMENTO" && !editMode && (
            <Button size="sm" variant="outline" className="text-danger hover:bg-danger/10 border-danger/30" onClick={() => updateStatus("CANCELADO")}>
              <XCircle className="w-4 h-4 mr-1" />Cancelar
            </Button>
          )}
        </div>
      </div>

      {saveError && <p className="px-8 pb-2 text-sm text-danger">{saveError}</p>}

      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {/* Info */}
        <div className="rounded-xl border border-border p-5">
          {editMode ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Funcionário</Label>
                <ComboboxWithCreate value={editColaborador} onChange={(v) => setEditColaborador(v)}
                  noneLabel="—" triggerClassName="h-8 rounded-md"
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Data</Label>
                <DatePicker value={editData} onChange={(v) => setEditData(v)} triggerClassName="h-8" />
              </div>
              <div className="col-span-full">
                <Label className="text-xs mb-1 block">Observações</Label>
                <textarea value={editObs} onChange={(e) => setEditObs(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-none" />
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-xs text-muted-foreground font-medium">Almoxarifado</dt><dd className="text-foreground mt-0.5">{inv.localEstoque?.nome ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground font-medium">Funcionário</dt><dd className="text-foreground mt-0.5">{inv.colaborador?.nome ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground font-medium">Data</dt><dd className="text-foreground mt-0.5">{new Date(inv.data).toLocaleDateString("pt-BR")}</dd></div>
              <div><dt className="text-xs text-muted-foreground font-medium">Tipo</dt><dd className="text-foreground mt-0.5">{TIPO_LABEL[inv.tipo] ?? inv.tipo}</dd></div>
              {inv.observacoes && <div className="col-span-full"><dt className="text-xs text-muted-foreground font-medium">Observações</dt><dd className="text-foreground mt-0.5">{inv.observacoes}</dd></div>}
            </dl>
          )}
          <Autoria criadoPor={inv.criadoPor} atualizadoPor={inv.atualizadoPor} className="mt-3" />
        </div>

        {/* Amostragem */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-muted border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Amostragem do Inventário</h3>
          </div>
          {(editMode ? editRows : inv.itens).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum material na amostragem</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Material</th>
                    <th className="text-left px-4 py-2.5 font-medium">Unidade</th>
                    <th className="text-left px-4 py-2.5 font-medium">Fornecedor</th>
                    <th className="text-right px-4 py-2.5 font-medium">Custo Unit.</th>
                    <th className="text-left px-4 py-2.5 font-medium">Localização</th>
                    <th className="text-right px-4 py-2.5 font-medium">Saldo</th>
                    <th className="text-right px-4 py-2.5 font-medium">Saldo Físico</th>
                    <th className="text-right px-4 py-2.5 font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(editMode ? editRows : inv.itens).map((it, idx) => {
                    const sf    = toNum(it.saldoFisico);
                    const ss    = toNum(it.saldoSistema);
                    const diff  = it.saldoFisico != null ? sf - ss : null;
                    const diffCls = diff == null ? "" : diff < 0 ? "text-danger font-semibold" : diff > 0 ? "text-warning font-semibold" : "text-success";
                    const fornNome = it.fornecedor ? (it.fornecedor.nomeFantasia ?? it.fornecedor.razaoSocial) : "—";

                    return (
                      <tr key={it.id || idx} className="hover:bg-muted">
                        <td className="px-4 py-2.5">
                          <div className="text-foreground">{it.item?.descricao ?? "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{it.item?.codigo}</div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {it.item?.unidade?.sigla ?? it.item?.unidadeMedida ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-foreground text-xs min-w-[160px]">
                          {editMode ? (
                            <ComboboxWithCreate
                              value={it.fornecedorId ?? ""}
                              onChange={(v) => updateEditRow(idx, "fornecedorId", v)}
                              noneLabel="— Fornecedor —"
                              triggerClassName="h-7 rounded-md text-xs"
                              options={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia ?? f.razaoSocial }))}
                            />
                          ) : fornNome}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground text-xs">
                          {editMode ? (
                            <Input
                              type="number" step="0.01"
                              value={it.custoUnitario == null ? "" : String(it.custoUnitario)}
                              onChange={(e) => updateEditRow(idx, "custoUnitario", e.target.value)}
                              className="h-7 text-xs w-28 ml-auto"
                              placeholder="0,00"
                            />
                          ) : (
                            it.custoUnitario != null
                              ? toNum(it.custoUnitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                              : <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {editMode ? (
                            <Input value={String(it.localizacao ?? "")} onChange={(e) => updateEditRow(idx, "localizacao", e.target.value)} className="h-7 text-xs w-24" />
                          ) : (it.localizacao ?? "—")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{toNum(it.saldoSistema).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {editMode ? (
                            <Input
                              type="number" step="0.001"
                              value={it.saldoFisico == null ? "" : String(it.saldoFisico)}
                              onChange={(e) => updateEditRow(idx, "saldoFisico", e.target.value)}
                              className="h-7 text-xs w-24 ml-auto"
                              placeholder="—"
                            />
                          ) : (
                            it.saldoFisico != null ? toNum(it.saldoFisico).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className={cn("px-4 py-2.5 text-right font-mono", diffCls)}>
                          {diff != null ? (diff > 0 ? "+" : "") + diff.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : <span className="text-muted-foreground/60">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Excluir inventário?</h3>
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
    </div>
  );
}
