"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { Loader2, ChevronDown, Save, X, Plus, Paperclip, Upload, File, FileText, FileImage, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemForm = {
  itemId: string;
  quantidade: number;
  precoUnitario: string;
  situacao: string;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
};

type Fornecedor = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  contato: string | null;
  email: string | null;
};

const TIPO_FRETE_OPTIONS = [
  { value: "C", label: "C-CIF" },
  { value: "F", label: "F-FOB" },
  { value: "T", label: "T-CIF/FOB" },
  { value: "O", label: "Outro" },
];

// ── Component ──────────────────────────────────────────────────────────────────
type FormSnapshot = {
  fornecedorId: string;
  contato: string;
  email: string;
  condicoesPagamento: string;
  frete: string;
  tipoFrete: string;
  desconto: string;
  despesas: string;
  seguro: string;
  itens: ItemForm[];
};

export default function NovaParticipantePage() {
  const { id: cotacaoId } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Cotação meta ─────────────────────────────────────────────────────────
  const [cotacaoNumero, setCotacaoNumero] = useState("");
  const [propostaNumero, setPropostaNumero] = useState(1);
  const [existingFornIds, setExistingFornIds] = useState<string[]>([]);

  // ── Fornecedores list ────────────────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");

  // ── Form state ────────────────────────────────────────────────────────────
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [condicoesList, setCondicoesList] = useState<{ id: string; nome: string }[]>([]);
  const [frete, setFrete] = useState("");
  const [tipoFrete, setTipoFrete] = useState("");
  const [desconto, setDesconto] = useState("");
  const [despesas, setDespesas] = useState("");
  const [seguro, setSeguro] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);

  // ── Dirty tracking ────────────────────────────────────────────────────────
  const [isDirty, setIsDirty] = useState(false);
  const baselineRef = useRef<string | null>(null);

  // ── Persistência entre abas ───────────────────────────────────────────────
  const { save: saveForm, load: loadForm, clear: clearForm } =
    useFormPersist<FormSnapshot>(`cotacao:nova-participante:${cotacaoId}`);
  const dataLoadedRef = useRef(false);

  // ── Load cotação data ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${cotacaoId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao carregar cotação"); return; }

      const cotacao = json.data;
      setCotacaoNumero(cotacao.numero);
      const fornIds: string[] = (cotacao.fornecedores ?? []).map((f: { fornecedorId: string }) => f.fornecedorId);
      setExistingFornIds(fornIds);
      setPropostaNumero((cotacao.fornecedores?.length ?? 0) + 1);

      // Build item list from first existing fornecedor (same items, prices = 0)
      const firstForn = cotacao.fornecedores?.[0];
      const apiItens: ItemForm[] = firstForn
        ? firstForn.itens.map((i: {
            itemId: string;
            quantidade: unknown;
            item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
          }) => ({
            itemId: i.itemId,
            quantidade: decimalToNumber(i.quantidade),
            precoUnitario: "",
            situacao: "CONSIDERA",
            item: i.item,
          }))
        : [];

      // Prefer cached values
      const cached = loadForm();
      let resolvedFornecedorId: string;
      let resolvedContato: string;
      let resolvedEmail: string;
      let resolvedCondicoes: string;
      let resolvedFrete: string;
      let resolvedTipoFrete: string;
      let resolvedDesconto: string;
      let resolvedDespesas: string;
      let resolvedSeguro: string;
      let resolvedItens: ItemForm[];

      if (cached && !dataLoadedRef.current) {
        resolvedFornecedorId = cached.fornecedorId ?? "";
        resolvedContato = cached.contato ?? "";
        resolvedEmail = cached.email ?? "";
        resolvedCondicoes = cached.condicoesPagamento ?? "";
        resolvedFrete = cached.frete ?? "";
        resolvedTipoFrete = cached.tipoFrete ?? "";
        resolvedDesconto = cached.desconto ?? "";
        resolvedDespesas = cached.despesas ?? "";
        resolvedSeguro = cached.seguro ?? "";
        const sameItems =
          cached.itens?.length === apiItens.length &&
          cached.itens.every((ci, idx) => ci.itemId === apiItens[idx]?.itemId);
        resolvedItens = sameItems ? cached.itens : apiItens;
      } else {
        resolvedFornecedorId = "";
        resolvedContato = "";
        resolvedEmail = "";
        resolvedCondicoes = "";
        resolvedFrete = "";
        resolvedTipoFrete = "";
        resolvedDesconto = "";
        resolvedDespesas = "";
        resolvedSeguro = "";
        resolvedItens = apiItens;
      }

      setFornecedorId(resolvedFornecedorId);
      setContato(resolvedContato);
      setEmail(resolvedEmail);
      setCondicoesPagamento(resolvedCondicoes);
      setFrete(resolvedFrete);
      setTipoFrete(resolvedTipoFrete);
      setDesconto(resolvedDesconto);
      setDespesas(resolvedDespesas);
      setSeguro(resolvedSeguro);
      setItens(resolvedItens);

      // Capture baseline for dirty tracking (clean = no supplier selected, no prices)
      baselineRef.current = JSON.stringify({
        fornecedorId: resolvedFornecedorId,
        contato: resolvedContato,
        email: resolvedEmail,
        condicoesPagamento: resolvedCondicoes,
        frete: resolvedFrete,
        tipoFrete: resolvedTipoFrete,
        desconto: resolvedDesconto,
        despesas: resolvedDespesas,
        seguro: resolvedSeguro,
        itens: resolvedItens,
      });
      setIsDirty(false);

      dataLoadedRef.current = true;
    } catch {
      setError("Erro ao carregar cotação");
    } finally {
      setLoading(false);
    }
  }, [cotacaoId, loadForm]);

  // ── Load fornecedores list ────────────────────────────────────────────────
  const loadFornecedores = useCallback(async () => {
    try {
      const r = await fetch("/api/suprimentos/fornecedores");
      const json = await r.json();
      const list: Fornecedor[] = Array.isArray(json) ? json : (json.data ?? []);
      setFornecedores(list);
    } catch {}
  }, []);

  // ── Load condições de pagamento ───────────────────────────────────────────
  const loadCondicoes = useCallback(async () => {
    try {
      const r = await fetch("/api/suprimentos/condicoes-pagamento");
      const list = await r.json();
      if (Array.isArray(list)) setCondicoesList(list);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFornecedores(); }, [loadFornecedores]);
  useEffect(() => { loadCondicoes(); }, [loadCondicoes]);

  // ── Auto-fill contato/email when supplier is selected ────────────────────
  useEffect(() => {
    if (!fornecedorId) return;
    const forn = fornecedores.find((f) => f.id === fornecedorId);
    if (!forn) return;
    // Only auto-fill if fields are currently empty (don't overwrite user edits)
    if (!contato) setContato(forn.contato ?? "");
    if (!email) setEmail(forn.email ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornecedorId, fornecedores]);

  // ── Auto-save ao mudar qualquer campo do formulário ───────────────────────
  useEffect(() => {
    if (loading) return;
    saveForm({ fornecedorId, contato, email, condicoesPagamento, frete, tipoFrete, desconto, despesas, seguro, itens });
  }, [fornecedorId, contato, email, condicoesPagamento, frete, tipoFrete, desconto, despesas, seguro, itens, loading, saveForm]);

  // ── Dirty state tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (baselineRef.current === null || loading) return;
    const current = JSON.stringify({ fornecedorId, contato, email, condicoesPagamento, frete, tipoFrete, desconto, despesas, seguro, itens });
    setIsDirty(current !== baselineRef.current);
  }, [fornecedorId, contato, email, condicoesPagamento, frete, tipoFrete, desconto, despesas, seguro, itens, loading]);

  useDirtyForm(isDirty, async () => { await handleSave(); });

  // ── Modal nova condição de pagamento ──────────────────────────────────────
  const [showNovaCondicao, setShowNovaCondicao] = useState(false);
  const [novaCondicaoNome, setNovaCondicaoNome] = useState("");
  const [novaCondicaoDesc, setNovaCondicaoDesc] = useState("");
  const [savingCondicao, setSavingCondicao] = useState(false);
  const [erroCondicao, setErroCondicao] = useState("");

  async function handleCriarCondicao() {
    if (!novaCondicaoNome.trim()) { setErroCondicao("Nome é obrigatório"); return; }
    setSavingCondicao(true); setErroCondicao("");
    try {
      const res = await fetch("/api/suprimentos/condicoes-pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novaCondicaoNome.trim(), descricao: novaCondicaoDesc.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setErroCondicao(json.error || "Erro ao criar"); return; }
      await loadCondicoes();
      setCondicoesPagamento(json.nome);
      setShowNovaCondicao(false);
      setNovaCondicaoNome("");
      setNovaCondicaoDesc("");
    } catch { setErroCondicao("Erro de conexão"); }
    finally { setSavingCondicao(false); }
  }

  useTabTitle("Novo Participante");

  // ── Computed values ───────────────────────────────────────────────────────
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);

  const subtotalItens = itens
    .filter((i) => i.situacao === "CONSIDERA")
    .reduce((s, i) => {
      const p = parseFloat(i.precoUnitario) || 0;
      return s + p * i.quantidade;
    }, 0);

  const descontoVal = parseFloat(desconto) || 0;
  const freteVal = parseFloat(frete) || 0;
  const despesasVal = parseFloat(despesas) || 0;
  const seguroVal = parseFloat(seguro) || 0;
  const vrDescontoCalc = (subtotalItens * descontoVal) / 100;
  const totalCotacao = subtotalItens - vrDescontoCalc + freteVal + despesasVal + seguroVal;

  // ── Derived display values ────────────────────────────────────────────────
  const selectedForn = fornecedores.find((f) => f.id === fornecedorId);
  const codigoForn = selectedForn ? selectedForn.id.slice(-8).toUpperCase() : "";
  const propostaLabel = `PROPOSTA ${String(propostaNumero).padStart(2, "0")}`;

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!fornecedorId) {
      setSaveError("Selecione um fornecedor");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const body = {
        fornecedorId,
        condicoesPagamento: condicoesPagamento || null,
        frete: freteVal || null,
        tipoFrete: tipoFrete || null,
        desconto: descontoVal || null,
        vrDesconto: vrDescontoCalc || null,
        despesas: despesasVal || null,
        seguro: seguroVal || null,
        itens: itens.map((i) => ({
          itemId: i.itemId,
          quantidade: i.quantidade,
          precoUnitario: parseFloat(i.precoUnitario) || 0,
          situacao: i.situacao,
        })),
      };

      const res = await fetch(`/api/suprimentos/cotacoes/${cotacaoId}/fornecedores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error || "Erro ao salvar"); return; }

      const newCfId: string = json.data.id;

      // Upload staged files to the newly created CF
      if (stagedFiles.length > 0) {
        for (const file of stagedFiles) {
          const fd = new FormData();
          fd.append("file", file);
          await fetch(
            `/api/suprimentos/cotacoes/${cotacaoId}/fornecedores/${newCfId}/anexos`,
            { method: "POST", body: fd }
          ).catch(() => {/* non-blocking */});
        }
      }

      clearForm();
      setIsDirty(false);
      baselineRef.current = null;
      router.push(`/suprimentos/cotacoes/${cotacaoId}`);
    } catch {
      setSaveError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return <div className="px-8 pt-8 text-red-500">{error}</div>;

  const fornecedorOptions = fornecedores.map((f) => ({
    value: f.id,
    label: f.nomeFantasia || f.razaoSocial,
  }));

  return (
    <div>
      <PageHeader
        title="Novo Participante"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Cotações", href: "/suprimentos/cotacoes" },
          { label: cotacaoNumero || "Cotação", href: `/suprimentos/cotacoes/${cotacaoId}` },
          { label: "Novo Participante" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" className="gap-1">
                  Outras Ações <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/suprimentos/cotacoes/${cotacaoId}`)}>
                  Visualizar cotação
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => router.push(`/suprimentos/cotacoes/${cotacaoId}`)}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">
        {saveError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{saveError}</div>
        )}

        {/* ── Seção Fornecedor ─────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-muted-foreground">Nome Fornecedor <span className="text-red-500">*</span></Label>
              <ComboboxWithCreate
                options={fornecedorOptions}
                value={fornecedorId}
                onChange={(v) => {
                  setFornecedorId(v);
                  // Reset contact fields so auto-fill can run
                  if (v !== fornecedorId) {
                    setContato("");
                    setEmail("");
                  }
                }}
                placeholder="Selecionar fornecedor..."
                allowNone={false}
                disabledValues={existingFornIds}
                createHref="/suprimentos/fornecedores/novo"
                createLabel="fornecedor"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Código fornecedor</Label>
              <Input value={codigoForn} readOnly className="font-mono bg-muted" placeholder="—" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Loja</Label>
              <Input value={fornecedorId ? "01" : ""} readOnly className="bg-muted" placeholder="—" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Proposta</Label>
              <Input value={propostaLabel} readOnly className="bg-muted font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contato</Label>
              <Input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="Nome do contato"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@fornecedor.com"
              />
            </div>
          </div>
        </div>

        {/* ── Seção Cotação ─────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total itens</Label>
              <Input
                value={totalItens.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly
                className="bg-muted text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total Cotação</Label>
              <Input
                value={formatBRL(totalCotacao)}
                readOnly
                className="bg-muted text-right font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">% Desconto</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vr Desconto</Label>
              <Input
                value={formatBRL(vrDescontoCalc)}
                readOnly
                className="bg-muted text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Frete</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={frete}
                onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo Frete</Label>
              <Select value={tipoFrete} onValueChange={setTipoFrete}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_FRETE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Condição pagamento</Label>
                <button
                  type="button"
                  onClick={() => { setShowNovaCondicao(true); setNovaCondicaoNome(""); setNovaCondicaoDesc(""); setErroCondicao(""); }}
                  className="flex items-center gap-0.5 text-xs text-info hover:text-info font-medium"
                  title="Nova condição de pagamento"
                >
                  <Plus className="w-3 h-3" /> Nova
                </button>
              </div>
              <Select
                value={condicoesPagamento || "__none__"}
                onValueChange={(v) => setCondicoesPagamento(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar condição..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {condicoesList.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Despesas</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={despesas}
                onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Seguro</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={seguro}
                onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
          </div>
        </div>

        {/* ── Itens da cotação ──────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Itens da cotação</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((item, idx) => {
                  const preco = parseFloat(item.precoUnitario) || 0;
                  const totalItem = item.situacao === "CONSIDERA" ? preco * item.quantidade : 0;
                  const isNaoConsidera = item.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={item.itemId} className={cn("hover:bg-muted", isNaoConsidera && "opacity-50")}>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.item.codigo}</td>
                      <td className="px-4 py-2 text-foreground">{item.item.descricao}</td>
                      <td className="px-4 py-2 text-muted-foreground">{item.item.unidadeMedida}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={item.situacao}
                          onValueChange={(v) =>
                            setItens((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, situacao: v } : it))
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CONSIDERA">Considera</SelectItem>
                            <SelectItem value="NAO_CONSIDERA">Não Considera</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">
                        {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isNaoConsidera}
                          value={item.precoUnitario}
                          onChange={(e) =>
                            setItens((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, precoUnitario: e.target.value } : it
                              )
                            )
                          }
                          className="text-right h-8"
                          placeholder="0,00"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-foreground">
                        {isNaoConsidera ? "—" : formatBRL(totalItem)}
                      </td>
                    </tr>
                  );
                })}
                {itens.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center text-muted-foreground text-sm">
                      Nenhum item encontrado
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right font-semibold text-foreground text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-foreground">
                    {formatBRL(totalCotacao)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Documentos da Proposta (staged) ───────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Documentos da Proposta</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">PDF, imagens, planilhas — máx. 20 MB por arquivo</span>
            </div>

            {/* Staged file list */}
            {stagedFiles.length > 0 && (
              <div className="space-y-1.5">
                {stagedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-muted">
                    {f.type.startsWith("image/") ? <FileImage className="w-4 h-4 text-purple-500 shrink-0" />
                      : f.type === "application/pdf" ? <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      : <File className="w-4 h-4 text-blue-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStagedFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-border hover:border-blue-300 hover:bg-muted cursor-pointer transition-colors"
            >
              <Upload className="w-5 h-5 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground select-none text-center">
                Clique ou arraste arquivos aqui<br />
                <span className="text-muted-foreground">Serão enviados junto com a proposta</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,.rar"
                onChange={(e) => {
                  if (e.target.files) {
                    setStagedFiles((p) => [...p, ...Array.from(e.target.files!)]);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal Nova Condição de Pagamento ─────────────────────────────────── */}
      {showNovaCondicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Nova Condição de Pagamento</h2>
              <button onClick={() => setShowNovaCondicao(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {erroCondicao && (
                <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erroCondicao}</p>
              )}
              <div className="space-y-1.5">
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  autoFocus
                  value={novaCondicaoNome}
                  onChange={(e) => setNovaCondicaoNome(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCriarCondicao()}
                  placeholder="Ex: 30/60/90 dias"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Descrição <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
                <Input
                  value={novaCondicaoDesc}
                  onChange={(e) => setNovaCondicaoDesc(e.target.value)}
                  placeholder="Detalhes da condição..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNovaCondicao(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCriarCondicao} disabled={savingCondicao}>
                {savingCondicao ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Criar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
