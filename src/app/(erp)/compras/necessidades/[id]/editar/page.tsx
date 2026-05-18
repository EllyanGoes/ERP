"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, Loader2, Save } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn, decimalToNumber } from "@/lib/utils";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";

type Filial        = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LocalEstoque  = { id: string; nome: string };
type CentroCusto   = { id: string; codigo: string; nome: string };
type ItemOption    = { id: string; codigo: string; descricao: string; unidade: { sigla: string } | null; estoqueItems?: Array<{ quantidadeAtual: number | string | null }> };
type UnidadeOption = { id: string; sigla: string; nome: string; isPrincipal: boolean };
type ItemRow       = { itemId: string; quantidade: string; unidade: string; observacao: string };

const PRIORIDADES = [
  { value: 1, label: "1 - Muito Baixa" }, { value: 2, label: "2 - Baixa" },
  { value: 3, label: "3 - Média" },       { value: 4, label: "4 - Alta" },
  { value: 5, label: "5 - Crítica" },
];

function SelectField<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, disabled,
}: { options: T[]; value: string; onChange: (v: string) => void; placeholder: string; getLabel: (item: T) => string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((p) => !p)}
        className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-left transition-colors",
          disabled ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:border-gray-300", open && "border-blue-400 ring-1 ring-blue-200")}>
        <span className={selected ? "text-gray-900" : "text-gray-400"}>{selected ? getLabel(selected) : placeholder}</span>
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
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
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
      <div className="h-9 flex items-center px-3 text-sm border border-gray-100 rounded-md bg-gray-50 font-mono text-gray-500">
        {value || "—"}
      </div>
    );
  }

  if (options.length === 1) {
    return (
      <div className="h-9 flex items-center px-3 text-sm border border-gray-100 rounded-md bg-gray-50 font-mono text-gray-700">
        {value || options[0].sigla}
      </div>
    );
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((p) => !p)}
        className={cn("h-9 w-full flex items-center justify-between px-2 text-sm border border-gray-200 rounded-md bg-white font-mono transition-colors hover:border-gray-300", open && "border-blue-400 ring-1 ring-blue-200")}>
        <span className={value ? "text-gray-800" : "text-gray-400"}>{value || "Un."}</span>
        <ChevronDown className={cn("w-3 h-3 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && typeof window !== "undefined" && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {pos && (
            <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.max(pos.width, 140), maxHeight: 180 }}>
              {options.map((u) => (
                <button key={u.id} type="button" onClick={() => { onChange(u.sigla); setOpen(false); }}
                  className={cn("w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors font-mono", value === u.sigla && "bg-blue-50 text-blue-700 font-medium")}>
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

type FormSnapshot = {
  filialId: string;
  descricao: string;
  prioridade: number;
  entregaDesejada: string;
  solicitante: string;
  tipoCompra: string;
  motivo: string;
  localEstoqueId: string;
  centroCustoId: string;
  categoria: string;
  projeto: string;
  classificacaoAuxiliar: string;
  observacoes: string;
  itens: ItemRow[];
};

export default function EditarSolicitacaoPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<FormSnapshot>(`sc:edit:${id}`);
  const formRestoredRef = useRef(false);
  const baselineRef = useRef<string | null>(null);

  const [ready,   setReady]   = useState(false);
  const [numero,  setNumero]  = useState("");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

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
  const [itens,                 setItens]                 = useState<ItemRow[]>([]);

  const [filiais,      setFiliais]      = useState<Filial[]>([]);
  const [locaisEstoque,setLocaisEstoque]= useState<LocalEstoque[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);
  const [itemOptions,  setItemOptions]  = useState<ItemOption[]>([]);
  const [itemUnidades, setItemUnidades] = useState<Map<string, UnidadeOption[]>>(new Map());

  // Load record
  useEffect(() => {
    fetch(`/api/suprimentos/necessidades/${id}`).then((r) => r.json()).then(({ data }) => {
      if (!data) { setError("Não encontrado"); setLoading(false); return; }
      if (data.status !== "RASCUNHO") { setError("Apenas rascunhos podem ser editados"); setLoading(false); return; }
      setNumero(data.numero);
      const cached = loadForm();
      if (cached && !formRestoredRef.current) {
        formRestoredRef.current = true;
        setFilialId(cached.filialId ?? data.filialId ?? "");
        setDescricao(cached.descricao ?? data.justificativa ?? "");
        setPrioridade(cached.prioridade ?? data.prioridade ?? 3);
        setEntregaDesejada(cached.entregaDesejada ?? (data.dataNecessidade ? data.dataNecessidade.slice(0, 10) : ""));
        setSolicitante(cached.solicitante ?? data.solicitante ?? "");
        setTipoCompra(cached.tipoCompra ?? data.tipoCompra ?? "");
        setMotivo(cached.motivo ?? data.motivo ?? "");
        setLocalEstoqueId(cached.localEstoqueId ?? data.localEstoqueId ?? "");
        setCentroCustoId(cached.centroCustoId ?? data.centroCustoId ?? "");
        setCategoria(cached.categoria ?? data.categoria ?? "");
        setProjeto(cached.projeto ?? data.projeto ?? "");
        setClassificacaoAuxiliar(cached.classificacaoAuxiliar ?? data.classificacaoAuxiliar ?? "");
        setObservacoes(cached.observacoes ?? data.observacoes ?? "");
        setItens(cached.itens ?? data.itens.map((it: { itemId: string; quantidade: unknown; unidade?: string; observacao: string | null }) => ({
          itemId: it.itemId, quantidade: String(decimalToNumber(it.quantidade)),
          unidade: it.unidade ?? "", observacao: it.observacao ?? "",
        })));
      } else {
        setFilialId(data.filialId ?? "");
        setDescricao(data.justificativa ?? "");
        setPrioridade(data.prioridade ?? 3);
        setEntregaDesejada(data.dataNecessidade ? data.dataNecessidade.slice(0, 10) : "");
        setSolicitante(data.solicitante ?? "");
        setTipoCompra(data.tipoCompra ?? "");
        setMotivo(data.motivo ?? "");
        setLocalEstoqueId(data.localEstoqueId ?? "");
        setCentroCustoId(data.centroCustoId ?? "");
        setCategoria(data.categoria ?? "");
        setProjeto(data.projeto ?? "");
        setClassificacaoAuxiliar(data.classificacaoAuxiliar ?? "");
        setObservacoes(data.observacoes ?? "");
        setItens(data.itens.map((it: { itemId: string; quantidade: unknown; unidade?: string; observacao: string | null }) => ({
          itemId: it.itemId, quantidade: String(decimalToNumber(it.quantidade)),
          unidade: it.unidade ?? "", observacao: it.observacao ?? "",
        })));
      }
      // Capture baseline from fresh API data (ground truth)
      const baselineItens = data.itens.map((it: { itemId: string; quantidade: unknown; unidade?: string; observacao: string | null }) => ({
        itemId: it.itemId,
        quantidade: String(decimalToNumber(it.quantidade)),
        unidade: it.unidade ?? "",
        observacao: it.observacao ?? "",
      }));
      baselineRef.current = JSON.stringify({
        filialId: data.filialId ?? "",
        descricao: data.justificativa ?? "",
        prioridade: data.prioridade ?? 3,
        entregaDesejada: data.dataNecessidade ? data.dataNecessidade.slice(0, 10) : "",
        solicitante: data.solicitante ?? "",
        tipoCompra: data.tipoCompra ?? "",
        motivo: data.motivo ?? "",
        localEstoqueId: data.localEstoqueId ?? "",
        centroCustoId: data.centroCustoId ?? "",
        categoria: data.categoria ?? "",
        projeto: data.projeto ?? "",
        classificacaoAuxiliar: data.classificacaoAuxiliar ?? "",
        observacoes: data.observacoes ?? "",
        itens: baselineItens,
      });

      setReady(true);
      setLoading(false);
    });
  }, [id]); // eslint-disable-line

  // Load static options
  useEffect(() => {
    fetch("/api/empresa/filiais?ativo=true").then((r) => r.json()).then((j) => setFiliais(Array.isArray(j) ? j : []));
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json()).then((j) => setCentrosCusto(Array.isArray(j) ? j : []));
    fetch("/api/suprimentos/produtos").then((r) => r.json()).then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, []);

  // Auto-save form state to sessionStorage on every change
  useEffect(() => {
    if (!ready) return;
    saveForm({ filialId, descricao, prioridade, entregaDesejada, solicitante, tipoCompra, motivo, localEstoqueId, centroCustoId, categoria, projeto, classificacaoAuxiliar, observacoes, itens });
  }, [filialId, descricao, prioridade, entregaDesejada, solicitante, tipoCompra, motivo, localEstoqueId, centroCustoId, categoria, projeto, classificacaoAuxiliar, observacoes, itens, ready, saveForm]);

  const loadLocais = useCallback(async (fId: string) => {
    if (!fId) { setLocaisEstoque([]); return; }
    const res  = await fetch(`/api/suprimentos/locais-estoque?ativo=true&filialId=${fId}`);
    const json = await res.json();
    setLocaisEstoque(Array.isArray(json) ? json : []);
  }, []);

  useEffect(() => { if (ready) loadLocais(filialId); }, [filialId, ready]); // eslint-disable-line
  useEffect(() => { if (ready && filialId) loadLocais(filialId); }, [ready]); // eslint-disable-line

  // Pre-load units for existing items
  useEffect(() => {
    if (!ready) return;
    itens.forEach((row) => { if (row.itemId) fetchItemUnidades(row.itemId); });
  }, [ready]); // eslint-disable-line

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
    const principal = units.find((u) => u.isPrincipal) ?? units[0];
    if (principal) updateRow(i, "unidade", principal.sigla);
    else { const item = itemOptions.find((o) => o.id === itemId); updateRow(i, "unidade", item?.unidade?.sigla ?? ""); }
  }

  const currentJson = JSON.stringify({ filialId, descricao, prioridade, entregaDesejada, solicitante, tipoCompra, motivo, localEstoqueId, centroCustoId, categoria, projeto, classificacaoAuxiliar, observacoes, itens });
  const isDirty = baselineRef.current !== null && currentJson !== baselineRef.current;

  async function handleSaveOnly() {
    if (!filialId) throw new Error("Filial required");
    if (!localEstoqueId) throw new Error("Local required");
    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) throw new Error("No items");
    if (!descricao.trim()) throw new Error("Descricao required");
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filialId, justificativa: descricao.trim(), prioridade,
          dataNecessidade: entregaDesejada || null, solicitante: solicitante.trim() || null,
          tipoCompra: tipoCompra.trim() || null, motivo: motivo.trim() || null,
          localEstoqueId: localEstoqueId || null, centroCustoId: centroCustoId || null,
          categoria: categoria.trim() || null, projeto: projeto.trim() || null,
          classificacaoAuxiliar: classificacaoAuxiliar.trim() || null, observacoes: observacoes.trim() || null,
          itens: validItens.map((r) => ({
            itemId: r.itemId, quantidade: parseFloat(r.quantidade),
            unidade: r.unidade || null, observacao: r.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar"); throw new Error(json.error); }
      clearForm();
      baselineRef.current = null;
    } finally {
      setSaving(false);
    }
  }

  useDirtyForm(isDirty, handleSaveOnly);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filialId) { setError("Filial é obrigatória"); return; }
    if (!localEstoqueId) { setError("Local de Estoque é obrigatório"); return; }
    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) { setError("Adicione pelo menos um item com quantidade válida"); return; }
    if (!descricao.trim()) { setError("Descrição é obrigatória"); return; }
    try {
      await handleSaveOnly();
      router.push(`/compras/necessidades/${id}`);
    } catch { /* error already set in handleSaveOnly */ }
  }

  if (loading) return <div className="px-8 pt-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Carregando...</div>;
  if (!ready)  return <div className="px-8 pt-8 text-red-500">{error}</div>;

  return (
    <div>
      <PageHeader
        title={`Editar Solicitação ${numero}`}
        breadcrumbs={[
          { label: "Compras" },
          { label: "Solicitações de Compras", href: "/compras/necessidades" },
          { label: numero, href: `/compras/necessidades/${id}` },
          { label: "Editar" },
        ]}
      />

      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5 max-w-5xl">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label>Filial <span className="text-red-500">*</span></Label>
              <SelectField options={filiais} value={filialId}
                onChange={(v) => { setFilialId(v); setLocalEstoqueId(""); }}
                placeholder="Selecionar filial..." getLabel={(f) => f.nomeFantasia || f.razaoSocial} />
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
                <Label>Local de Estoque <span className="text-red-500">*</span></Label>
                <SelectField options={locaisEstoque} value={localEstoqueId} onChange={setLocalEstoqueId}
                  placeholder={filialId ? (locaisEstoque.length === 0 ? "Nenhum local para esta filial" : "Selecionar local...") : "Selecione a filial primeiro"}
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
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais..." rows={3} />
            </div>
          </CardContent>
        </Card>

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
                      options={itemOptions.map((opt) => {
                        const saldo = (opt.estoqueItems ?? []).reduce(
                          (sum, ei) => sum + parseFloat(String(ei.quantidadeAtual ?? 0)), 0
                        );
                        return { value: opt.id, label: `[${opt.codigo}] ${opt.descricao}`, code: opt.codigo, saldo };
                      })}
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
                    <UnitSelect value={row.unidade} options={units} onChange={(v) => updateRow(i, "unidade", v)} disabled={!row.itemId} />
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
          <Button type="button" variant="outline" onClick={() => router.push(`/compras/necessidades/${id}`)}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-1" />Salvar Alterações</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
