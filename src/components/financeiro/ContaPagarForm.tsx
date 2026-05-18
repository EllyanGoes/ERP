"use client";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { contaPagarSchema, type ContaPagarFormData } from "@/lib/validations/financeiro";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type FornecedorOption = { id: string; razaoSocial: string };
const CATEGORIAS = ["Aluguel","Energia","Água","Internet","Folha de Pagamento","Impostos","Fornecedores","Marketing","Outros"];

export default function ContaPagarForm({ fornecedores }: { fornecedores: FornecedorOption[] }) {
  const router = useRouter();
  const form = useForm<ContaPagarFormData>({
    resolver: zodResolver(contaPagarSchema) as Resolver<ContaPagarFormData>,
    defaultValues: { dataVencimento: new Date().toISOString().split("T")[0] },
  });

  async function onSubmit(data: ContaPagarFormData) {
    const res = await fetch("/api/contas-pagar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { router.push("/contas-pagar"); router.refresh(); }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da Conta</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="fornecedorId" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Fornecedor</FormLabel>
                <ComboboxWithCreate
                  options={fornecedores.map((f) => ({ value: f.id, label: f.razaoSocial }))}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  noneLabel="— Nenhum —"
                  placeholder="Selecionar (opcional)..."
                  createHref="/suprimentos/fornecedores/novo"
                  createParam="nome"
                  createLabel="fornecedor"
                />
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="descricao" render={({ field }) => (
              <FormItem className="col-span-2"><FormLabel>Descrição *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="categoria" render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="valorOriginal" render={({ field }) => (
              <FormItem><FormLabel>Valor (R$) *</FormLabel><FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="dataVencimento" render={({ field }) => (
              <FormItem><FormLabel>Vencimento *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="notaFiscal" render={({ field }) => (
              <FormItem><FormLabel>Nota Fiscal</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
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
