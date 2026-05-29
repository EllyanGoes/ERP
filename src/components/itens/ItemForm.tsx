"use client";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { itemSchema, type ItemFormData } from "@/lib/validations/item";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { decimalToNumber } from "@/lib/utils";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";

type ItemWithEstoque = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  unidadeMedida: string;
  ncm: string | null;
  cest: string | null;
  precoVenda: unknown;
  precoCusto: unknown;
  pesoLiquido: unknown;
  pesoBruto: unknown;
  ativo: boolean;
  comodato: boolean;
  observacoes: string | null;
  estoqueItems: Array<{ quantidadeMin: unknown; quantidadeMax: unknown | null; localizacao: string | null }>;
};

export default function ItemForm({ item }: { item?: ItemWithEstoque }) {
  const router = useRouter();
  const { replaceCurrentTab } = useTabsContext();
  useTabTitle(item ? item.descricao : null);
  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema) as Resolver<ItemFormData>,
    defaultValues: item ? {
      codigo: item.codigo,
      descricao: item.descricao,
      tipo: item.tipo as any,
      unidadeMedida: item.unidadeMedida as any,
      ncm: item.ncm ?? "",
      cest: item.cest ?? "",
      precoVenda: decimalToNumber(item.precoVenda),
      precoCusto: item.precoCusto ? decimalToNumber(item.precoCusto) : undefined,
      ativo: item.ativo,
      comodato: item.comodato,
      observacoes: item.observacoes ?? "",
      quantidadeMin: item.estoqueItems[0] ? decimalToNumber(item.estoqueItems[0].quantidadeMin) : 0,
      quantidadeMax: item.estoqueItems[0]?.quantidadeMax ? decimalToNumber(item.estoqueItems[0].quantidadeMax) : undefined,
      localizacao: item.estoqueItems[0]?.localizacao ?? "",
    } : {
      tipo: "PRODUTO",
      unidadeMedida: "UN",
      ativo: true,
      precoVenda: 0,
      quantidadeMin: 0,
    },
  });

  const tipo = form.watch("tipo");

  const [serverError, setServerError] = useState<string | null>(null);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "item",
    onNew: () => form.reset({ tipo: "PRODUTO", unidadeMedida: "UN", ativo: true, precoVenda: 0, quantidadeMin: 0 }),
    viewHref: (id) => `/itens/${id}/editar`,
  });

  async function onSubmit(data: ItemFormData) {
    setServerError(null);
    const url = item ? `/api/itens/${item.id}` : "/api/itens";
    const method = item ? "PUT" : "POST";
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (res.ok) {
        if (item) {
          replaceCurrentTab("/itens");
          router.refresh();
        } else {
          const json = await res.json();
          confirmCreated(json.data.id);
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar item. Tente novamente.");
      }
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Item</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="codigo" render={({ field }) => (
              <FormItem><FormLabel>Código *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="tipo" render={({ field }) => (
              <FormItem><FormLabel>Tipo *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="PRODUTO">Produto</SelectItem>
                    <SelectItem value="SERVICO">Serviço</SelectItem>
                    <SelectItem value="MATERIA_PRIMA">Matéria-Prima</SelectItem>
                  </SelectContent>
                </Select>
              <FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="descricao" render={({ field }) => (
              <FormItem className="col-span-2"><FormLabel>Descrição *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="unidadeMedida" render={({ field }) => (
              <FormItem><FormLabel>Unidade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {["UN","KG","LT","MT","CX","PC","HR"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              <FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ncm" render={({ field }) => (
              <FormItem><FormLabel>NCM</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="0000.00.00" /></FormControl><FormMessage /></FormItem>
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Preços</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="precoVenda" render={({ field }) => (
              <FormItem><FormLabel>Preço de Venda (R$) *</FormLabel><FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="precoCusto" render={({ field }) => (
              <FormItem><FormLabel>Custo (R$)</FormLabel><FormControl><Input type="number" step="0.01" min="0" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
          </CardContent>
        </Card>

        {tipo !== "SERVICO" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Estoque</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="quantidadeMin" render={({ field }) => (
                <FormItem><FormLabel>Qtd. Mínima</FormLabel><FormControl><Input type="number" step="0.001" min="0" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="quantidadeMax" render={({ field }) => (
                <FormItem><FormLabel>Qtd. Máxima</FormLabel><FormControl><Input type="number" step="0.001" min="0" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="localizacao" render={({ field }) => (
                <FormItem><FormLabel>Localização</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="Ex: A-01-02" /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Comodato</CardTitle></CardHeader>
          <CardContent>
            <FormField control={form.control} name="comodato" render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-3 space-y-0">
                <FormControl>
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </FormControl>
                <div>
                  <FormLabel className="!mt-0">Item de comodato (vasilhame retornável)</FormLabel>
                  <p className="text-xs text-gray-500">
                    Pallets, engradados e outros itens emprestados ao cliente que devem retornar. Itens marcados aqui aparecem na tela de Comodato.
                  </p>
                </div>
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <FormField control={form.control} name="observacoes" render={({ field }) => (
          <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} rows={3} /></FormControl><FormMessage /></FormItem>
        )} />

        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Salvando..." : item ? "Salvar Alterações" : "Criar Item"}
          </Button>
          <Button type="button" variant="outline" onClick={() => item ? replaceCurrentTab("/itens") : router.back()}>Cancelar</Button>
        </div>
      </form>
      {dialog}
    </Form>
  );
}
