"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { concorrenteSchema, type ConcorrenteFormData } from "@/lib/validations/concorrente";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ComboboxWithCreate, { type ComboboxOption } from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Building2, Store, UserPlus, HardHat, User } from "lucide-react";

type ConcorrenteData = { id: string } & ConcorrenteFormData;

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-border bg-muted">
      <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">{children}</h2>
    </div>
  );
}

const labelCls = "text-xs font-semibold text-foreground uppercase tracking-wide";

export default function ConcorrenteForm({
  concorrente,
  onSaved,
  onCancel,
}: {
  concorrente?: ConcorrenteData;
  /** Edição: chamado após salvar com sucesso (ex.: voltar à visão read-only). */
  onSaved?: () => void;
  /** Edição: chamado ao cancelar (ex.: voltar à visão read-only). */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useTabTitle(concorrente ? (concorrente.nomeFantasia || concorrente.razaoSocial) : null);
  const initialNome = !concorrente ? (searchParams.get("nome") ?? "") : "";

  const form = useForm<ConcorrenteFormData>({
    resolver: zodResolver(concorrenteSchema),
    defaultValues: concorrente ?? {
      tipoPessoa: "JURIDICA",
      ehFornecedor: false,
      ehRevendedor: true,
      ativo: true,
      ...(initialNome ? { razaoSocial: initialNome, nomeFantasia: initialNome } : {}),
    },
  });

  const tipoPessoa = form.watch("tipoPessoa");
  const ehFornecedor = form.watch("ehFornecedor");
  const ehRevendedor = form.watch("ehRevendedor");
  const ehConstrutora = form.watch("ehConstrutora");
  const ehConsumidorFinal = form.watch("ehConsumidorFinal");
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Vincular a um cliente: no cadastro novo preenche os dados; na edição apenas
  // cria o vínculo (marca como Parceiro) sem sobrescrever o que já está preenchido.
  const editando = !!concorrente;
  const [clientes, setClientes] = useState<ComboboxOption[]>([]);
  const [clienteSel, setClienteSel] = useState(concorrente?.clienteId ?? "");

  useEffect(() => {
    // Só clientes ainda não vinculados a um concorrente (mantém o já ligado a este).
    const url = concorrente
      ? `/api/marketing/concorrentes/clientes-disponiveis?exceto=${concorrente.id}`
      : "/api/marketing/concorrentes/clientes-disponiveis";
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const lista: any[] = j.data ?? [];
        setClientes(
          lista.map((c) => {
            const nome = c.nomeFantasia || c.razaoSocial;
            const pj = c.tipoPessoa === "JURIDICA";
            return {
              value: c.id,
              label: nome,
              render: () => (
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{nome}</span>
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                    pj ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                       : "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
                  )}>
                    {pj ? "PJ" : "PF"}
                  </span>
                </span>
              ),
            };
          }),
        );
      })
      .catch(() => {});
  }, [concorrente]);

  async function importarCliente(clienteId: string) {
    setClienteSel(clienteId);
    if (!clienteId) {
      form.setValue("clienteId", null, { shouldDirty: true });
      return;
    }
    const res = await fetch(`/api/clientes/${clienteId}`);
    if (!res.ok) return;
    const { data: cli } = await res.json();
    form.setValue("clienteId", clienteId, { shouldDirty: true });
    // Na edição, não sobrescreve campos já preenchidos — só completa vazios.
    const aplica = (k: keyof ConcorrenteFormData, v: string | null) => {
      if (!v) return;
      if (editando && String(form.getValues(k) ?? "").trim() !== "") return;
      form.setValue(k, v as any, { shouldDirty: true });
    };
    if ((cli.tipoPessoa === "FISICA" || cli.tipoPessoa === "JURIDICA") && !editando) {
      form.setValue("tipoPessoa", cli.tipoPessoa);
    }
    aplica("razaoSocial", cli.razaoSocial);
    aplica("nomeFantasia", cli.nomeFantasia);
    aplica("cpfCnpj", cli.cpfCnpj);
    aplica("email", cli.email);
    aplica("telefone", cli.telefone);
    aplica("celular", cli.celular);
    aplica("cep", cli.cep);
    aplica("logradouro", cli.logradouro);
    aplica("numero", cli.numero);
    aplica("complemento", cli.complemento);
    aplica("bairro", cli.bairro);
    aplica("cidade", cli.cidade);
    aplica("estado", cli.estado);
  }

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "competidor",
    onNew: () => form.reset({ tipoPessoa: "JURIDICA", ehFornecedor: false, ehRevendedor: true, ativo: true }),
    viewHref: (id) => `/marketing/inteligencia-comercial/${id}`,
  });

  async function onSubmit(data: ConcorrenteFormData) {
    setServerError(null);
    setSaved(false);
    const url = concorrente ? `/api/marketing/concorrentes/${concorrente.id}` : "/api/marketing/concorrentes";
    const method = concorrente ? "PUT" : "POST";
    // Não enviamos lat/lng: o servidor recalcula a localização pelo endereço a
    // cada save, então atualizar o endereço move o ponto no mapa.
    const { latitude: _lat, longitude: _lng, ...payload } = data;
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (concorrente) {
          if (onSaved) {
            onSaved();
          } else {
            setSaved(true);
            router.refresh();
          }
        } else {
          confirmCreated(json.data.id);
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar competidor. Tente novamente.");
      }
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 gap-6">

        {/* ── Vínculo com cliente (Parceiro) ─────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>
            <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> {editando ? "Vínculo com cliente (Parceiro)" : "Importar de um cliente"}</span>
          </SectionTitle>
          <div className="p-5">
            <p className="text-xs text-muted-foreground mb-2">
              {editando
                ? "Se este competidor é atendido por uma empresa do grupo (está na nossa base de clientes), vincule ao cliente para marcá-lo como Parceiro. Não sobrescreve os dados já preenchidos."
                : "Esse competidor também é seu cliente? Selecione para preencher os dados automaticamente (você ajusta a categoria abaixo). Ao vincular, ele ganha a tag Parceiro."}
            </p>
            <ComboboxWithCreate
              options={clientes}
              value={clienteSel}
              onChange={importarCliente}
              placeholder="Buscar cliente cadastrado..."
              noneLabel="Sem vínculo (não é parceiro)"
            />
          </div>
        </div>

        {/* ── Categoria ──────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>Categoria do Competidor</SectionTitle>
          <div className="p-5">
            <p className="text-xs text-muted-foreground mb-3">Marque como o competidor atua. Pode ser ambos.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => form.setValue("ehFornecedor", !ehFornecedor, { shouldDirty: true })}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  ehFornecedor ? "border-amber-400 bg-amber-50 dark:bg-amber-500/15" : "border-border hover:bg-muted",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", ehFornecedor ? "bg-amber-100 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                  <Building2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Fornecedor</p>
                  <p className="text-xs text-muted-foreground">Fornece insumos/produtos ao mercado</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => form.setValue("ehRevendedor", !ehRevendedor, { shouldDirty: true })}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  ehRevendedor ? "border-blue-400 bg-blue-50 dark:bg-blue-500/15" : "border-border hover:bg-muted",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", ehRevendedor ? "bg-blue-100 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                  <Store className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Revendedor</p>
                  <p className="text-xs text-muted-foreground">Revende produtos ao consumidor</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => form.setValue("ehConstrutora", !ehConstrutora, { shouldDirty: true })}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  ehConstrutora ? "border-orange-400 bg-orange-50 dark:bg-orange-500/15" : "border-border hover:bg-muted",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", ehConstrutora ? "bg-orange-100 text-orange-600 dark:bg-orange-500/25 dark:text-orange-400" : "bg-muted text-muted-foreground")}>
                  <HardHat className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Construtora</p>
                  <p className="text-xs text-muted-foreground">Executa obras / construção</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => form.setValue("ehConsumidorFinal", !ehConsumidorFinal, { shouldDirty: true })}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  ehConsumidorFinal ? "border-violet-400 bg-violet-50 dark:bg-violet-500/15" : "border-border hover:bg-muted",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", ehConsumidorFinal ? "bg-violet-100 text-violet-600 dark:bg-violet-500/25 dark:text-violet-400" : "bg-muted text-muted-foreground")}>
                  <User className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Consumidor final</p>
                  <p className="text-xs text-muted-foreground">Compra para uso próprio</p>
                </div>
              </button>
            </div>
            {form.formState.errors.ehFornecedor && (
              <p className="text-xs text-danger mt-2">{form.formState.errors.ehFornecedor.message as string}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 items-stretch">
          {/* ── Dados cadastrais ─────────────────────────────────────────── */}
          <div className="col-span-2 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <SectionTitle>Dados Cadastrais</SectionTitle>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="tipoPessoa" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Tipo de Pessoa</FormLabel>
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
                <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>{tipoPessoa === "FISICA" ? "CPF" : "CNPJ"}</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder={tipoPessoa === "FISICA" ? "000.000.000-00" : "00.000.000/0001-00"} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="razaoSocial" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>{tipoPessoa === "FISICA" ? "Nome Completo" : "Razão Social"} *</FormLabel>
                  <FormControl><Input {...field} className="h-10 border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="nomeFantasia" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>{tipoPessoa === "FISICA" ? "Apelido" : "Nome Fantasia"}</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>E-mail</FormLabel>
                    <FormControl><Input type="email" {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="site" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Site</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="https://" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="telefone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Telefone</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="celular" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Celular</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </div>

          {/* ── Endereço ─────────────────────────────────────────────────── */}
          <div className="col-span-1 flex flex-col gap-6">
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <SectionTitle>Endereço</SectionTitle>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-5 gap-3">
                  <FormField control={form.control} name="cep" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className={labelCls}>CEP</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder="00000-000" className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="logradouro" render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel className={labelCls}>Logradouro</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="numero" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelCls}>Número</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="complemento" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelCls}>Complemento</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Bairro</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="cidade" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className={labelCls}>Cidade</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="estado" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelCls}>UF</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                        <FormControl><SelectTrigger className="h-10 border-border"><SelectValue placeholder="UF" /></SelectTrigger></FormControl>
                        <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  A localização no mapa é calculada automaticamente pelo endereço (cidade/CEP) ao salvar.
                </p>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col flex-1">
              <SectionTitle>Observações</SectionTitle>
              <div className="p-5 flex-1 flex flex-col">
                <FormField control={form.control} name="observacoes" render={({ field }) => (
                  <FormItem className="flex-1 flex flex-col">
                    <FormControl className="flex-1">
                      <Textarea {...field} value={field.value ?? ""} placeholder="Observações sobre o competidor..." className="resize-none border-border h-full min-h-[80px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground -mt-2">Contatos e canais de aquisição (WhatsApp, Instagram, loja física...) são gerenciados nas abas <b>Contatos</b> e <b>Canais</b>.</p>

        {serverError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{serverError}</div>
        )}
        {saved && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">Alterações salvas.</div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={form.formState.isSubmitting} className="font-semibold">
            {form.formState.isSubmitting ? "Salvando..." : concorrente ? "Salvar Alterações" : "Cadastrar Competidor"}
          </Button>
          {(onCancel || !concorrente) && (
            <Button type="button" variant="outline" onClick={() => (onCancel ? onCancel() : router.back())} className="border-border text-muted-foreground">
              Cancelar
            </Button>
          )}
        </div>
      </form>
      {dialog}
    </Form>
  );
}
