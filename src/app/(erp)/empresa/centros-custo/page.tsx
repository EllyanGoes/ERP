"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Save,
  Check,
  Search,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Factory,
  Download,
  Copy,
  FileText,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Autoria } from "@/components/shared/Autoria";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";

const COLLAPSE_KEY = "empresa:centros-custo:collapsed";
const SEM_GRUPO = "__sem_grupo__";

// ── Types ─────────────────────────────────────────────────────────────────────

type Grupo = {
  id: string;
  nome: string;
  ativo: boolean;
  _count: { centros: number };
};

type Centro = {
  id: string;
  codigo: string;
  nome: string;
  grupoCentroCustoId: string | null;
  grupoCentroCusto: { id: string; nome: string } | null;
  ativo: boolean;
  fabril: boolean;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
};

// ── SelectGrupo ───────────────────────────────────────────────────────────────

function SelectGrupo({
  grupos,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  grupos: Grupo[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = grupos.find((g) => g.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-border",
          "bg-card hover:border-border transition-colors text-left",
          disabled && "opacity-60 cursor-not-allowed",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.nome : placeholder ?? "Selecionar grupo..."}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted text-left"
            >
              (Nenhum)
            </button>
            {grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { onChange(g.id); setOpen(false); }}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left hover:bg-info/10 hover:text-info transition-colors",
                  g.id === value && "bg-info/10 text-info font-medium"
                )}
              >
                {g.nome}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CentrosCustoPage() {
  const [centros,  setCentros]  = useState<Centro[]>([]);
  const [grupos,   setGrupos]   = useState<Grupo[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Filters
  const [search,       setSearch]       = useState("");
  const [filtroGrupo,  setFiltroGrupo]  = useState("");
  const [filtroAtivo,  setFiltroAtivo]  = useState<"" | "true" | "false">("");

  // Árvore: grupos recolhidos (persistido no localStorage).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Create modal
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState({ codigo: "", nome: "", grupoCentroCustoId: "", fabril: false });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError,  setCreateError]  = useState("");

  // Edit modal
  const [editItem,   setEditItem]   = useState<Centro | null>(null);
  const [editForm,   setEditForm]   = useState({ codigo: "", nome: "", grupoCentroCustoId: "", ativo: true, fabril: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState("");

  // Delete modal
  const [deleteItem,    setDeleteItem]    = useState<Centro | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const loadGrupos = useCallback(async () => {
    const res = await fetch("/api/empresa/grupos-centro-custo");
    const json = await res.json();
    setGrupos(Array.isArray(json) ? json : []);
  }, []);

  const loadCentros = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)      params.set("search", search);
    if (filtroGrupo) params.set("grupoId", filtroGrupo);
    if (filtroAtivo) params.set("ativo", filtroAtivo);
    const res  = await fetch(`/api/empresa/centros-custo?${params}`);
    const json = await res.json();
    setCentros(Array.isArray(json) ? json : []);
    setLoading(false);
  }, [search, filtroGrupo, filtroAtivo]);

  useEffect(() => { loadGrupos(); }, [loadGrupos]);
  useEffect(() => { loadCentros(); }, [loadCentros]);

  // Carrega o estado recolhido persistido.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  const persistCollapsed = useCallback((next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  }, []);
  const toggleGrupo = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Agrupa os centros (já filtrados pela API) por grupo, na ordem dos grupos.
  // Centros sem grupo caem num bucket "Sem grupo" no fim.
  const arvore = useMemo(() => {
    const porGrupo = new Map<string, Centro[]>();
    for (const c of centros) {
      const k = c.grupoCentroCustoId ?? SEM_GRUPO;
      (porGrupo.get(k) ?? porGrupo.set(k, []).get(k)!).push(c);
    }
    const ordenar = (cs: Centro[]) => [...cs].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    const secoes = grupos
      .filter((g) => porGrupo.has(g.id))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((g) => ({ id: g.id, nome: g.nome, centros: ordenar(porGrupo.get(g.id)!) }));
    if (porGrupo.has(SEM_GRUPO)) secoes.push({ id: SEM_GRUPO, nome: "Sem grupo", centros: ordenar(porGrupo.get(SEM_GRUPO)!) });
    return secoes;
  }, [centros, grupos]);

  const recolherTudo = useCallback(() => persistCollapsed(new Set(arvore.map((s) => s.id))), [arvore, persistCollapsed]);
  const expandirTudo = useCallback(() => persistCollapsed(new Set()), [persistCollapsed]);

  // ── Create ──────────────────────────────────────────────────────────────────

  function openCreate() {
    setCreateForm({ codigo: "", nome: "", grupoCentroCustoId: "", fabril: false });
    setCreateError("");
    setShowCreate(true);
  }

  async function saveCreate() {
    if (!createForm.codigo.trim() || !createForm.nome.trim()) return;
    setCreateSaving(true); setCreateError("");
    const res = await fetch("/api/empresa/centros-custo", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo:             createForm.codigo.trim(),
        nome:               createForm.nome.trim(),
        grupoCentroCustoId: createForm.grupoCentroCustoId || null,
        fabril:             createForm.fabril,
      }),
    });
    if (!res.ok) {
      setCreateError((await res.json()).error || "Erro ao salvar");
      setCreateSaving(false); return;
    }
    setShowCreate(false);
    await loadCentros();
    setCreateSaving(false);
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  function openEdit(item: Centro, e: React.MouseEvent) {
    e.stopPropagation();
    setEditItem(item);
    setEditForm({
      codigo:             item.codigo,
      nome:               item.nome,
      grupoCentroCustoId: item.grupoCentroCustoId ?? "",
      ativo:              item.ativo,
      fabril:             item.fabril ?? false,
    });
    setEditError("");
  }

  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true); setEditError("");
    const res = await fetch(`/api/empresa/centros-custo/${editItem.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo:             editForm.codigo.trim(),
        nome:               editForm.nome.trim(),
        grupoCentroCustoId: editForm.grupoCentroCustoId || null,
        ativo:              editForm.ativo,
        fabril:             editForm.fabril,
      }),
    });
    if (!res.ok) {
      setEditError((await res.json()).error || "Erro ao salvar");
      setEditSaving(false); return;
    }
    setEditItem(null);
    await loadCentros();
    setEditSaving(false);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function openDelete(item: Centro, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteItem(item); setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/empresa/centros-custo/${deleteItem.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteError((await res.json()).error || "Não foi possível excluir");
      setDeleteLoading(false); return;
    }
    setDeleteItem(null);
    await loadCentros();
    setDeleteLoading(false);
  }

  const ativos   = centros.filter((c) => c.ativo).length;
  const inativos = centros.filter((c) => !c.ativo).length;

  // ── Exportação (texto p/ copiar e PDF) — mesmo padrão de Naturezas ─────────
  const [copiado, setCopiado] = useState(false);
  // A lista da tela vem FILTRADA do servidor — a exportação busca a lista
  // completa e agrupa igual à árvore (grupos ordenados + "Sem grupo" no fim).
  async function estruturaCompleta(): Promise<{ nome: string; centros: Centro[] }[]> {
    const res = await fetch("/api/empresa/centros-custo");
    const todos: Centro[] = (await res.json().catch(() => [])) as Centro[];
    if (!Array.isArray(todos)) return [];
    const porGrupo = new Map<string, Centro[]>();
    for (const c of todos) {
      const key = c.grupoCentroCustoId ?? SEM_GRUPO;
      porGrupo.set(key, [...(porGrupo.get(key) ?? []), c]);
    }
    const ordenar = (cs: Centro[]) => [...cs].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    const secoes = grupos
      .filter((g) => porGrupo.has(g.id))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((g) => ({ nome: g.nome, centros: ordenar(porGrupo.get(g.id)!) }));
    if (porGrupo.has(SEM_GRUPO)) secoes.push({ nome: "Sem grupo", centros: ordenar(porGrupo.get(SEM_GRUPO)!) });
    return secoes;
  }

  async function copiarEstrutura() {
    const linhas: string[] = ["CENTROS DE CUSTO", ""];
    for (const sec of await estruturaCompleta()) {
      linhas.push(sec.nome);
      for (const c of sec.centros) {
        const extras: string[] = [];
        if (c.fabril) extras.push("Fabril (CIF)");
        if (!c.ativo) extras.push("inativo");
        linhas.push(`  • ${c.codigo} — ${c.nome}${extras.length ? ` (${extras.join(" · ")})` : ""}`);
      }
    }
    try {
      await navigator.clipboard.writeText(linhas.join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* clipboard indisponível */ }
  }

  async function baixarPdf() {
    const head = ["Código", "Centro de custo", "Fabril (CIF)", "Status"];
    const linhasPdf: LinhaPdf[] = [];
    for (const sec of await estruturaCompleta()) {
      linhasPdf.push({ celulas: [sec.nome, "", "", ""], estilo: "secao" });
      for (const c of sec.centros) {
        linhasPdf.push({
          celulas: [c.codigo, c.nome, c.fabril ? "Sim" : "", c.ativo ? "Ativo" : "Inativo"],
          estilo: "normal",
        });
      }
    }
    await gerarPdfContabil({
      titulo: "Centros de Custo",
      head,
      linhas: linhasPdf,
      alinharDireitaDe: head.length, // nenhuma coluna numérica
      arquivo: `centros-de-custo-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Centros de Custo"
        breadcrumbs={[
          { label: "Empresa" },
          { label: "Financeiro" },
          { label: "Centros de Custo" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={loading || centros.length === 0} />}>
                {copiado ? <Check className="w-4 h-4 mr-1.5 text-success" /> : <Download className="w-4 h-4 mr-1.5" />}
                {copiado ? "Estrutura copiada" : "Baixar / Copiar"}
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copiarEstrutura}>
                  <Copy className="w-4 h-4 mr-2" /> Copiar estrutura
                </DropdownMenuItem>
                <DropdownMenuItem onClick={baixarPdf}>
                  <FileText className="w-4 h-4 mr-2" /> Baixar PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código ou nome..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Filtro grupo */}
          <div className="w-44">
            <SelectGrupo
              grupos={grupos}
              value={filtroGrupo}
              onChange={setFiltroGrupo}
              placeholder="Todos os grupos"
            />
          </div>

          {/* Filtro ativo */}
          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as "" | "true" | "false")}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 text-foreground"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>

          <div className="flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {centros.length} centro{centros.length === 1 ? "" : "s"} · {ativos} ativo{ativos === 1 ? "" : "s"}
            {inativos > 0 && ` · ${inativos} inativo${inativos === 1 ? "" : "s"}`}
          </span>
        </div>

        {/* Árvore: Grupo → Centro de custo */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : centros.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum centro de custo encontrado</p>
            <p className="text-sm mt-1">Clique em &quot;Adicionar&quot; para criar o primeiro.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={recolherTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">
                Recolher tudo
              </button>
              <button type="button" onClick={expandirTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">
                Expandir tudo
              </button>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {arvore.map((secao) => {
                const recolhido = collapsed.has(secao.id);
                return (
                  <div key={secao.id}>
                    {/* Faixa do grupo (seção) */}
                    <button
                      type="button"
                      onClick={() => toggleGrupo(secao.id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-muted/80 hover:bg-muted border-b border-border text-left"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                        {secao.nome}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-medium text-muted-foreground tabular-nums" title={`${secao.centros.length} centro(s) de custo`}>
                          {secao.centros.length}
                        </span>
                        {recolhido
                          ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </span>
                    </button>

                    {/* Linhas do grupo */}
                    {!recolhido && secao.centros.map((centro) => (
                      <div
                        key={centro.id}
                        className={cn(
                          "flex items-center gap-3 px-5 py-3 border-b border-border/60 last:border-b-0 hover:bg-muted/40 text-sm transition-colors",
                          !centro.ativo && "opacity-50",
                        )}
                      >
                        {centro.fabril ? (
                          <Factory
                            className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0"
                            aria-label="Centro fabril — consumo indireto (item fabril) vira CIF"
                          />
                        ) : (
                          <Briefcase
                            className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0"
                            aria-label="Centro não-fabril — consumo indireto vira Despesa"
                          />
                        )}
                        <span className="font-mono text-xs font-semibold text-muted-foreground shrink-0">{centro.codigo}</span>
                        <span className="truncate text-foreground">{centro.nome}</span>
                        {!centro.ativo && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground shrink-0">
                            Inativo
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => openEdit(centro, e)}
                            className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-info hover:bg-info/10 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => openDelete(centro, e)}
                            className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-info" />
                </div>
                <h3 className="font-semibold text-foreground">Adicionar centro de custo</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Código <span className="text-red-500">*</span></Label>
                <Input
                  value={createForm.codigo}
                  onChange={(e) => setCreateForm((p) => ({ ...p, codigo: e.target.value }))}
                  placeholder="Ex: 01.01"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  value={createForm.nome}
                  onChange={(e) => setCreateForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Administrativo Geral"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Grupo de C. Custo</Label>
                <div className="mt-1">
                  <SelectGrupo
                    grupos={grupos}
                    value={createForm.grupoCentroCustoId}
                    onChange={(v) => setCreateForm((p) => ({ ...p, grupoCentroCustoId: v }))}
                  />
                </div>
              </div>
              <div className="pt-1">
                <div className="flex items-center gap-2">
                  <input
                    id="fabril-create"
                    type="checkbox"
                    checked={createForm.fabril}
                    onChange={(e) => setCreateForm((p) => ({ ...p, fabril: e.target.checked }))}
                    className="rounded"
                  />
                  <Label htmlFor="fabril-create" className="cursor-pointer">Centro fabril</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Forno/extrusora/secador… — consumo indireto (item fabril) neste centro vira CIF; senão, Despesa.</p>
              </div>
            </div>

            {createError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                {createError}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} disabled={createSaving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveCreate}
                disabled={createSaving || !createForm.codigo.trim() || !createForm.nome.trim()}
              >
                {createSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                  : <><Save className="w-4 h-4 mr-1" />Adicionar</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Editar centro de custo</h3>
              <button onClick={() => setEditItem(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Código <span className="text-red-500">*</span></Label>
                <Input
                  value={editForm.codigo}
                  onChange={(e) => setEditForm((p) => ({ ...p, codigo: e.target.value }))}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Grupo de C. Custo</Label>
                <div className="mt-1">
                  <SelectGrupo
                    grupos={grupos}
                    value={editForm.grupoCentroCustoId}
                    onChange={(v) => setEditForm((p) => ({ ...p, grupoCentroCustoId: v }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="ativo-edit"
                  type="checkbox"
                  checked={editForm.ativo}
                  onChange={(e) => setEditForm((p) => ({ ...p, ativo: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="ativo-edit" className="cursor-pointer">Ativo</Label>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <input
                    id="fabril-edit"
                    type="checkbox"
                    checked={editForm.fabril}
                    onChange={(e) => setEditForm((p) => ({ ...p, fabril: e.target.checked }))}
                    className="rounded"
                  />
                  <Label htmlFor="fabril-edit" className="cursor-pointer">Centro fabril</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Forno/extrusora/secador… — consumo indireto (item fabril) neste centro vira CIF; senão, Despesa.</p>
              </div>
            </div>

            {editError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                {editError}
              </p>
            )}

            <Autoria criadoPor={editItem.criadoPor} atualizadoPor={editItem.atualizadoPor} />

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditItem(null)} disabled={editSaving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={editSaving || !editForm.codigo.trim() || !editForm.nome.trim()}
              >
                {editSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                  : <><Check className="w-4 h-4 mr-1" />Salvar</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ───────────────────────────────────────────────────────── */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir centro de custo?</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{deleteItem.codigo}</span>
                  {" "}{deleteItem.nome}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</>
                  : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
