"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, Loader2, Save } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn, decimalToNumber } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial       = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LocalEstoque = { id: string; nome: string };
type CentroCusto  = { id: string; codigo: string; nome: string };
type ItemOption   = { id: string; codigo: string; descricao: string; unidade: { sigla: string } | null };
type ItemRow      = { itemId: string; quantidade: string; observacao: string };

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
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 text-left"
            >(Nenhum)</button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn("w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors", o.id === value && "bg-blue-50 text-blue-700 font-medium")}
              >
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditarSolicitacaoPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { user } = useSession();

  const [ready,    setReady]    = useState(false);
  const [numero,   setNumero]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // Fields
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

  // Options
  const [filiais,       setFiliais]       = useState<Filial[]>([]);
  const [locaisEstoque, setLocaisEstoque] = useState<LocalEstoque[]>([]);
  const [centrosCusto,  setCentrosCusto]  = useState<CentroCusto[]>([]);
  const [itemOptions,   setItemOptions]   = useState<ItemOption[]>([]);

  // Load existing record
  useEffect(() => {
    fetch(`/api/suprimentos/necessidades/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) { setError("Não encontrado"); setLoading(false); return; }
        if (data.status !== "RASCUNHO") { setError("Apenas rascunhos podem ser editados"); setLoading(false); return; }
        setNumero(data.numero);
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
        setItens(data.itens.map((it: { itemId: string; quantidade: unknown; observacao: string | null }) => ({
          itemId:      it.itemId,
          quantidade:  String(decimalToNumber(it.quantidade)),
          observacao:  it.observacao ?? "",
        })));
        setReady(true);
        setLoading(false);
      });
  }, [id, user]);

  // Load static options
  useEffect(() => {
    fetch("/api/empresa/filiais?ativo=true").then((r) => r.json()).then((j) => setFiliais(Array.isArray(j) ? j : []));
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json()).then((j) => setCentrosCusto(Array.isArray(j) ? j : []));
    fetch("/api/suprimentos/produtos").then((r) => r.json()).then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, []);

  // Load locais on filial change
  const loadLocais = useCallback(async (fId: string) => {
    if (!fId) { setLocaisEstoque([]); return; }
    const res  = await fetch(`/api/suprimentos/locais-estoque?ativo=true&filialId=${fId}`);
    const json = await res.json();
    setLocaisEstoque(Array.isArray(json) ? json : []);
  }, []);

  useEffect(() => { if (ready) loadLocais(filialId); }, [filialId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also load locais on initial ready state (with the pre-filled filialId)
  useEffect(() => { if (ready && filialId) loadLocais(filialId); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() { setItens((p) => [...p, { itemId: "", quantidade: "1", observacao: "" }]); }
  function removeRow(i: number) { setItens((p) => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, key: keyof ItemRow, value: string) {
    setItens((p) => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filialId) { setError("Filial é obrigatória"); return; }
    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) { setError("Adicione pelo menos um item com quantidade válida"); return; }
    if (!descricao.trim()) { setError("Descrição é obrigatória"); return; }

    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filialId:             filialId,
          justificativa:        descricao.trim(),
          prioridade,
          dataNecessidade:      entregaDesejada      || null,
          solicitante:          solicitante.trim()   || null,
          tipoCompra:           tipoCompra.trim()    || null,
          motivo:               motivo.trim()        || null,
          localEstoqueId:       localEstoqueId       || null,
          centroCustoId:        centroCustoId        || null,
          categoria:            categoria.trim()     || null,
          projeto:              projeto.trim()       || null,
          classificacaoAuxiliar: classificacaoAuxiliar.trim() || null,
          observacoes:          observacoes.trim()   || null,
          itens: validItens.map((r) => ({
            itemId:     r.itemId,
            quantidade: parseFloat(r.quantidade),
            observacao: r.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar"); return; }
      router.push(`/compras/necessidades/${id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* ── Informações ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label>Filial <span className="text-red-500">*</span></Label>
              <SelectField
                options={filiais}
                value={filialId}
                onChange={(v) => { setFilialId(v); setLocalEstoqueId(""); }}
                placeholder="Selecionar filial..."
                getLabel={(f) => f.nomeFantasia || f.razaoSocial}
              />
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
                  <option value="SGA">SGA</option>
                  <option value="OPEX">OPEX</option>
                  <option value="CAPEX">CAPEX</option>
                  <option value="ESTOQUE">ESTOQUE</option>
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
                <SelectField
                  options={locaisEstoque}
                  value={localEstoqueId}
                  onChange={setLocalEstoqueId}
                  placeholder={filialId ? (locaisEstoque.length === 0 ? "Nenhum local para esta filial" : "Selecionar local...") : "Selecione a filial primeiro"}
                  getLabel={(l) => l.nome}
                  disabled={!filialId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Centro de Custo</Label>
                <SelectField
                  options={centrosCusto}
                  value={centroCustoId}
                  onChange={setCentroCustoId}
                  placeholder="Selecionar centro de custo..."
                  getLabel={(c) => `${c.codigo} - ${c.nome}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Material de escritório..." />
              </div>
              <div className="space-y-1.5">
                <Label>Projeto</Label>
                <Input value={projeto} onChange={(e) => setProjeto(e.target.value)} placeholder="Nome do projeto..." />
              </div>
              <div className="space-y-1.5">
                <Label>Classificação auxiliar</Label>
                <Input value={classificacaoAuxiliar} onChange={(e) => setClassificacaoAuxiliar(e.target.value)} placeholder="Classificação adicional..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais..." rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* ── Itens ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((row, i) => {
              const selectedItem = itemOptions.find((o) => o.id === row.itemId);
              const unidade = selectedItem?.unidade?.sigla ?? "—";
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-5 space-y-1.5">
                    {i === 0 && <Label>Produto</Label>}
                    <ComboboxWithCreate
                      options={itemOptions.map((opt) => ({ value: opt.id, label: `[${opt.codigo}] ${opt.descricao}` }))}
                      value={row.itemId}
                      onChange={(v) => updateRow(i, "itemId", v)}
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
                  <div className="col-span-1 space-y-1.5">
                    {i === 0 && <Label>Un.</Label>}
                    <div className="h-9 flex items-center justify-center px-2 text-sm text-gray-500 border border-gray-100 rounded-md bg-gray-50 font-mono">
                      {unidade}
                    </div>
                  </div>
                  <div className="col-span-3 space-y-1.5">
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

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-1" />Salvar Alterações</>}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(`/compras/necessidades/${id}`)}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
