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
import DatePicker from "@/components/shared/DatePicker";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";

type ClienteOption = { id: string; razaoSocial: string };
type NaturezaOption = { id: string; nome: string };
type BenTipo = "CLIENTE" | "SEM_VINCULO";

export default function ContaReceberForm({ clientes, naturezas }: { clientes: ClienteOption[]; naturezas: NaturezaOption[] }) {
  const voltar = useVoltarCriacao("/contas-receber");
  const form = useForm<ContaReceberFormData>({
    resolver: zodResolver(contaReceberSchema) as Resolver<ContaReceberFormData>,
    defaultValues: { dataVencimento: new Date().toISOString().split("T")[0] },
  });

  // Beneficiário: Cliente / Sem vínculo (rendimento, devolução de imposto). A
  // natureza define as contas contábeis.
  const [benTipo, setBenTipo] = useState<BenTipo>("CLIENTE");
  const [clienteId, setClienteId] = useState("");
  const [natureza, setNatureza] = useState("");
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
    if (!natureza) { setServerError("Selecione a natureza financeira."); return; }
    if (benTipo === "CLIENTE" && !clienteId) { setServerError("Selecione o cliente."); return; }
    const payload = {
      ...data,
      naturezaFinanceiraId: natureza,
      clienteId: benTipo === "CLIENTE" ? clienteId : null,
      beneficiarioTipo: benTipo === "CLIENTE" ? "CLIENTE" : null,
      beneficiarioId: benTipo === "CLIENTE" ? clienteId : null,
    };
    try {
      const res = await fetch("/api/contas-receber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, parcelas: Number(parcelas) || 1, intervaloDias: Number(intervaloDias) || 30 }),
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
            <FormItem className="col-span-2">
              <FormLabel>Natureza financeira *</FormLabel>
              <ComboboxWithCreate
                options={naturezas.map((n) => ({ value: n.id, label: n.nome }))}
                value={natureza} onChange={setNatureza} allowNone={false}
                placeholder="Selecionar natureza..."
              />
              <p className="text-[11px] text-muted-foreground">As contas contábeis (receita e a receber) são derivadas automaticamente da natureza.</p>
            </FormItem>

            <FormItem className="col-span-2">
              <FormLabel>Beneficiário</FormLabel>
              <div className="flex gap-2">
                {([["CLIENTE","Cliente"],["SEM_VINCULO","Sem vínculo"]] as [BenTipo,string][]).map(([v,label]) => (
                  <button key={v} type="button" onClick={() => { setBenTipo(v); setClienteId(""); }}
                    className={`flex-1 h-9 rounded-lg border text-xs font-medium transition-colors ${benTipo===v ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {benTipo === "CLIENTE" ? (
                <ComboboxWithCreate
                  options={clientes.map((c) => ({ value: c.id, label: c.razaoSocial }))}
                  value={clienteId} onChange={setClienteId} allowNone={false}
                  placeholder="Selecione o cliente..."
                  createHref="/clientes/novo" createParam="razaoSocial" createLabel="cliente"
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">Receita sem vínculo cadastral (ex.: rendimento de aplicação, devolução de imposto). A natureza define as contas.</p>
              )}
            </FormItem>
            <FormField control={form.control} name="descricao" render={({ field }) => (
              <FormItem className="col-span-2"><FormLabel>Descrição *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="valorOriginal" render={({ field }) => (
              <FormItem><FormLabel>Valor (R$) *</FormLabel><FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="dataVencimento" render={({ field }) => (
              <FormItem><FormLabel>Vencimento *</FormLabel><FormControl><DatePicker value={field.value ?? ""} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
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
              <p className="col-span-2 text-xs text-muted-foreground">
                Serão geradas {parcelas} parcelas, vencendo a cada {intervaloDias} dias a partir do vencimento informado. O valor é dividido entre elas.
              </p>
            )}
          </CardContent>
        </Card>
        {serverError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
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
