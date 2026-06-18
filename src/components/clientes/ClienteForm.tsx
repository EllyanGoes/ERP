"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { clienteSchema, type ClienteFormData } from "@/lib/validations/cliente";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import { lookupParceiro, type ParceiroLookup } from "@/lib/parceiro-lookup";

type ClienteData = { id: string } & ClienteFormData;

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-border bg-muted">
      <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">{children}</h2>
    </div>
  );
}

export default function ClienteForm({ cliente }: { cliente?: ClienteData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { replaceCurrentTab } = useTabsContext();
  useTabTitle(cliente ? (cliente.nomeFantasia || cliente.razaoSocial) : null);
  const initialNome = !cliente ? (searchParams.get("nome") ?? searchParams.get("razaoSocial") ?? "") : "";
  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente ?? {
      tipoPessoa: "JURIDICA",
      status: "ATIVO",
      ...(initialNome ? { razaoSocial: initialNome, nomeFantasia: initialNome } : {}),
    },
  });

  const tipoPessoa = form.watch("tipoPessoa");
  const [serverError, setServerError] = useState<string | null>(null);

  // Vínculo por CPF/CNPJ: se já existe um fornecedor com o mesmo doc, oferece
  // copiar os dados (evita redigitar) e sinaliza que é a mesma pessoa.
  const [fornecedorVinculo, setFornecedorVinculo] = useState<ParceiroLookup | null>(null);

  async function checkCpfCnpj(value: string) {
    const { fornecedor } = await lookupParceiro(value, { ignoreClienteId: cliente?.id });
    setFornecedorVinculo(fornecedor);
  }

  function copiarDoFornecedor() {
    const f = fornecedorVinculo;
    if (!f) return;
    const setIf = (campo: keyof ClienteFormData, valor: string | null) => {
      if (valor && !form.getValues(campo)) form.setValue(campo, valor, { shouldDirty: true });
    };
    if (f.tipoPessoa === "FISICA" || f.tipoPessoa === "JURIDICA") form.setValue("tipoPessoa", f.tipoPessoa);
    setIf("razaoSocial", f.razaoSocial);
    setIf("nomeFantasia", f.nomeFantasia);
    setIf("ie", f.ie);
    setIf("email", f.email);
    setIf("telefone", f.telefone);
    setIf("celular", f.celular);
    setIf("cep", f.cep);
    setIf("logradouro", f.logradouro);
    setIf("numero", f.numero);
    setIf("complemento", f.complemento);
    setIf("bairro", f.bairro);
    setIf("cidade", f.cidade);
    setIf("estado", f.estado);
  }

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "cliente",
    onNew: () => form.reset({ tipoPessoa: "JURIDICA", status: "ATIVO" }),
    viewHref: (id) => `/clientes/${id}`,
  });

  async function onSubmit(data: ClienteFormData) {
    setServerError(null);
    const url = cliente ? `/api/clientes/${cliente.id}` : "/api/clientes";
    const method = cliente ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (cliente) {
          replaceCurrentTab(`/clientes/${cliente.id}`);
          router.refresh();
        } else {
          confirmCreated(json.data.id);
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar cliente. Tente novamente.");
      }
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 gap-6">

        {/* ── Vínculo: já é fornecedor ────────────────────────────────────── */}
        {fornecedorVinculo && (
          <div className="rounded-lg border border-amber-300 bg-warning/10 px-4 py-3 text-sm text-warning flex items-center justify-between gap-4">
            <span>
              Este CPF/CNPJ já é um <strong>fornecedor</strong>:{" "}
              <strong>{fornecedorVinculo.nomeFantasia || fornecedorVinculo.razaoSocial}</strong>. É a mesma pessoa? Aproveite o cadastro.
            </span>
            <Button type="button" variant="outline" size="sm" className="border-amber-400 text-warning shrink-0"
              onClick={copiarDoFornecedor}>
              Copiar dados do fornecedor
            </Button>
          </div>
        )}

        {/* ── Two-column layout ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6 items-stretch flex-1">

          {/* ── LEFT: Dados Cadastrais (2/3) ─────────────────────────────── */}
          <div className="col-span-2 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <SectionTitle>Dados Cadastrais</SectionTitle>
            <div className="p-5 space-y-4">

              {/* Tipo + Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="tipoPessoa" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Tipo de Pessoa</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger className="h-10 border-border"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="JURIDICA">Pessoa Jurídica</SelectItem>
                        <SelectItem value="FISICA">Pessoa Física</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger className="h-10 border-border"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="ATIVO">Ativo</SelectItem>
                        <SelectItem value="INATIVO">Inativo</SelectItem>
                        <SelectItem value="PROSPECTO">Prospecto</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Razão Social */}
              <FormField control={form.control} name="razaoSocial" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    {tipoPessoa === "FISICA" ? "Nome Completo" : "Razão Social"} *
                  </FormLabel>
                  <FormControl><Input {...field} className="h-10 border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Nome Fantasia */}
              <FormField control={form.control} name="nomeFantasia" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    {tipoPessoa === "FISICA" ? "Apelido" : "Nome Fantasia"}
                  </FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* CNPJ + IE */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">
                      {tipoPessoa === "FISICA" ? "CPF" : "CNPJ"}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="h-10 border-border"
                        placeholder={tipoPessoa === "FISICA" ? "000.000.000-00" : "00.000.000/0001-00"}
                        onBlur={(e) => { field.onBlur(); checkCpfCnpj(e.target.value); }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="ie" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Inscrição Estadual</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Email + Telefone + Celular */}
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">E-mail</FormLabel>
                    <FormControl><Input type="email" {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telefone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Telefone</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="celular" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Celular</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </div>

          {/* ── RIGHT: Endereço + Observações (1/3) ──────────────────────── */}
          <div className="col-span-1 flex flex-col gap-6">

            {/* Endereço */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <SectionTitle>Endereço</SectionTitle>
              <div className="p-5 space-y-4">

                {/* CEP + Logradouro */}
                <div className="grid grid-cols-5 gap-3">
                  <FormField control={form.control} name="cep" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">CEP</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder="00000-000" className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="logradouro" render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Logradouro</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Número + Complemento */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="numero" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Número</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="complemento" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Complemento</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Bairro */}
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Bairro</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Cidade + UF */}
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="cidade" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">Cidade</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="estado" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-foreground uppercase tracking-wide">UF</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                        <FormControl><SelectTrigger className="h-10 border-border"><SelectValue placeholder="UF" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col flex-1">
              <SectionTitle>Observações</SectionTitle>
              <div className="p-5 flex-1 flex flex-col">
                <FormField control={form.control} name="observacoes" render={({ field }) => (
                  <FormItem className="flex-1 flex flex-col">
                    <FormControl className="flex-1">
                      <Textarea
                        {...field} value={field.value ?? ""}
                        placeholder="Observações sobre o cliente..."
                        className="resize-none border-border text-foreground placeholder:text-muted-foreground h-full min-h-[80px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Erro do servidor ──────────────────────────────────────────────── */}
        {serverError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {serverError}
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={form.formState.isSubmitting} className="font-semibold">
            {form.formState.isSubmitting ? "Salvando..." : cliente ? "Salvar Alterações" : "Criar Cliente"}
          </Button>
          <Button type="button" variant="outline" onClick={() => cliente ? replaceCurrentTab(`/clientes/${cliente.id}`) : router.back()} className="border-border text-muted-foreground">
            Cancelar
          </Button>
        </div>
      </form>
      {dialog}
    </Form>
  );
}
