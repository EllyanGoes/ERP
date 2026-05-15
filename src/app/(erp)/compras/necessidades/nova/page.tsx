"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, Loader2, Save } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial        = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LocalEstoque  = { id: string; nome: string };
type CentroCusto   = { id: string; codigo: string; nome: string };
type ItemOption    = { id: string; codigo: string; descricao: string; unidade: { sigla: string } | null };
type UnidadeOption = { id: string; sigla: string; nome: string; isPrincipal: boolean };

type ItemRow = { itemId: string; quantidade: string; unidade: string; observacao: string };

const PRIORIDADES = [
  { value: 1, label: "1 - Muito Baixa" },
  { value: 2, label: "2 - Baixa" },
  { value: 3, label: "3 - Média" },
  { value: 4, label: "4 - Alta" },
  { value: 5, label: "5 - Crítica" },
];

// ── SelectField ───────────────────────────────────────────────────────────────

function SelectField<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, disabled,
}: {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  getLabel: (item: T) => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-left transition-colors",
          disabled ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:border-gray-300",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto max-h-52">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 text-left">(Nenhum)</button>
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn("w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors", o.id === value && "bg-blue-50 text-blue-700 font-medium")}>
                {getLabel(o)}
              </button>
            ))}
            {options.length === 0 && <p className="px-3 py-2 text-sm text-gray-400 italic">Nenhuma opção disponível</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ── UnitSelect ────────────────────────────────────────────────────────────────

function UnitSelect({ value, options, onChange, disabled }: {
  value: string; options: UnidadeOption[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  function calcPos() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const maxH = 180;
    if (spaceBelow < maxH && spaceAbove > spaceBelow) {
      setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
    } else {
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }

  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => { window.removeEventListener("scroll", calcPos, true); window.removeEventListener("resize", calcPos); };
  }, [open]);

  if (disabled || options.length === 0) {
    return (
      <div className="h-9 flex items-center justify-center px-2 text-sm text-gray-400 border border-gray-100 rounded-md bg-gray-50 font-mono">
        {value || "—"}
      </div>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "h-9 w-full flex items-center justify-between px-2 text-sm border border-gray-200 rounded-md bg-white font-mono transition-colors hover:border-gray-300",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}
      >
        <span className={value ? "text-gray-800" : "text-gray-400"}>{value || "Un."}</span>
        <ChevronDown className={cn("w-3 h-3 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && typeof window !== "undefined" && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {pos && (
            <div
              className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.max(pos.width, 120), maxHeight: 180 }}
            >
              {options.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u.sigla); setOpen(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors font-mono",
                    value === u.sigla && "bg-blue-50 text-blue-700 font-medium"
                  )}
                >
                  <span className="font-bold">{u.sigla}</span>
                  {u.nome && <span className="text-gray-400 ml-1.5 text-xs font-sans">{u.nome}</span>}
                  {u.isPrincipal && <span className="ml-1.5 text-[10px] text-emerald-600">principal</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NovasolicitacaoPage() {
  const router   = useRouter();
  const { user } = useSession();

  const [filialId,              setFilialId]              = useState("");
  const [descricao,             setDescricao]             = useState("");
  const [prioridade,            setPrioridade]            = useState(3);
  const [entregaDesejada,       setEntregaDesejada]       = useState("");
  const [solicitante,           setSolicitante]           = useState("");
  const [tipoCompra,            setTipoCompra]            = useState("");
  const [motivo,                setMotivo]                = useState("");
  const [localEstoqueId,        setLocalEstoqueId]        = useState("");
  const [centroCustoId,         setCentroCustoId]         = useState("");
  const [categoria,             setCategoria]             = useState("");
  const [projeto,               setProjeto]               = useState("");
  const [classificacaoAuxiliar, setClassificacaoAuxiliar] = useState("");
  const [observacoes,           setObservacoes]           = useState("");

  const [itens,       setItens]       = useState<ItemRow[]>([{ itemId: "", quantidade: "1", unidade: "", observacao: "" }]);
  const [saving,      setSaving]      = useState(false);
  const [serverError, setServerError] = useState("");

  const [filiais,        setFiliais]        = useState<Filial[]>([]);
  const [locaisEstoque,  setLocaisEstoque]  = useState<LocalEstoque[]>([]);
  const [centrosCusto,   setCentrosCusto]   = useState<CentroCusto[]>([]);
  const [itemOptions,    setItemOptions]    = useState<ItemOption[]>([]);
  // Map itemId → list of units pre-registered for that product
  const [itemUnidades,   setItemUnidades]   = useState<Map<string, UnidadeOption[]>>(new Map());

  useEffect(() => { if (user?.nome) setSolicitante(user.nome); }, [user]);

  useEffect(() => {
    fetch("/api/empresa/filiais?ativo=true").then((r) => r.json()).then((j) => setFiliais(Array.isArray(j) ? j : []));
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json()).then((j) => setCentrosCusto(Array.isArray(j) ? j : []));
    fetch("/api/suprimentos/produtos").then((r) => r.json()).then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, []);

  const loadLocais = useCallback(async (fId: string) => {
    if (!fId) { setLocaisEstoque([]); setLocalEstoqueId(""); return; }
    const res  = await fetch(`/api/suprimentos/locais-estoque?ativo=true&filialId=${fId}`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : [];
    setLocaisEstoque(list);
    if (localEstoqueId && !list.find((l: LocalEstoque) => l.id === localEstoqueId)) setLocalEstoqueId("");
  }, [localEstoqueId]);

  useEffect(() => { loadLocais(filialId); }, [filialId]); // eslint-disable-line

  // Fetch units for a product (cached)
  async function fetchItemUnidades(itemId: string) {
    if (!itemId || itemUnidades.has(itemId)) return;
    const res  = await fetch(`/api/suprimentos/produtos/${itemId}/unidades`);
    const json = await res.json();
    const list: UnidadeOption[] = Array.isArray(json)
      ? json.map((u: { unidade: { id: string; sigla: string; nome: string }; isPrincipal: boolean }) => ({
          id: u.unidade.id, sigla: u.unidade.sigla, nome: u.unidade.nome, isPrincipal: u.isPrincipal,
        }))
      : [];
    setItemUnidades((prev) => new Map(prev).set(itemId, list));
    return list;
  }

  function addRow() { setItens((p) => [...p, { itemId: "", quantidade: "1", unidade: "", observacao: "" }]); }
  function removeRow(i: number) { setItens((p) => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, key: keyof ItemRow, value: string) {
    setItens((p) => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function handleItemChange(i: number, itemId: string) {
    updateRow(i, "itemId", itemId);
    if (!itemId) { updateRow(i, "unidade", ""); return; }
    let units = itemUnidades.get(itemId);
    if (!units) units = await fetchItemUnidades(itemId) ?? [];
    // Auto-select principal unit
    const principal = units.find((u) => u.isPrincipal) ?? units[0];
    if (principal) updateRow(i, "unidade", principal.sigla);
    else {
      // fallback to item's own unit
      const item = itemOptions.find((o) => o.id === itemId);
      updateRow(i, "unidade", item?.unidade?.sigla ?? "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filialId) { setServerError("Filial é obrigatória"); return; }
    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) { setServerError("Adicione pelo menos um item com quantidade válida"); return; }
    if (!descricao.trim()) { setServerError("Descrição é obrigatória"); return; }
    setSaving(true); setServerError("");
    try {
      const res = await fetch("/api/suprimentos/necessidades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filialId, justificativa: descricao.trim(), prioridade,
          dataNecessidade: entregaDesejada || null,
          solicitante: solicitante.trim() || null, tipoCompra: tipoCompra.trim() || null,
          motivo: motivo.trim() || null, localEstoqueId: localEstoqueId || null,
          centroCustoId: centroCustoId || null, categoria: categoria.trim() || null,
          projeto: projeto.trim() || null, classificacaoAuxiliar: classificacaoAuxiliar.trim() || null,
          observacoes: observacoes.trim() || null,
          itens: validItens.map((r) => ({
            itemId: r.itemId, quantidade: parseFloat(r.quantidade),
            unidade: r.unidade || null, observacao: r.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error || "Erro ao criar solicitação"); return; }
      router.push(`/compras/necessidades/${json.data.id}`);
    } catch { setServerError("Erro de conexão. Tente novamente."); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader
        title="Nova Solicitação de Compras"
        breadcrumbs={[{ label: "Compras" }, { label: "Solicitações de Compras", href: "/compras/necessidades" }, { label: "Nova" }]}
      />

      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5 max-w-5xl">
        {serverError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{serverError}</div>}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label>Filial <span className="text-red-500">*</span></Label>
              <SelectField options={filiais} value={filialId}
                onChange={(v) => { setFilialId(v); setLocalEstoqueId(""); }}
                placeholder="Selecionar filial..." getLabel={(f) => f.nomeFantasia || f.razaoSocial} />
              {!filialId && <p className="text-xs text-gray-400">Selecione a filial para habilitar o campo Local de Estoque</p>}
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-1.5">
                <Label>Descrição <span className="text-red-500">*</span></Label>
                <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva o que está sendo solicitado..." />
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Prioridade <span className="text-red-500">*</span></Label>
                <select value={prioridade} onChange={(e) => setPrioridade(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Entrega desejada</Label>
                <Input type="date" value={entregaDesejada} onChange={(e) => setEntregaDesejada(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Solicitante <span className="text-red-500">*</span></Label>
                <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nome do solicitante" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de compra</Label>
                <select value={tipoCompra} onChange={(e) => setTipoCompra(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">Selecione...</option>
                  <option value="SGA">SGA</option><option value="OPEX">OPEX</option>
                  <option value="CAPEX">CAPEX</option><option value="ESTOQUE">ESTOQUE</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da solicitação..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Local de Estoque</Label>
                <SelectField options={locaisEstoque} value={localEstoqueId} onChange={setLocalEstoqueId}
                  placeholder={filialId ? (locaisEstoque.length === 0 ? "Nenhum local para esta filial" : "Selecionar local de estoque...") : "Selecione a filial primeiro"}
                  getLabel={(l) => l.nome} disabled={!filialId} />
              </div>
              <div className="space-y-1.5">
                <Label>Centro de Custo</Label>
                <SelectField options={centrosCusto} value={centroCustoId} onChange={setCentroCustoId}
                  placeholder="Selecionar centro de custo..." getLabel={(c) => `${c.codigo} - ${c.nome}`} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Categoria</Label><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Material de escritório..." /></div>
              <div className="space-y-1.5"><Label>Projeto</Label><Input value={projeto} onChange={(e) => setProjeto(e.target.value)} placeholder="Nome do projeto..." /></div>
              <div className="space-y-1.5"><Label>Classificação auxiliar</Label><Input value={classificacaoAuxiliar} onChange={(e) => setClassificacaoAuxiliar(e.target.value)} placeholder="Classificação adicional..." /></div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais sobre a solicitação..." rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* ── Itens ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addRow}><Plus className="w-4 h-4 mr-1" />Adicionar Item</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((row, i) => {
              const units = itemUnidades.get(row.itemId) ?? [];
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-5 space-y-1.5">
                    {i === 0 && <Label>Produto</Label>}
                    <ComboboxWithCreate
                      options={itemOptions.map((opt) => ({ value: opt.id, label: `[${opt.codigo}] ${opt.descricao}` }))}
                      value={row.itemId}
                      onChange={(v) => handleItemChange(i, v)}
                      allowNone={false}
                      placeholder="Selecionar produto..."
                      createHref="/suprimentos/produtos/novo"
                      createParam="descricao"
                      createLabel="produto"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Quantidade</Label>}
                    <Input type="number" step="0.001" min="0.001" value={row.quantidade} onChange={(e) => updateRow(i, "quantidade", e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Unidade</Label>}
                    <UnitSelect
                      value={row.unidade}
                      options={units}
                      onChange={(v) => updateRow(i, "unidade", v)}
                      disabled={!row.itemId}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Observação</Label>}
                    <Input value={row.observacao} onChange={(e) => updateRow(i, "observacao", e.target.value)} placeholder="Opcional..." />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {itens.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeRow(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-1" />Criar Solicitação</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
