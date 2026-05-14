"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pedidoVendaSchema, type PedidoVendaFormData } from "@/lib/validations/pedido-venda";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { formatBRL, decimalToNumber } from "@/lib/utils";

type ClienteOption = { id: string; razaoSocial: string; nomeFantasia: string | null };
type ItemOption = { id: string; codigo: string; descricao: string; precoVenda: unknown; unidadeMedida: string };

const CONDICOES = ["À vista","30 dias","30/60 dias","30/60/90 dias","Parcelado"];

export default function PedidoForm({ clientes, itens }: { clientes: ClienteOption[]; itens: ItemOption[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"orcamento" | "confirmado" | null>(null);

  const form = useForm<PedidoVendaFormData>({
    resolver: zodResolver(pedidoVendaSchema),
    defaultValues: {
      dataEmissao: new Date().toISOString().split("T")[0],
      valorDesconto: 0,
      valorFrete: 0,
      itens: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "itens" });

  function addItem() {
    append({ itemId: "", quantidade: 1, precoUnitario: 0, desconto: 0, valorTotal: 0 });
  }

  function onItemChange(index: number, itemId: string) {
    const item = itens.find((i) => i.id === itemId);
    if (item) {
      const preco = decimalToNumber(item.precoVenda);
      form.setValue(`itens.${index}.precoUnitario`, preco);
      recalcLine(index, form.getValues(`itens.${index}.quantidade`), preco, form.getValues(`itens.${index}.desconto`));
    }
  }

  function recalcLine(index: number, qty: number, price: number, disc: number) {
    form.setValue(`itens.${index}.valorTotal`, Math.max(0, qty * price - disc));
  }

  const watchedItens = form.watch("itens");
  const watchedDesconto = form.watch("valorDesconto") || 0;
  const watchedFrete = form.watch("valorFrete") || 0;
  const subtotal = watchedItens.reduce((s, i) => s + (i.valorTotal || 0), 0);
  const total = subtotal - watchedDesconto + watchedFrete;

  async function handleSubmit(status: "ORCAMENTO" | "CONFIRMADO") {
    const valid = await form.trigger();
    if (!valid) return;
    setSubmitting(status === "ORCAMENTO" ? "orcamento" : "confirmado");
    const data = form.getValues();
    const res = await fetch("/api/pedidos-venda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const json = await res.json();
      const pedidoId = json.data.id;
      if (status === "CONFIRMADO") {
        await fetch(`/api/pedidos-venda/${pedidoId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMADO" }),
        });
      }
      router.push(`/pedidos-venda/${pedidoId}`);
      router.refresh();
    }
    setSubmitting(null);
  }

  return (
    <Form {...form}>
      <form className="space-y-6">
        {/* Header info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Pedido</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="clienteId" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Cliente *</FormLabel>
                <ComboboxWithCreate
                  options={clientes.map((c) => ({ value: c.id, label: c.razaoSocial + (c.nomeFantasia ? ` (${c.nomeFantasia})` : "") }))}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  allowNone={false}
                  placeholder="Selecione o cliente..."
                  createHref="/clientes/novo"
                  createParam="razaoSocial"
                  createLabel="cliente"
                />
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dataEmissao" render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Emissão</FormLabel>
                <FormControl><Input type="date" {...field} value={String(field.value ?? "")} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dataEntrega" render={({ field }) => (
              <FormItem>
                <FormLabel>Previsão de Entrega</FormLabel>
                <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="condicaoPagamento" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Condição de Pagamento</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    {CONDICOES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens do Pedido</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Item
            </Button>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">Nenhum item adicionado. Clique em "Adicionar Item".</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 uppercase px-1">
                  <div className="col-span-4">Item</div>
                  <div className="col-span-2">Qtd</div>
                  <div className="col-span-2">Preço Unit.</div>
                  <div className="col-span-2">Desconto</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div />
                </div>
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg p-2">
                    <div className="col-span-4">
                      <ComboboxWithCreate
                        options={itens.map((i) => ({ value: i.id, label: `${i.codigo} — ${i.descricao}` }))}
                        value={form.watch(`itens.${index}.itemId`) ?? ""}
                        onChange={(v) => { form.setValue(`itens.${index}.itemId`, v); onItemChange(index, v); }}
                        allowNone={false}
                        placeholder="Selecionar item..."
                        createHref="/suprimentos/produtos/novo"
                        createParam="descricao"
                        createLabel="produto"
                        triggerClassName="h-8 text-xs bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number" step="0.001" min="0" className="h-8 text-xs"
                        {...form.register(`itens.${index}.quantidade`, { valueAsNumber: true })}
                        onChange={(e) => {
                          const qty = parseFloat(e.target.value) || 0;
                          form.setValue(`itens.${index}.quantidade`, qty);
                          recalcLine(index, qty, form.getValues(`itens.${index}.precoUnitario`), form.getValues(`itens.${index}.desconto`));
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number" step="0.01" min="0" className="h-8 text-xs"
                        {...form.register(`itens.${index}.precoUnitario`, { valueAsNumber: true })}
                        onChange={(e) => {
                          const price = parseFloat(e.target.value) || 0;
                          form.setValue(`itens.${index}.precoUnitario`, price);
                          recalcLine(index, form.getValues(`itens.${index}.quantidade`), price, form.getValues(`itens.${index}.desconto`));
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number" step="0.01" min="0" className="h-8 text-xs"
                        {...form.register(`itens.${index}.desconto`, { valueAsNumber: true })}
                        onChange={(e) => {
                          const disc = parseFloat(e.target.value) || 0;
                          form.setValue(`itens.${index}.desconto`, disc);
                          recalcLine(index, form.getValues(`itens.${index}.quantidade`), form.getValues(`itens.${index}.precoUnitario`), disc);
                        }}
                      />
                    </div>
                    <div className="col-span-1 text-right text-xs font-medium">
                      {formatBRL(form.watch(`itens.${index}.valorTotal`) || 0)}
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => remove(index)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
              <div className="w-72 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>{formatBRL(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span>Desconto Global (R$)</span>
                  <Input
                    type="number" step="0.01" min="0" className="h-7 w-28 text-xs text-right"
                    {...form.register("valorDesconto", { valueAsNumber: true })}
                  />
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span>Frete (R$)</span>
                  <Input
                    type="number" step="0.01" min="0" className="h-7 w-28 text-xs text-right"
                    {...form.register("valorFrete", { valueAsNumber: true })}
                  />
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span><span>{formatBRL(total)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <FormField control={form.control} name="observacoes" render={({ field }) => (
          <FormItem>
            <FormLabel>Observações</FormLabel>
            <FormControl><Textarea {...field} value={field.value ?? ""} rows={3} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => handleSubmit("ORCAMENTO")} disabled={!!submitting}>
            {submitting === "orcamento" ? "Salvando..." : "Salvar como Orçamento"}
          </Button>
          <Button type="button" onClick={() => handleSubmit("CONFIRMADO")} disabled={!!submitting}>
            {submitting === "confirmado" ? "Confirmando..." : "Confirmar Pedido"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={!!submitting}>Cancelar</Button>
        </div>
      </form>
    </Form>
  );
}
