"use client";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { contaReceberSchema, type ContaReceberFormData } from "@/lib/validations/financeiro";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type ClienteOption = { id: string; razaoSocial: string };

export default function ContaReceberForm({ clientes }: { clientes: ClienteOption[] }) {
  const router = useRouter();
  const form = useForm<ContaReceberFormData>({
    resolver: zodResolver(contaReceberSchema) as Resolver<ContaReceberFormData>,
    defaultValues: { dataVencimento: new Date().toISOString().split("T")[0] },
  });

  async function onSubmit(data: ContaReceberFormData) {
    const res = await fetch("/api/contas-receber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { router.push("/contas-receber"); router.refresh(); }
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
        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Salvando..." : "Criar Conta"}</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </Form>
  );
}
