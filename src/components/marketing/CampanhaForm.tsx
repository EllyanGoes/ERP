"use client";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  campanhaSchema,
  type CampanhaFormData,
  PLATAFORMAS_CAMPANHA,
} from "@/lib/validations/marketing-campanha";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import DatePicker from "@/components/shared/DatePicker";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { cn } from "@/lib/utils";
import { Link2 } from "lucide-react";

// Rótulos amigáveis e cores das badges por plataforma — usados também nas
// listas de campanhas e leads.
export const PLATAFORMA_LABELS: Record<string, string> = {
  META: "Meta Ads",
  GOOGLE: "Google Ads",
  TIKTOK: "TikTok Ads",
  ORGANICO: "Orgânico",
  INDICACAO: "Indicação",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

export const PLATAFORMA_BADGE: Record<string, string> = {
  META: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  GOOGLE: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  TIKTOK: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400",
  ORGANICO: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  INDICACAO: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  WHATSAPP: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  OUTRO: "bg-muted text-muted-foreground",
};

export type CampanhaData = { id: string } & CampanhaFormData;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-border bg-muted">
      <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">{children}</h2>
    </div>
  );
}

const labelCls = "text-xs font-semibold text-foreground uppercase tracking-wide";

// Datas do servidor podem vir como ISO datetime — o DatePicker trabalha com "YYYY-MM-DD".
function soData(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : "";
}

export default function CampanhaForm({
  campanha,
  onSaved,
  onCancel,
}: {
  campanha?: CampanhaData;
  /** Edição: chamado após salvar com sucesso. */
  onSaved?: () => void;
  /** Edição: chamado ao cancelar. */
  onCancel?: () => void;
}) {
  const editando = !!campanha;
  const defaults: CampanhaFormData = campanha
    ? { ...campanha, dataInicio: soData(campanha.dataInicio), dataFim: soData(campanha.dataFim) }
    : { nome: "", plataforma: "", ativo: true };

  const form = useForm<CampanhaFormData>({
    resolver: zodResolver(campanhaSchema) as Resolver<CampanhaFormData>,
    defaultValues: defaults,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const ativo = form.watch("ativo");

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "campanha",
    gender: "f",
    onNew: () => form.reset({ nome: "", plataforma: "", ativo: true }),
  });

  async function onSubmit(data: CampanhaFormData) {
    setServerError(null);
    const payload = {
      ...data,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
      idExterno: data.idExterno?.trim() || null,
      orcamento: data.orcamento || null,
      dataInicio: data.dataInicio || null,
      dataFim: data.dataFim || null,
      observacoes: data.observacoes || null,
    };
    const url = campanha ? `/api/marketing/campanhas/${campanha.id}` : "/api/marketing/campanhas";
    try {
      const res = await fetch(url, {
        method: campanha ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (campanha) onSaved?.();
        else confirmCreated(json.data.id);
      } else {
        const json = await res.json().catch(() => ({}));
        setServerError(json.error ?? "Erro ao salvar campanha. Tente novamente.");
      }
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 gap-6">
        {/* ── Dados da campanha ─────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>Dados da Campanha</SectionTitle>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className={labelCls}>Nome *</FormLabel>
                  <FormControl><Input {...field} className="h-10 border-border" placeholder="Ex.: Bloco estrutural — Julho" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="plataforma" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Plataforma *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl><SelectTrigger className="h-10 border-border"><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {PLATAFORMAS_CAMPANHA.map((p) => (
                        <SelectItem key={p} value={p}>{PLATAFORMA_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="orcamento" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Orçamento (R$)</FormLabel>
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
              <FormField control={form.control} name="dataInicio" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Início</FormLabel>
                  <FormControl><DatePicker value={field.value ?? ""} onChange={field.onChange} className="w-full" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dataFim" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Fim</FormLabel>
                  <FormControl><DatePicker value={field.value ?? ""} onChange={field.onChange} className="w-full" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {editando && (
              <button
                type="button"
                onClick={() => form.setValue("ativo", !ativo, { shouldDirty: true })}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  ativo !== false
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", ativo !== false ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                {ativo !== false ? "Campanha ativa" : "Campanha inativa"}
              </button>
            )}
          </div>
        </div>

        {/* ── Atribuição (UTM) ──────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>
            <span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4" /> Atribuição (UTM)</span>
          </SectionTitle>
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              Parâmetros usados nos links da campanha para atribuir a origem dos leads
              (ex.: source <b>facebook</b>, medium <b>cpc</b>, campaign <b>bloco-julho</b>).
              O botão &quot;copiar link&quot; da lista monta a URL com estes valores.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="utmSource" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>utm_source</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="facebook" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="utmMedium" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>utm_medium</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="cpc" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="utmCampaign" render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>utm_campaign</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} className="h-10 border-border" placeholder="bloco-julho" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="idExterno" render={({ field }) => (
              <FormItem>
                <FormLabel className={labelCls}>ID da campanha na plataforma</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} className="h-10 border-border font-mono" placeholder="Ex.: 120210000000000000" />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Necessário para importar investimento/métricas automaticamente
                  (Meta/Google/TikTok — configure as credenciais em Integrações).
                </p>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {/* ── Observações ───────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <SectionTitle>Observações</SectionTitle>
          <div className="p-5">
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} placeholder="Observações sobre a campanha..." className="resize-none border-border min-h-[80px]" />
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
            {form.formState.isSubmitting ? "Salvando..." : campanha ? "Salvar Alterações" : "Cadastrar Campanha"}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="border-border text-muted-foreground">
              Cancelar
            </Button>
          )}
        </div>
      </form>
      {dialog}
    </Form>
  );
}
