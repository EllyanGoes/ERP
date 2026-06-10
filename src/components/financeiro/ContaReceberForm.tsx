"use client";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contaReceberSchema, type ContaReceberFormData } from "@/lib/validations/financeiro";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";

type ClienteOption = { id: string; razaoSocial: string };

export default function ContaReceberForm({ clientes }: { clientes: ClienteOption[] }) {
  const voltar = useVoltarCriacao("/contas-receber");
  const form = useForm<ContaReceberFormData>({
    resolver: zodResolver(contaReceberSchema) as Resolver<ContaReceberFormData>,
    defaultValues: { dataVencimento: new Date().toISOString().split("T")[0] },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState("1");
  const [intervaloDias, setIntervaloDias] = useState("30");

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "conta",
    gender: "f",
    onNew: () => { form.reset({ dataVencimento: new Date().toISOString().split("T")[0] }); setParcelas("1"); setIntervaloDias("30"); },
  });

  async function onSubmit(data: ContaReceberFormData) {
    setServerError(null);
    try {
      const res = await fetch("/api/contas-receber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, parcelas: Number(parcelas) || 1, intervaloDias: Number(intervaloDias) || 30 }),
      });
      if (res.ok) {
        const json = await res.json();
        confirmCreated(json.data.id);
      } else {
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar conta. Tente novamente.");
      }
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da Conta</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="clienteId" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Cliente *</FormLabel>
                <ComboboxWithCreate
                  options={clientes.map((c) => ({ value: c.id, label: c.razaoSocial }))}
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
            <FormField control={form.control} name="descricao" render={({ field }) => (
              <FormItem className="col-span-2"><FormLabel>Descrição *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="valorOriginal" render={({ field }) => (
              <FormItem><FormLabel>Valor (R$) *</FormLabel><FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="dataVencimento" render={({ field }) => (
              <FormItem><FormLabel>Vencimento *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="formaPagamento" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Forma de Pagamento</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl>
                  <SelectContent>{["PIX","Boleto","Transferência","Cartão de Crédito","Dinheiro"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem className="col-span-2"><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} rows={3} /></FormControl><FormMessage /></FormItem>
            )} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Parcelamento</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nº de parcelas</label>
              <Input type="number" min="1" step="1" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Intervalo entre parcelas (dias)</label>
              <Input type="number" min="1" step="1" value={intervaloDias} onChange={(e) => setIntervaloDias(e.target.value)} />
            </div>
            {Number(parcelas) > 1 && (
              <p className="col-span-2 text-xs text-gray-500">
                Serão geradas {parcelas} parcelas, vencendo a cada {intervaloDias} dias a partir do vencimento informado. O valor é dividido entre elas.
              </p>
            )}
          </CardContent>
        </Card>
        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Salvando..." : "Criar Conta"}</Button>
          <Button type="button" variant="outline" onClick={voltar}>Cancelar</Button>
        </div>
      </form>
      {dialog}
    </Form>
  );
}
