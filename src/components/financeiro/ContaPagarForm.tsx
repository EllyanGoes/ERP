"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { centroExigidoPelaNatureza } from "@/lib/natureza-centro";
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
import DatePicker from "@/components/shared/DatePicker";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";

type FornecedorOption = { id: string; razaoSocial: string };
type ColaboradorOption = { id: string; nome: string };
type NaturezaOption = { id: string; nome: string; grupo?: string | null; cif?: boolean | null };
type CentroOption = { id: string; codigo: string; nome: string };
type ContaPagarEdit = { id: string } & Partial<ContaPagarFormData>;
type BenTipo = "FORNECEDOR" | "COLABORADOR" | "SEM_VINCULO";

export default function ContaPagarForm({ fornecedores, colaboradores, naturezas, editing }: {
  fornecedores: FornecedorOption[];
  colaboradores: ColaboradorOption[];
  naturezas: NaturezaOption[];
  editing?: ContaPagarEdit;
}) {
  const voltar = useVoltarCriacao("/contas-pagar");
  const router = useRouter();
  const form = useForm<ContaPagarFormData>({
    resolver: zodResolver(contaPagarSchema) as Resolver<ContaPagarFormData>,
    defaultValues: editing
      ? { ...editing }
      : { dataVencimento: new Date().toISOString().split("T")[0] },
  });

  // Beneficiário: Fornecedor / Colaborador / Sem vínculo (encargos). O vínculo
  // não decide a contabilização — quem define as contas é a natureza.
  const tipoInicial: BenTipo = editing?.beneficiarioTipo === "COLABORADOR" ? "COLABORADOR"
    : (editing?.fornecedorId || editing?.beneficiarioTipo === "FORNECEDOR") ? "FORNECEDOR" : "SEM_VINCULO";
  const [benTipo, setBenTipo] = useState<BenTipo>(tipoInicial);
  const [benId, setBenId] = useState<string>(editing?.fornecedorId || editing?.beneficiarioId || "");
  const [natureza, setNatureza] = useState<string>(editing?.naturezaFinanceiraId ?? "");
  const [centroCustoId, setCentroCustoId] = useState<string>(editing?.centroCustoId ?? "");
  const [centros, setCentros] = useState<CentroOption[]>([]);

  // Centro é exigido conforme o destino da natureza (despesa/CIF); oculto p/ natureza
  // patrimonial (imposto/empréstimo). É gerencial no título; o razão segue pela natureza.
  const natSel = naturezas.find((n) => n.id === natureza) ?? null;
  const exigeCentro = centroExigidoPelaNatureza(natSel);

  useEffect(() => {
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json())
      .then((j) => setCentros(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, []);

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
    if (!natureza) { setServerError("Selecione a natureza financeira."); return; }
    if (benTipo === "FORNECEDOR" && !benId) { setServerError("Selecione o fornecedor."); return; }
    if (benTipo === "COLABORADOR" && !benId) { setServerError("Selecione o colaborador."); return; }
    if (exigeCentro && !centroCustoId) { setServerError("Centro de custo é obrigatório para esta natureza (despesa/CIF)."); return; }
    const payload = {
      ...data,
      naturezaFinanceiraId: natureza,
      // Centro só quando o destino é de custo (despesa/CIF); patrimonial não carrega.
      centroCustoId: exigeCentro ? (centroCustoId || null) : null,
      fornecedorId: benTipo === "FORNECEDOR" ? benId : null,
      beneficiarioTipo: benTipo === "SEM_VINCULO" ? null : benTipo,
      beneficiarioId: benTipo === "SEM_VINCULO" ? null : (benId || null),
    };
    data = payload as ContaPagarFormData;
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
            <FormItem className="col-span-2">
              <FormLabel>Natureza financeira *</FormLabel>
              <ComboboxWithCreate
                options={naturezas.map((n) => ({ value: n.id, label: n.nome }))}
                value={natureza}
                onChange={setNatureza}
                allowNone={false}
                placeholder="Selecionar natureza..."
              />
              <p className="text-[11px] text-muted-foreground">As contas contábeis (despesa e a pagar) são derivadas automaticamente da natureza.</p>
            </FormItem>

            {/* Centro de custo — só quando o destino é de custo (despesa/CIF). Natureza
                patrimonial (imposto/empréstimo) não exige e o campo fica oculto. */}
            {exigeCentro && (
              <FormItem className="col-span-2">
                <FormLabel>Centro de custo *</FormLabel>
                <ComboboxWithCreate
                  options={centros.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))}
                  value={centroCustoId}
                  onChange={setCentroCustoId}
                  placeholder="Selecionar centro de custo..."
                />
                <p className="text-[11px] text-muted-foreground">Obrigatório para despesa/CIF — é a classificação gerencial do débito.</p>
              </FormItem>
            )}

            <FormItem className="col-span-2">
              <FormLabel>Beneficiário</FormLabel>
              <div className="flex gap-2">
                {([["FORNECEDOR","Fornecedor"],["COLABORADOR","Colaborador"],["SEM_VINCULO","Sem vínculo"]] as [BenTipo,string][]).map(([v,label]) => (
                  <button key={v} type="button" onClick={() => { setBenTipo(v); setBenId(""); }}
                    className={`flex-1 h-9 rounded-lg border text-xs font-medium transition-colors ${benTipo===v ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {benTipo === "FORNECEDOR" && (
                <ComboboxWithCreate
                  options={fornecedores.map((f) => ({ value: f.id, label: f.razaoSocial }))}
                  value={benId} onChange={setBenId} allowNone={false}
                  placeholder="Selecionar fornecedor..."
                  createHref="/suprimentos/fornecedores/novo" createParam="nome" createLabel="fornecedor"
                />
              )}
              {benTipo === "COLABORADOR" && (
                <ComboboxWithCreate
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))}
                  value={benId} onChange={setBenId} allowNone={false}
                  placeholder="Selecionar colaborador..."
                />
              )}
              {benTipo === "SEM_VINCULO" && (
                <p className="text-[11px] text-muted-foreground">Encargo sem vínculo cadastral (ex.: INSS patronal, FGTS). A natureza define as contas.</p>
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
