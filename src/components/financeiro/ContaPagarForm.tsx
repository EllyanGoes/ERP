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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { Plus, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { parseValorBR } from "@/components/pedidos-venda/PagamentosInput";

type FornecedorOption = { id: string; razaoSocial: string };
type ColaboradorOption = { id: string; nome: string };
type NaturezaOption = { id: string; nome: string; grupo?: string | null; cif?: boolean | null };
type CentroOption = { id: string; codigo: string; nome: string };
type NaturezaLinhaEdit = { naturezaFinanceiraId: string; detalhamento?: string | null; valor: number };
type ContaPagarEdit = { id: string; naturezas?: NaturezaLinhaEdit[] } & Partial<ContaPagarFormData>;
type BenTipo = "FORNECEDOR" | "COLABORADOR" | "SEM_VINCULO";
// Linha do split de naturezas (mesma estrutura do modal de baixa).
type SplitLinha = { key: string; naturezaFinanceiraId: string; detalhamento: string; valor: string };

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
  const [centroCustoId, setCentroCustoId] = useState<string>(editing?.centroCustoId ?? "");
  const [centros, setCentros] = useState<CentroOption[]>([]);
  // Split de naturezas (mesmo componente da baixa): natureza + detalhamento +
  // valor por linha. Valor vazio numa linha única = valor do título.
  const [split, setSplit] = useState<SplitLinha[]>(() => {
    const existentes = editing?.naturezas?.length
      ? editing.naturezas.map((n) => ({
          key: crypto.randomUUID(), naturezaFinanceiraId: n.naturezaFinanceiraId,
          detalhamento: n.detalhamento ?? "", valor: n.valor.toFixed(2).replace(".", ","),
        }))
      : editing?.naturezaFinanceiraId
        ? [{ key: crypto.randomUUID(), naturezaFinanceiraId: editing.naturezaFinanceiraId, detalhamento: "", valor: "" }]
        : null;
    return existentes ?? [{ key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" }];
  });
  // Lista completa p/ o combobox (código/grupo/subgrupo) — client-side, como na baixa.
  const [naturezasOpts, setNaturezasOpts] = useState<NaturezaOpt[]>([]);

  // Centro é exigido conforme o destino da 1ª natureza do split (despesa/CIF);
  // oculto p/ natureza patrimonial (imposto/empréstimo). É gerencial no título;
  // o razão segue pela natureza.
  const natureza = split[0]?.naturezaFinanceiraId ?? "";
  const natSel = naturezasOpts.find((n) => n.id === natureza) ?? naturezas.find((n) => n.id === natureza) ?? null;
  const exigeCentro = centroExigidoPelaNatureza(natSel);

  useEffect(() => {
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json())
      .then((j) => setCentros(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json())
      .then((j) => setNaturezasOpts(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, []);

  const [serverError, setServerError] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState("1");
  const [intervaloDias, setIntervaloDias] = useState("30");

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "conta",
    gender: "f",
    onNew: () => {
      form.reset({ dataVencimento: new Date().toISOString().split("T")[0] });
      setParcelas("1"); setIntervaloDias("30");
      setSplit([{ key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" }]);
      setCentroCustoId("");
    },
  });

  async function onSubmit(data: ContaPagarFormData) {
    setServerError(null);
    if (!natureza) { setServerError("Selecione a natureza financeira."); return; }
    if (benTipo === "FORNECEDOR" && !benId) { setServerError("Selecione o fornecedor."); return; }
    if (benTipo === "COLABORADOR" && !benId) { setServerError("Selecione o colaborador."); return; }
    if (exigeCentro && !centroCustoId) { setServerError("Centro de custo é obrigatório para esta natureza (despesa/CIF)."); return; }
    // Split de naturezas: linha única sem valor herda o valor do título; com
    // mais de uma linha a soma deve bater com o valor.
    const linhasValidas = split.filter((l) => l.naturezaFinanceiraId);
    const naturezasPayload = linhasValidas.map((l, i) => ({
      naturezaFinanceiraId: l.naturezaFinanceiraId,
      detalhamento: l.detalhamento.trim() || null,
      valor: linhasValidas.length === 1 && !l.valor.trim() && i === 0 ? data.valorOriginal : parseValorBR(l.valor),
    }));
    if (naturezasPayload.some((l) => !(l.valor > 0))) { setServerError("Informe o valor de cada natureza do split."); return; }
    const somaSplit = Math.round(naturezasPayload.reduce((s, l) => s + l.valor, 0) * 100) / 100;
    if (Math.abs(somaSplit - data.valorOriginal) > 0.05) {
      setServerError(`A soma das naturezas (${formatBRL(somaSplit)}) deve bater com o valor do título (${formatBRL(data.valorOriginal)}).`);
      return;
    }
    const payload = {
      ...data,
      naturezaFinanceiraId: natureza,
      naturezas: naturezasPayload,
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
            {/* ── Classificação: centro de custo + split de naturezas (mesmo
                componente da baixa). O título nasce classificado. ─────────── */}
            <FormItem className="col-span-2">
              <div className="flex items-center justify-between">
                <FormLabel>Naturezas financeiras *</FormLabel>
                <button
                  type="button"
                  onClick={() => setSplit((p) => [...p, { key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" }])}
                  className="inline-flex items-center gap-1 text-xs text-info font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar natureza
                </button>
              </div>
              <div className="space-y-2">
                {split.map((l) => (
                  <div key={l.key} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2 items-center">
                    <NaturezaCombobox
                      value={l.naturezaFinanceiraId}
                      onChange={(id) => setSplit((p) => p.map((x) => (x.key === l.key ? { ...x, naturezaFinanceiraId: id } : x)))}
                      naturezas={naturezasOpts}
                      defaultTipo="SAIDA"
                      allowCreate
                      onCreated={(n) => setNaturezasOpts((prev) => [...prev, n])}
                    />
                    <Input value={l.detalhamento} onChange={(e) => setSplit((p) => p.map((x) => (x.key === l.key ? { ...x, detalhamento: e.target.value } : x)))} placeholder="Detalhamento (opcional)" className="h-9 min-w-0" />
                    <Input value={l.valor} onChange={(e) => setSplit((p) => p.map((x) => (x.key === l.key ? { ...x, valor: e.target.value } : x)))} placeholder={split.length === 1 ? "= valor" : "0,00"} className="h-9 text-right font-mono min-w-0" />
                    <button type="button" onClick={() => setSplit((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={split.length <= 1} className="p-1.5 rounded text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">A soma das naturezas deve bater com o valor do título (linha única sem valor herda o total). As contas contábeis são derivadas da natureza.</p>
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
