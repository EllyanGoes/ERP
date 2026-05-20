"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatBRL } from "@/lib/utils";
import { Plus, Trash2, Loader2, Save, CheckCircle2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type Fornecedor = {
  id: string; razaoSocial: string; nomeFantasia: string | null;
  cpfCnpj: string | null; contato: string | null; email: string | null;
};
type ItemOption = { id: string; codigo: string; descricao: string; unidadeMedida: string };

type ItemRow = {
  itemId: string;
  quantidade: string;
  precoUnitario: string;
  situacao: "CONSIDERA" | "NAO_CONSIDERA";
};

type FormSnapshot = {
  fornecedorId: string;
  descricao: string;
  contato: string;
  email: string;
  frete: string;
  tipoFrete: string;
  desconto: string;
  despesas: string;
  seguro: string;
  condicoesPagamento: string;
  dataEntregaPrevista: string;
  itens: ItemRow[];
};

const TIPO_FRETE_OPTIONS = [
  { value: "C", label: "C-CIF" },
  { value: "F", label: "F-FOB" },
  { value: "T", label: "T-CIF/FOB" },
  { value: "O", label: "Outro" },
];

export default function NovoPedidoCompraPage() {
  const router = useRouter();
  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<FormSnapshot>("pc:novo");

  // Data
  const [fornecedores, setFornecedores]   = useState<Fornecedor[]>([]);
  const [itemOptions, setItemOptions]     = useState<ItemOption[]>([]);
  const [condicoesList, setCondicoesList] = useState<{ id: string; nome: string }[]>([]);

  // Fornecedor section
  const [fornecedorId, setFornecedorIdState] = useState("");
  const [descricao, setDescricao]            = useState("");
  const [contato, setContato]                = useState("");
  const [email, setEmail]                    = useState("");

  // Financeiro section
  const [frete, setFrete]                         = useState("");
  const [tipoFrete, setTipoFrete]                 = useState("");
  const [desconto, setDesconto]                   = useState("");
  const [despesas, setDespesas]                   = useState("");
  const [seguro, setSeguro]                       = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [dataEntregaPrevista, setDataEntregaPrevista] = useState("");

  // Items
  const [itens, setItens] = useState<ItemRow[]>([
    { itemId: "", quantidade: "1", precoUnitario: "", situacao: "CONSIDERA" },
  ]);

  // Form state
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const isDirty = !!(fornecedorId || itens.some(r => r.itemId));
  useDirtyForm(isDirty);

  // Auto-save effect
  useEffect(() => {
    saveForm({ fornecedorId, descricao, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, itens });
  }, [fornecedorId, descricao, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, itens, saveForm]);

  // Restore on mount
  const formRestoredRef = useRef(false);
  useEffect(() => {
    if (formRestoredRef.current) return;
    formRestoredRef.current = true;
    const saved = loadForm();
    if (saved) {
      if (saved.fornecedorId !== undefined) setFornecedorIdState(saved.fornecedorId);
      if (saved.descricao   !== undefined) setDescricao(saved.descricao);
      if (saved.contato !== undefined) setContato(saved.contato);
      if (saved.email !== undefined) setEmail(saved.email);
      if (saved.frete !== undefined) setFrete(saved.frete);
      if (saved.tipoFrete !== undefined) setTipoFrete(saved.tipoFrete);
      if (saved.desconto !== undefined) setDesconto(saved.desconto);
      if (saved.despesas !== undefined) setDespesas(saved.despesas);
      if (saved.seguro !== undefined) setSeguro(saved.seguro);
      if (saved.condicoesPagamento !== undefined) setCondicoesPagamento(saved.condicoesPagamento);
      if (saved.dataEntregaPrevista !== undefined) setDataEntregaPrevista(saved.dataEntregaPrevista);
      if (saved.itens !== undefined) setItens(saved.itens);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : j.data ?? []));
    fetch("/api/itens?tipo=PRODUTO&limit=200")
      .then((r) => r.json())
      .then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
    fetch("/api/suprimentos/condicoes-pagamento")
      .then((r) => r.json())
      .then((list) => { if (Array.isArray(list)) setCondicoesList(list); })
      .catch(() => {});
  }, []);

  function setFornecedorId(id: string) {
    setFornecedorIdState(id);
    const f = fornecedores.find((f) => f.id === id);
    if (f) {
      setContato(f.contato ?? "");
      setEmail(f.email ?? "");
    }
  }

  function addRow() {
    setItens((p) => [...p, { itemId: "", quantidade: "1", precoUnitario: "", situacao: "CONSIDERA" }]);
  }
  function removeRow(i: number) {
    setItens((p) => p.filter((_, idx) => idx !== i));
  }
  function updateRow<K extends keyof ItemRow>(i: number, key: K, value: ItemRow[K]) {
    setItens((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  // ── Computed values ────────────────────────────────────────────────────────
  const totalItensQtd = itens.reduce((s, i) => s + (parseFloat(i.quantidade) || 0), 0);

  const subtotalItens = itens
    .filter((i) => i.situacao === "CONSIDERA")
    .reduce((s, i) => s + (parseFloat(i.quantidade) || 0) * (parseFloat(i.precoUnitario) || 0), 0);

  const descontoVal    = parseFloat(desconto)  || 0;
  const freteVal       = parseFloat(frete)     || 0;
  const despesasVal    = parseFloat(despesas)  || 0;
  const seguroVal      = parseFloat(seguro)    || 0;
  const vrDescontoCalc = (subtotalItens * descontoVal) / 100;
  const totalCotacao   = subtotalItens - vrDescontoCalc + freteVal + despesasVal + seguroVal;

  const selectedForn = fornecedores.find((f) => f.id === fornecedorId);
  const fornNome     = selectedForn ? (selectedForn.nomeFantasia || selectedForn.razaoSocial) : "";
  const codigoForn   = fornecedorId ? fornecedorId.slice(-8).toUpperCase() : "";

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!fornecedorId) { setError("Selecione um fornecedor"); return; }
    const validItens = itens.filter(
      (row) => row.itemId && parseFloat(row.quantidade) > 0
    );
    if (validItens.length === 0) { setError("Adicione pelo menos um item"); return; }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/suprimentos/pedidos-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId,
          descricao: descricao.trim() || null,
          contato: contato || null,
          email:   email   || null,
          dataEntregaPrevista: dataEntregaPrevista || null,
          frete:               freteVal    || null,
          tipoFrete:           tipoFrete   || null,
          desconto:            descontoVal || null,
          vrDesconto:          vrDescontoCalc || null,
          despesas:            despesasVal || null,
          seguro:              seguroVal   || null,
          condicoesPagamento:  condicoesPagamento || null,
          itens: validItens.map((row) => ({
            itemId:       row.itemId,
            quantidade:   parseFloat(row.quantidade),
            precoUnitario: parseFloat(row.precoUnitario) || 0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao criar pedido"); return; }
      clearForm();
      router.push(`/suprimentos/pedidos-compra/${json.data.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo Pedido de Compra"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
          { label: "Novo" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Criando..." : "Criar Pedido de Compra"}
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* ── Seção Fornecedor ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Código fornecedor</Label>
              <Input value={codigoForn || "—"} readOnly className="font-mono bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Loja</Label>
              <Input value="01" readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1 md:col-span-1">
              <Label className="text-xs text-gray-500">Nome Fornecedor</Label>
              <Input value={fornNome || "—"} readOnly className="bg-gray-50" />
            </div>

            {/* Fornecedor selector — spans full row */}
            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-gray-500">Fornecedor <span className="text-red-500">*</span></Label>
              <ComboboxWithCreate
                options={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
                value={fornecedorId}
                onChange={setFornecedorId}
                allowNone={false}
                placeholder="Selecionar fornecedor..."
                createHref="/suprimentos/fornecedores/novo"
                createParam="nome"
                createLabel="fornecedor"
              />
            </div>

            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-gray-500">Descrição</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição do pedido (ex.: materiais para manutenção preventiva)"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Contato</Label>
              <Input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome do contato" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fornecedor.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Proposta</Label>
              <Input value="PROPOSTA 01" readOnly className="bg-gray-50 font-mono" />
            </div>
          </div>
        </div>

        {/* ── Seção Financeiro ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total itens</Label>
              <Input
                value={totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total Cotação</Label>
              <Input value={formatBRL(totalCotacao)} readOnly className="bg-gray-50 text-right font-semibold" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">% Desconto</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vr Desconto</Label>
              <Input value={formatBRL(vrDescontoCalc)} readOnly className="bg-gray-50 text-right" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Frete</Label>
              <Input
                type="number" step="0.01" min="0"
                value={frete} onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Tipo Frete</Label>
              <Select value={tipoFrete || "__none__"} onValueChange={(v) => setTipoFrete(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecionar</SelectItem>
                  {TIPO_FRETE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Condição pagamento</Label>
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
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Despesas</Label>
              <Input
                type="number" step="0.01" min="0"
                value={despesas} onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Seguro</Label>
              <Input
                type="number" step="0.01" min="0"
                value={seguro} onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Entrega Prevista</Label>
              <Input type="date" value={dataEntregaPrevista} onChange={(e) => setDataEntregaPrevista(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Itens da cotação ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Itens da cotação</h2>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">Total Item</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((row, i) => {
                  const opt = itemOptions.find((o) => o.id === row.itemId);
                  const preco = parseFloat(row.precoUnitario) || 0;
                  const qtd   = parseFloat(row.quantidade)   || 0;
                  const total = row.situacao === "CONSIDERA" ? preco * qtd : 0;
                  const isNao = row.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={i} className={cn("hover:bg-gray-50", isNao && "opacity-50")}>
                      <td className="px-4 py-2 w-44">
                        <ComboboxWithCreate
                          options={itemOptions.map((o) => ({ value: o.id, label: `[${o.codigo}] ${o.descricao}` }))}
                          value={row.itemId}
                          onChange={(v) => updateRow(i, "itemId", v)}
                          allowNone={false}
                          placeholder="Produto..."
                          createHref="/suprimentos/produtos/novo"
                          createParam="descricao"
                          createLabel="produto"
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{opt?.descricao ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{opt?.unidadeMedida ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={row.situacao}
                          onValueChange={(v) => updateRow(i, "situacao", v as ItemRow["situacao"])}
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
                      <td className="px-4 py-2">
                        <Input
                          type="number" step="0.001" min="0"
                          value={row.quantidade}
                          onChange={(e) => updateRow(i, "quantidade", e.target.value)}
                          className="text-right h-8 w-24 ml-auto"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number" step="0.01" min="0"
                          disabled={isNao}
                          value={row.precoUnitario}
                          onChange={(e) => updateRow(i, "precoUnitario", e.target.value)}
                          placeholder="0,00"
                          className="text-right h-8"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {isNao ? "—" : formatBRL(total)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {itens.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{formatBRL(totalCotacao)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Situação badge legend */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Considera
          </span>
          <span>— item incluído no total</span>
        </div>
      </div>
    </div>
  );
}
