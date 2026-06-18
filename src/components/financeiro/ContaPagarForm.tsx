"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contaPagarSchema, type ContaPagarFormData } from "@/lib/validations/financeiro";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";

type FornecedorOption = { id: string; razaoSocial: string };
type ContaPagarEdit = { id: string } & Partial<ContaPagarFormData>;
const CATEGORIAS = ["Aluguel","Energia","Água","Internet","Folha de Pagamento","Impostos","Fornecedores","Marketing","Outros"];

export default function ContaPagarForm({ fornecedores, editing }: { fornecedores: FornecedorOption[]; editing?: ContaPagarEdit }) {
  const voltar = useVoltarCriacao("/contas-pagar");
  const router = useRouter();
  const form = useForm<ContaPagarFormData>({
    resolver: zodResolver(contaPagarSchema) as Resolver<ContaPagarFormData>,
    defaultValues: editing
      ? { ...editing }
      : { dataVencimento: new Date().toISOString().split("T")[0] },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState("1");
  const [intervaloDias, setIntervaloDias] = useState("30");

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "conta",
    gender: "f",
    onNew: () => { form.reset({ dataVencimento: new Date().toISOString().split("T")[0] }); setParcelas("1"); setIntervaloDias("30"); },
  });

  async function onSubmit(data: ContaPagarFormData) {
    setServerError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/contas-pagar/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) { router.push("/contas-pagar"); router.refresh(); return; }
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar alterações.");
        return;
      }
      const res = await fetch("/api/contas-pagar", {
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
            <FormField control={form.control} name="fornecedorId" render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Fornecedor *</FormLabel>
                <ComboboxWithCreate
                  options={fornecedores.map((f) => ({ value: f.id, label: f.razaoSocial }))}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  noneLabel="— Nenhum —"
                  placeholder="Selecionar fornecedor..."
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
        {!editing && (
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
              <p className="col-span-2 text-xs text-muted-foreground">
                Serão geradas {parcelas} parcelas, vencendo a cada {intervaloDias} dias a partir do vencimento informado. O valor é dividido entre elas.
              </p>
            )}
          </CardContent>
        </Card>
        )}
        {serverError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {serverError}
          </div>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Salvando..." : editing ? "Salvar alterações" : "Criar Conta"}</Button>
          <Button type="button" variant="outline" onClick={voltar}>Cancelar</Button>
        </div>
      </form>
      {dialog}
    </Form>
  );
}
