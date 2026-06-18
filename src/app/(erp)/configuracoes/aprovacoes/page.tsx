"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  X,
  Save,
  CheckCircle2,
  XCircle,
  Settings2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Usuario = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
};

type ColaboradorMin = {
  id: string;
  nome: string;
  telefone: string | null;
};

type Etapa = {
  id: string;
  ordem: number;
  nome: string | null;
  valorMin: number | null;
  valorMax: number | null;
  aprovadorId:   string | null;
  aprovador:     Usuario | null;
  colaboradorId: string | null;
  colaborador:   ColaboradorMin | null;
};

type Fluxo = {
  id: string;
  nome: string;
  processo: string;
  ativo: boolean;
  createdAt: string;
  etapas: Etapa[];
};

const PROCESSO_LABELS: Record<string, string> = {
  SOLICITACAO_COMPRAS: "Solicitação de Compras",
  PEDIDO_COMPRAS:      "Pedido de Compras (cotação)",
  PEDIDO_VENDA:        "Pedido de Venda",
  CONTRATO:            "Contrato",
  DESPESA:             "Despesa",
  GERAL:               "Geral",
};

type EtapaRow = {
  ordem:         number;
  nome:          string;
  valorMin:      string;
  valorMax:      string;
  aprovadorId:   string;
  colaboradorId: string;
  // which one is selected: "usuario" | "colaborador"
  tipoAprovador: "usuario" | "colaborador";
};

// ── helpers ───────────────────────────────────────────────────────────────────

function emptyRow(ordem: number): EtapaRow {
  return { ordem, nome: "", valorMin: "", valorMax: "", aprovadorId: "", colaboradorId: "", tipoAprovador: "colaborador" };
}

function fmtValor(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AprovacoesPage() {
  const [fluxos,        setFluxos]        = useState<Fluxo[]>([]);
  const [usuarios,      setUsuarios]      = useState<Usuario[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorMin[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [pageError,     setPageError]     = useState("");

  // ── Sheet state ───────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [formNome, setFormNome]   = useState("");
  const [formProcesso, setFormProcesso] = useState("SOLICITACAO_COMPRAS");
  const [formAtivo, setFormAtivo] = useState(true);
  const [formEtapas, setFormEtapas] = useState<EtapaRow[]>([emptyRow(1)]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving]       = useState(false);

  // ── Delete state ──────────────────────────────────────────────────────────
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, uRes, cRes] = await Promise.all([
        fetch("/api/configuracoes/aprovacoes"),
        fetch("/api/configuracoes/usuarios"),
        fetch("/api/empresa/colaboradores?ativo=true"),
      ]);
      const fJson = await fRes.json();
      const uJson = await uRes.json();
      const cJson = await cRes.json();
      setFluxos(fJson.data ?? []);
      setUsuarios(uJson.data ?? []);
      setColaboradores(Array.isArray(cJson) ? cJson : []);
    } catch {
      setPageError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sheet helpers ─────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null);
    setFormNome("");
    setFormProcesso("SOLICITACAO_COMPRAS");
    setFormAtivo(true);
    setFormEtapas([emptyRow(1)]);
    setFormError("");
    setSheetOpen(true);
  }

  function openEdit(fluxo: Fluxo) {
    setEditId(fluxo.id);
    setFormNome(fluxo.nome);
    setFormProcesso(fluxo.processo ?? "SOLICITACAO_COMPRAS");
    setFormAtivo(fluxo.ativo);
    setFormEtapas(
      fluxo.etapas.map((e) => ({
        ordem:         e.ordem,
        nome:          e.nome ?? "",
        valorMin:      e.valorMin != null ? String(e.valorMin) : "",
        valorMax:      e.valorMax != null ? String(e.valorMax) : "",
        aprovadorId:   e.aprovadorId   ?? "",
        colaboradorId: e.colaboradorId ?? "",
        tipoAprovador: e.colaboradorId ? "colaborador" : "usuario",
      }))
    );
    setFormError("");
    setSheetOpen(true);
  }

  function closeSheet() { setSheetOpen(false); setEditId(null); }

  function addEtapaRow() {
    setFormEtapas((prev) => [...prev, emptyRow(prev.length + 1)]);
  }

  function removeEtapaRow(i: number) {
    setFormEtapas((prev) =>
      prev.filter((_, idx) => idx !== i).map((e, idx) => ({ ...e, ordem: idx + 1 }))
    );
  }

  function updateEtapaRow(i: number, key: keyof EtapaRow, value: string | number) {
    setFormEtapas((prev) =>
      prev.map((row, idx) => idx === i ? { ...row, [key]: value } : row)
    );
  }

  async function handleSave() {
    if (!formNome.trim()) { setFormError("Nome do fluxo é obrigatório"); return; }
    const validEtapas = formEtapas.filter((e) =>
      (e.tipoAprovador === "colaborador" && e.colaboradorId) ||
      (e.tipoAprovador === "usuario"     && e.aprovadorId)
    );
    if (validEtapas.length === 0) { setFormError("Adicione pelo menos uma etapa com aprovador"); return; }

    setSaving(true); setFormError("");
    try {
      const payload = {
        nome: formNome.trim(),
        processo: formProcesso,
        ativo: formAtivo,
        etapas: validEtapas.map((e) => ({
          ordem:         e.ordem,
          nome:          e.nome.trim() || null,
          valorMin:      e.valorMin ? parseFloat(e.valorMin) : null,
          valorMax:      e.valorMax ? parseFloat(e.valorMax) : null,
          aprovadorId:   e.tipoAprovador === "usuario"      ? e.aprovadorId   || null : null,
          colaboradorId: e.tipoAprovador === "colaborador"  ? e.colaboradorId || null : null,
        })),
      };

      const url = editId
        ? `/api/configuracoes/aprovacoes/${editId}`
        : "/api/configuracoes/aprovacoes";
      const method = editId ? "PATCH" : "POST";

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error || "Erro ao salvar"); return; }

      closeSheet();
      await load();
    } catch {
      setFormError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      await fetch(`/api/configuracoes/aprovacoes/${id}`, { method: "DELETE" });
      setDeleteId(null);
      await load();
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Fluxos de Aprovação"
        breadcrumbs={[{ label: "Configurações" }, { label: "Aprovações" }]}
        action={
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" />
            Novo Fluxo
          </Button>
        }
      />

      <div className="px-8 pb-8">
        {pageError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm mb-5">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : fluxos.length === 0 ? (
          <div className="text-center py-20">
            <Settings2 className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum fluxo de aprovação cadastrado</p>
            <p className="text-muted-foreground text-sm mt-1">
              Crie um fluxo para habilitar a aprovação de SCs via WhatsApp.
            </p>
            <Button className="mt-4" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" /> Criar primeiro fluxo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {fluxos.map((fluxo) => (
              <Card key={fluxo.id} className={cn(!fluxo.ativo && "opacity-60")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="text-base">{fluxo.nome}</CardTitle>
                      <span className="inline-flex items-center text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-500/25 border border-slate-200 dark:border-slate-500/30 rounded-full px-2 py-0.5">
                        {PROCESSO_LABELS[fluxo.processo] ?? fluxo.processo}
                      </span>
                      {fluxo.ativo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 border border-success/30 rounded-full px-2 py-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5">
                          <XCircle className="w-3 h-3" /> Inativo
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(fluxo)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="border-danger/30 text-danger hover:bg-danger/10"
                        onClick={() => setDeleteId(fluxo.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {fluxo.etapas.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Sem etapas cadastradas</p>
                  ) : (
                    <div className="space-y-2">
                      {fluxo.etapas.map((etapa) => (
                        <div
                          key={etapa.id}
                          className="flex items-center gap-4 bg-muted rounded-lg px-4 py-3 text-sm"
                        >
                          <span className="font-mono text-xs font-bold text-info w-6 shrink-0 text-center">
                            {etapa.ordem}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {etapa.nome || `Etapa ${etapa.ordem}`}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {etapa.colaborador ? (
                                <>Colaborador: {etapa.colaborador.nome}{etapa.colaborador.telefone ? ` · ${etapa.colaborador.telefone}` : " · sem WhatsApp"}</>
                              ) : etapa.aprovador ? (
                                <>Aprovador: {etapa.aprovador.nome}{etapa.aprovador.telefone ? ` · ${etapa.aprovador.telefone}` : " · sem telefone"}</>
                              ) : "Sem aprovador"}
                            </p>
                          </div>
                          {(etapa.valorMin != null || etapa.valorMax != null) && (
                            <div className="text-xs text-muted-foreground shrink-0">
                              Alçada: {fmtValor(etapa.valorMin)} – {fmtValor(etapa.valorMax)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Side sheet ─────────────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={closeSheet} />

          {/* Panel */}
          <div className="w-full max-w-lg bg-card shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">
                {editId ? "Editar Fluxo" : "Novo Fluxo de Aprovação"}
              </h2>
              <button
                onClick={closeSheet}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              {/* Processo */}
              <div className="space-y-1.5">
                <Label>Processo <span className="text-red-500">*</span></Label>
                <select
                  value={formProcesso}
                  onChange={(e) => setFormProcesso(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="SOLICITACAO_COMPRAS">Solicitação de Compras</option>
                  <option value="PEDIDO_COMPRAS">Pedido de Compras (cotação)</option>
                  <option value="PEDIDO_VENDA">Pedido de Venda</option>
                  <option value="CONTRATO">Contrato</option>
                  <option value="DESPESA">Despesa</option>
                  <option value="GERAL">Geral</option>
                </select>
              </div>

              {/* Nome */}
              <div className="space-y-1.5">
                <Label>Nome do Fluxo <span className="text-red-500">*</span></Label>
                <Input
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Aprovação Padrão de Compras"
                  autoFocus
                />
              </div>

              {/* Ativo */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormAtivo((p) => !p)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    formAtivo ? "bg-blue-600" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform",
                      formAtivo ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </button>
                <span className="text-sm text-foreground">Fluxo ativo</span>
              </div>

              {/* Etapas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label>Etapas de Aprovação</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addEtapaRow}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar etapa
                  </Button>
                </div>

                <div className="space-y-3">
                  {formEtapas.map((row, i) => (
                    <div key={i} className="bg-muted rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-info">Etapa {i + 1}</span>
                        {formEtapas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEtapaRow(i)}
                            className="text-red-400 hover:text-danger transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Nome da etapa (opcional)</Label>
                        <Input
                          value={row.nome}
                          onChange={(e) => updateEtapaRow(i, "nome", e.target.value)}
                          placeholder="Ex: Gerência, Diretoria..."
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Aprovador <span className="text-red-500">*</span></Label>
                        <div className="flex gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => updateEtapaRow(i, "tipoAprovador", "colaborador")}
                            className={cn(
                              "flex-1 text-xs py-1 px-2 rounded-lg border transition-colors",
                              row.tipoAprovador === "colaborador"
                                ? "border-blue-500 bg-info/10 text-info font-medium"
                                : "border-border text-muted-foreground hover:border-border"
                            )}
                          >
                            Colaborador
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEtapaRow(i, "tipoAprovador", "usuario")}
                            className={cn(
                              "flex-1 text-xs py-1 px-2 rounded-lg border transition-colors",
                              row.tipoAprovador === "usuario"
                                ? "border-blue-500 bg-info/10 text-info font-medium"
                                : "border-border text-muted-foreground hover:border-border"
                            )}
                          >
                            Usuário
                          </button>
                        </div>
                        {row.tipoAprovador === "colaborador" ? (
                          <ComboboxWithCreate
                            value={row.colaboradorId}
                            onChange={(v) => updateEtapaRow(i, "colaboradorId", v)}
                            placeholder="Selecionar colaborador..."
                            noneLabel="Selecionar colaborador..."
                            triggerClassName="h-9 rounded-lg"
                            options={colaboradores.map((c) => ({ value: c.id, label: `${c.nome}${c.telefone ? ` · ${c.telefone}` : " · sem WhatsApp"}` }))}
                          />
                        ) : (
                          <ComboboxWithCreate
                            value={row.aprovadorId}
                            onChange={(v) => updateEtapaRow(i, "aprovadorId", v)}
                            placeholder="Selecionar usuário..."
                            noneLabel="Selecionar usuário..."
                            triggerClassName="h-9 rounded-lg"
                            options={usuarios.map((u) => ({ value: u.id, label: `${u.nome}${u.telefone ? ` · ${u.telefone}` : " · sem telefone"}` }))}
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Valor mín. (R$)</Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={row.valorMin}
                            onChange={(e) => updateEtapaRow(i, "valorMin", e.target.value)}
                            placeholder="Opcional"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Valor máx. (R$)</Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={row.valorMax}
                            onChange={(e) => updateEtapaRow(i, "valorMax", e.target.value)}
                            placeholder="Opcional"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-4 flex gap-3 justify-end bg-muted">
              <Button variant="outline" onClick={closeSheet} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-1" /> Salvar</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir fluxo?</p>
                <p className="text-sm text-muted-foreground mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline" size="sm"
                onClick={() => setDeleteId(null)}
                disabled={deleteLoading}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive" size="sm"
                onClick={() => handleDelete(deleteId)}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Excluindo...</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-1" /> Excluir</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
