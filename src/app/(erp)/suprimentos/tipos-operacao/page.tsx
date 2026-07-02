"use client";

// Cadastro de TES (Tipos de Entrada e Saída): preset de COMPORTAMENTO operacional
// que preenche as flags da linha da nota. NÃO decide destino de custo nem carrega
// conta contábil — o destino sai da precedência do material lendo o centro (e o bem).
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscToClose } from "@/lib/use-esc-to-close";

type Local = { id: string; nome: string };
type Centro = { id: string; codigo: string; nome: string };
type Tes = {
  id: string; codigo: string; nome: string; sentido: string;
  estocavel: boolean; almoxarifadoDefaultId: string | null; compoeCusto: boolean;
  permiteCapitalizar: boolean; geraFinanceiro: boolean; geraFiscal: boolean;
  cfop: string | null; naturezaFiscal: string | null; centroCustoSugeridoId: string | null;
  ativo: boolean;
  almoxarifadoDefault?: Local | null; centroCustoSugerido?: Centro | null;
};

type FormState = {
  codigo: string; nome: string; sentido: "ENTRADA" | "SAIDA";
  estocavel: boolean; almoxarifadoDefaultId: string; compoeCusto: boolean;
  permiteCapitalizar: boolean; geraFinanceiro: boolean; geraFiscal: boolean;
  cfop: string; naturezaFiscal: string; centroCustoSugeridoId: string;
};

const empty = (): FormState => ({
  codigo: "", nome: "", sentido: "ENTRADA",
  estocavel: true, almoxarifadoDefaultId: "", compoeCusto: false,
  permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true,
  cfop: "", naturezaFiscal: "", centroCustoSugeridoId: "",
});

export default function TiposOperacaoPage() {
  const [rows, setRows] = useState<Tes[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suprimentos/tipos-operacao");
    setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque?ativo=true").then((r) => r.json())
      .then((j) => setLocais(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json())
      .then((j) => setCentros(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, []);

  const startNew = () => { setForm(empty()); setEditingId("new"); setError(null); };
  const startEdit = (r: Tes) => {
    setForm({
      codigo: r.codigo, nome: r.nome, sentido: r.sentido === "SAIDA" ? "SAIDA" : "ENTRADA",
      estocavel: r.estocavel, almoxarifadoDefaultId: r.almoxarifadoDefaultId ?? "",
      compoeCusto: r.compoeCusto, permiteCapitalizar: r.permiteCapitalizar,
      geraFinanceiro: r.geraFinanceiro, geraFiscal: r.geraFiscal,
      cfop: r.cfop ?? "", naturezaFiscal: r.naturezaFiscal ?? "",
      centroCustoSugeridoId: r.centroCustoSugeridoId ?? "",
    });
    setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };
  useEscToClose(cancel, editingId !== null);

  const save = async () => {
    setSaving(true); setError(null);
    const url = editingId === "new" ? "/api/suprimentos/tipos-operacao" : `/api/suprimentos/tipos-operacao/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Tes) => {
    await fetch(`/api/suprimentos/tipos-operacao/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  return (
    <div>
      <PageHeader title="Tipos de Entrada e Saída (TES)"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cadastros" }, { label: "TES" }]} />
      <div className="px-8 pb-8 max-w-4xl space-y-6">
        <div className="flex items-start gap-3 bg-info/10 border border-info/20 rounded-xl p-4 text-sm text-info">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>O TES carrega o <b>comportamento</b> da operação e preenche as flags da linha. Ele <b>não decide destino de custo</b> — o destino continua saindo da precedência do material (centro de custo e, quando capitaliza, o bem).</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{rows.length} TES cadastrado(s)</p>
          <Button size="sm" onClick={startNew} disabled={editingId !== null}><Plus className="w-4 h-4 mr-1" /> Novo TES</Button>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3">Código / Nome</th>
                <th className="text-left px-4 py-3">Sentido</th>
                <th className="text-left px-4 py-3">Comportamento</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground/60" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground text-xs">Nenhum TES cadastrado</td></tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-border last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-info/10" : "hover:bg-muted")}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold">{r.codigo}</span>
                      <span className="block text-foreground">{r.nome}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.sentido === "SAIDA" ? "Saída (RM)" : "Entrada (DE)"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.estocavel && <Tag>Estocável</Tag>}
                        {r.compoeCusto && <Tag>Compõe custo</Tag>}
                        {r.permiteCapitalizar && <Tag amber>Permite capitalizar</Tag>}
                        {r.geraFinanceiro && <Tag>Financeiro</Tag>}
                        {r.geraFiscal && <Tag>Fiscal{r.cfop ? ` ${r.cfop}` : ""}</Tag>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>
                        {r.ativo ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground/60" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {editingId === r.id ? null : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(r)} disabled={editingId !== null}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pop-up de cadastro/edição do TES */}
      {editingId !== null && (
        <div className="fixed inset-0 z-[9000] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10" onClick={cancel}>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <TesForm form={form} setForm={setForm} saving={saving} error={error} onSave={save} onCancel={cancel} locais={locais} centros={centros} isNew={editingId === "new"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ children, amber }: { children: React.ReactNode; amber?: boolean }) {
  return <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
    amber ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>{children}</span>;
}

function TesForm({ form, setForm, saving, error, onSave, onCancel, locais, centros, isNew }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean; error: string | null; onSave: () => void; onCancel: () => void;
  locais: Local[]; centros: Centro[]; isNew?: boolean;
}) {
  const setStr = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setBool = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.checked }));
  const check = (k: keyof FormState, label: string, hint?: string) => (
    <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5 cursor-pointer">
      <input type="checkbox" checked={form[k] as boolean} onChange={setBool(k)} className="mt-0.5 w-4 h-4 rounded border-border" />
      <span className="text-sm"><span className="font-medium text-foreground">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </label>
  );

  return (
    <div className={cn("rounded-xl border border-info/30 bg-card p-5 space-y-4", isNew && "mb-2")}>
      <p className="text-sm font-semibold text-foreground">{isNew ? "Novo TES" : "Editar TES"}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Código *</label>
          <Input value={form.codigo} onChange={setStr("codigo")} placeholder="Ex.: 1102" autoFocus={isNew} /></div>
        <div className="md:col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1 block">Nome *</label>
          <Input value={form.nome} onChange={setStr("nome")} placeholder="Ex.: Compra para estoque" /></div>
        <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Sentido</label>
          <select value={form.sentido} onChange={setStr("sentido")} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm">
            <option value="ENTRADA">Entrada (DE)</option>
            <option value="SAIDA">Saída (RM)</option>
          </select></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {check("estocavel", "Movimenta estoque", "Estocável: entra no estoque. Senão, consumo/serviço direto.")}
        {check("compoeCusto", "Compõe custo", "Candidato a material direto do produto (PEP-MD).")}
        {check("permiteCapitalizar", "Permite capitalizar", "Habilita o degrau capitaliza na linha (não obriga).")}
        {check("geraFinanceiro", "Gera financeiro", "A operação gera título financeiro.")}
        {check("geraFiscal", "Gera fiscal", "A operação tem eixo fiscal (CFOP).")}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={cn(!form.estocavel && "opacity-50")}><label className="text-xs font-medium text-muted-foreground mb-1 block">Almoxarifado padrão</label>
          <select value={form.almoxarifadoDefaultId} onChange={setStr("almoxarifadoDefaultId")} disabled={!form.estocavel} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm">
            <option value="">—</option>
            {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select></div>
        <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Centro sugerido</label>
          <select value={form.centroCustoSugeridoId} onChange={setStr("centroCustoSugeridoId")} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm">
            <option value="">—</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo} - {c.nome}</option>)}
          </select></div>
        <div className={cn(!form.geraFiscal && "opacity-50")}><label className="text-xs font-medium text-muted-foreground mb-1 block">CFOP</label>
          <Input value={form.cfop} onChange={setStr("cfop")} disabled={!form.geraFiscal} placeholder="Ex.: 1102" /></div>
        <div className={cn(!form.geraFiscal && "opacity-50")}><label className="text-xs font-medium text-muted-foreground mb-1 block">Natureza fiscal</label>
          <Input value={form.naturezaFiscal} onChange={setStr("naturezaFiscal")} disabled={!form.geraFiscal} placeholder="Descrição fiscal" /></div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />} Salvar
        </Button>
      </div>
    </div>
  );
}
