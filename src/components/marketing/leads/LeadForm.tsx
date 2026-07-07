"use client";

import { useState, useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema, type LeadFormData } from "@/lib/validations/marketing-lead";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ComboboxWithCreate, { type ComboboxOption } from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type Etapa = { id: string; nome: string; ordem: number; cor: string | null; ganho: boolean };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-border bg-muted">
      <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">{children}</h2>
    </div>
  );
}

const labelCls = "text-xs font-semibold text-foreground uppercase tracking-wide";

export default function LeadForm() {
  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema) as Resolver<LeadFormData>,
    defaultValues: { nome: "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [campanhas, setCampanhas] = useState<ComboboxOption[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [funis, setFunis] = useState<{ id: string; nome: string }[]>([]);

  const campanhaId = form.watch("campanhaId") ?? "";

  useEffect(() => {
    fetch("/api/marketing/campanhas?limit=100")
      .then((r) => r.json())
      .then((j) => setCampanhas((j.data ?? []).map((c: { id: string; nome: string }) => ({ value: c.id, label: c.nome }))))
      .catch(() => {});
    fetch("/api/marketing/etapas-lead")
      .then((r) => r.json())
      .then((j) => {
        const lista: Etapa[] = j.data ?? [];
        setEtapas(lista);
        // Etapa padrão: a primeira do funil
        if (lista.length > 0 && !form.getValues("etapaId")) {
          form.setValue("etapaId", lista[0].id);
        }
      })
      .catch(() => {});
    fetch("/api/marketing/funis?limit=100")
      .then((r) => r.json())
      .then((j) => setFunis(j.data ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "lead",
    onNew: () => form.reset({ nome: "", etapaId: etapas[0]?.id ?? null }),
  });

  async function onSubmit(data: LeadFormData) {
    setServerError(null);
    const payload = {
      ...data,
      email: data.email || null,
      telefone: data.telefone || null,
      empresaNome: data.empresaNome || null,
      cidade: data.cidade || null,
      estado: data.estado || null,
      valorEstimado: data.valorEstimado || null,
      campanhaId: data.campanhaId || null,
      origemLivre: data.campanhaId ? null : data.origemLivre || null,
      funilId: data.funilId || null,
      etapaId: data.etapaId || null,
      observacoes: data.observacoes || null,
    };
    try {
      const res = await fetch("/api/marketing/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        confirmCreated(json.data.id);
      } else {
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar lead. Tente novamente.");
      }
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 gap-6">
        {/* ── Identificação ─────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>Identificação</SectionTitle>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Nome *</FormLabel>
                  <FormControl><Input {...field} className="h-10 border-border" placeholder="Nome do contato" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="empresaNome" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Empresa</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="Empresa do lead (se houver)" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>E-mail</FormLabel>
                  <FormControl><Input type="email" {...field} value={field.value ?? ""} className="h-10 border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Telefone</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="(00) 00000-0000" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-3 gap-4">
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
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl><SelectTrigger className="h-10 border-border"><SelectValue placeholder="UF" /></SelectTrigger></FormControl>
                    <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>
        </div>

        {/* ── Origem e funil ────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>Origem e Funil</SectionTitle>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="campanhaId" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Campanha</FormLabel>
                  <FormControl>
                    <ComboboxWithCreate
                      options={campanhas}
                      value={field.value ?? ""}
                      onChange={(v) => field.onChange(v || null)}
                      placeholder="Selecionar campanha..."
                      noneLabel="Sem campanha (origem livre)"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {!campanhaId && (
                <FormField control={form.control} name="origemLivre" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Origem livre</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="Ex.: indicação do João, feira, balcão..." /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="etapaId" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Etapa</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl><SelectTrigger className="h-10 border-border"><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {etapas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              {funis.length > 0 && (
                <FormField control={form.control} name="funilId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelCls}>Funil</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v || null)} value={field.value ?? ""}>
                      <FormControl><SelectTrigger className="h-10 border-border"><SelectValue placeholder="Opcional" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {funis.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="valorEstimado" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Valor estimado (R$)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                      className="h-10 border-border"
                      placeholder="0,00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>
        </div>

        {/* ── Observações ───────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>Observações</SectionTitle>
          <div className="p-5">
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} placeholder="Contexto do lead, interesse, próximos passos..." className="resize-none border-border min-h-[80px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {serverError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{serverError}</div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={form.formState.isSubmitting} className="font-semibold">
            {form.formState.isSubmitting ? "Salvando..." : "Cadastrar Lead"}
          </Button>
        </div>
      </form>
      {dialog}
    </Form>
  );
}
