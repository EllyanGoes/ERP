"use client";

// Formulário de contrato — usado no CreateDrawer (novo) e na edição de minuta.
// Em contrato vigente só os campos administrativos são editáveis (o resto muda
// por aditivo); o servidor impõe a mesma regra.
import { useEffect, useMemo, useState } from "react";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDrawer } from "@/components/shared/CreateDrawer";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { cn } from "@/lib/utils";
import { INDICE, MESES, MODALIDADE, PERIODICIDADE, REAJUSTE, RENOVACAO, TIPO_CONTRATO, hojeISO, useLookups } from "@/components/contratos/comum";

export type ContratoFormValores = {
  titulo: string; tipo: string; lado: string; fornecedorId: string; clienteId: string; responsavelId: string; centroCustoId: string; naturezaFinanceiraId: string; objeto: string;
  inicio: string; fim: string; renovacao: string; renovacaoMeses: string; avisoPrevioDias: string;
  modalidade: string; valor: string; valorTotalEstimado: string; periodicidade: string; diaVencimento: string; primeiroVencimento: string;
  reajusteTipo: string; reajusteIndice: string; reajustePercentual: string; reajusteMesBase: string;
  multaRescisoria: string; garantia: string; observacoes: string; tags: string;
};
export const VALORES_VAZIOS: ContratoFormValores = {
  titulo: "", tipo: "FORNECIMENTO", lado: "DESPESA", fornecedorId: "", clienteId: "", responsavelId: "", centroCustoId: "", naturezaFinanceiraId: "", objeto: "",
  inicio: hojeISO(), fim: "", renovacao: "NENHUMA", renovacaoMeses: "12", avisoPrevioDias: "60",
  modalidade: "FIXO_MENSAL", valor: "", valorTotalEstimado: "", periodicidade: "MENSAL", diaVencimento: "", primeiroVencimento: "",
  reajusteTipo: "NENHUM", reajusteIndice: "IPCA", reajustePercentual: "", reajusteMesBase: "",
  multaRescisoria: "", garantia: "", observacoes: "", tags: "",
};
const iso = (v?: string | null) => (v ? String(v).slice(0, 10) : "");
export function valoresDeContrato(c: Record<string, unknown>): ContratoFormValores {
  const s = (k: string) => (c[k] == null ? "" : String(c[k]));
  return {
    titulo: s("titulo"), tipo: s("tipo") || "OUTRO", lado: s("lado") || "DESPESA", fornecedorId: s("fornecedorId"), clienteId: s("clienteId"), responsavelId: s("responsavelId"), centroCustoId: s("centroCustoId"), naturezaFinanceiraId: s("naturezaFinanceiraId"), objeto: s("objeto"),
    inicio: iso(s("inicio")), fim: iso(s("fim")), renovacao: s("renovacao") || "NENHUMA", renovacaoMeses: s("renovacaoMeses") || "12", avisoPrevioDias: s("avisoPrevioDias") || "60",
    modalidade: s("modalidade") || "FIXO_MENSAL", valor: s("valor"), valorTotalEstimado: s("valorTotalEstimado"), periodicidade: s("periodicidade") || "MENSAL", diaVencimento: s("diaVencimento"), primeiroVencimento: iso(s("primeiroVencimento")),
    reajusteTipo: s("reajusteTipo") || "NENHUM", reajusteIndice: s("reajusteIndice") || "IPCA", reajustePercentual: s("reajustePercentual"), reajusteMesBase: s("reajusteMesBase"),
    multaRescisoria: s("multaRescisoria"), garantia: s("garantia"), observacoes: s("observacoes"), tags: Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : "",
  };
}

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="space-y-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">{t}</h3>{children}</section>
);

export default function ContratoForm({ inicial, contratoId, somenteAdministrativo = false, onSalvo }: {
  inicial?: Partial<ContratoFormValores>; contratoId?: string; somenteAdministrativo?: boolean; onSalvo?: () => void;
}) {
  const lk = useLookups();
  const drawer = useCreateDrawer();
  const { confirmCreated, dialog } = useCreateFlow({ entity: "contrato", gender: "m", onNew: () => setV({ ...VALORES_VAZIOS }), viewHref: (id) => `/contratos/${id}` });
  const [v, setV] = useState<ContratoFormValores>({ ...VALORES_VAZIOS, ...inicial });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  const set = (k: keyof ContratoFormValores, val: string) => setV((x) => ({ ...x, [k]: val }));
  useEffect(() => { if (inicial) setV({ ...VALORES_VAZIOS, ...inicial }); }, [inicial]);
  const bloq = somenteAdministrativo;

  const contrapartes = useMemo(() => (v.lado === "RECEITA" ? lk.clientes : lk.fornecedores).map((p) => ({ value: p.id, label: p.nomeFantasia || p.razaoSocial, code: p.cpfCnpj ?? undefined })), [lk, v.lado]);

  async function salvar(ativar = false) {
    if (!v.titulo.trim()) { setErro("Informe o título."); return; }
    if (!bloq && v.lado === "DESPESA" && !v.fornecedorId) { setErro("Escolha o fornecedor."); return; }
    if (!bloq && v.lado === "RECEITA" && !v.clienteId) { setErro("Escolha o cliente."); return; }
    if (!bloq && v.renovacao === "AUTOMATICA" && !v.fim) { setErro("Renovação automática exige data de fim do período."); return; }
    setSaving(true); setErro("");
    const res = await fetch(contratoId ? `/api/contratos/${contratoId}` : "/api/contratos", { method: contratoId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...v, ativar }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar"); return; }
    if (contratoId) { onSalvo?.(); return; }
    confirmCreated(j.data?.id);
  }

  return (
    <div className="space-y-6">
      <Sec t="Identificação">
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-4"><Label>Título</Label><Input value={v.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Fornecimento de lenha — Madeireira Norte" disabled={bloq} /></div>
          <div className="col-span-2"><Label>Tipo</Label><SelectMenu value={v.tipo} onChange={(x) => set("tipo", x)} options={opts(TIPO_CONTRATO)} /></div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2"><Label>Lado</Label>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-sm w-full">
              {(["DESPESA", "RECEITA"] as const).map((l) => <button key={l} type="button" disabled={bloq} onClick={() => setV((x) => ({ ...x, lado: l, fornecedorId: "", clienteId: "" }))} className={cn("flex-1 px-3 py-1.5 rounded-md", v.lado === l ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground")}>{l === "DESPESA" ? "Pagamos (fornecedor)" : "Recebemos (cliente)"}</button>)}
            </div></div>
          <div className="col-span-4"><Label>{v.lado === "RECEITA" ? "Cliente" : "Fornecedor"}</Label>
            <ComboboxWithCreate value={v.lado === "RECEITA" ? v.clienteId : v.fornecedorId} onChange={(x) => set(v.lado === "RECEITA" ? "clienteId" : "fornecedorId", x)} allowNone={false} placeholder="Buscar…" options={contrapartes} menuMinWidth={420} disabled={bloq}
              createHref={v.lado === "RECEITA" ? "/clientes/novo" : "/suprimentos/fornecedores/novo"} createLabel={v.lado === "RECEITA" ? "Novo cliente" : "Novo fornecedor"} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Responsável (recebe alertas)</Label><SelectMenu value={v.responsavelId} onChange={(x) => set("responsavelId", x)} placeholder="Eu mesmo" options={[{ value: "", label: "— Eu mesmo —" }, ...lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))]} /></div>
          <div><Label>Centro de custo</Label><ComboboxWithCreate value={v.centroCustoId} onChange={(x) => set("centroCustoId", x)} noneLabel="Sem centro" placeholder="Centro…" options={lk.centros.map((c) => ({ value: c.id, label: c.nome, code: c.codigo }))} /></div>
          <div><Label>Natureza financeira</Label><ComboboxWithCreate value={v.naturezaFinanceiraId} onChange={(x) => set("naturezaFinanceiraId", x)} noneLabel="Sem natureza" placeholder="Natureza…" options={lk.naturezas.filter((n) => (v.lado === "RECEITA" ? n.tipo !== "DESPESA" : n.tipo !== "RECEITA")).map((n) => ({ value: n.id, label: n.nome, code: n.codigo ?? undefined }))} /></div>
        </div>
        <div><Label>Objeto</Label><Textarea rows={2} value={v.objeto} onChange={(e) => set("objeto", e.target.value)} placeholder="O que o contrato cobre (resumo da cláusula de objeto)" /></div>
      </Sec>

      <Sec t="Vigência e renovação">
        <div className="grid grid-cols-5 gap-3">
          <div><Label>Início</Label><DatePicker value={v.inicio} onChange={(x) => set("inicio", x)} disabled={bloq} /></div>
          <div><Label>Fim {v.renovacao === "AUTOMATICA" ? "do período" : ""}</Label><DatePicker value={v.fim} onChange={(x) => set("fim", x)} disabled={bloq} /></div>
          <div className="col-span-3"><Label>Renovação</Label><SelectMenu value={v.renovacao} onChange={(x) => set("renovacao", x)} options={opts(RENOVACAO)} disabled={bloq} /></div>
        </div>
        {v.renovacao === "AUTOMATICA" && (
          <div className="grid grid-cols-5 gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <div><Label>Renova por (meses)</Label><Input type="number" min={1} value={v.renovacaoMeses} onChange={(e) => set("renovacaoMeses", e.target.value)} disabled={bloq} /></div>
            <div><Label>Aviso prévio (dias)</Label><Input type="number" min={0} value={v.avisoPrevioDias} onChange={(e) => set("avisoPrevioDias", e.target.value)} disabled={bloq} /></div>
            <p className="col-span-3 text-xs text-muted-foreground self-end pb-2">O alerta para decidir sai antes da <b>janela de aviso prévio</b> (fim − dias), não do fim. Sem decisão até o fim, o sistema registra a renovação.</p>
          </div>
        )}
      </Sec>

      <Sec t="Valor e pagamento">
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2"><Label>Modalidade</Label><SelectMenu value={v.modalidade} onChange={(x) => set("modalidade", x)} options={opts(MODALIDADE)} disabled={bloq} /></div>
          {(v.modalidade === "FIXO_MENSAL" || v.modalidade === "FIXO_UNICO") && <div className="col-span-2"><Label>{v.modalidade === "FIXO_UNICO" ? "Valor total" : "Valor da parcela"}</Label><Input type="number" step="0.01" min={0} value={v.valor} onChange={(e) => set("valor", e.target.value)} disabled={bloq} /></div>}
          {v.modalidade === "FIXO_MENSAL" && <div className="col-span-2"><Label>Periodicidade</Label><SelectMenu value={v.periodicidade} onChange={(x) => set("periodicidade", x)} options={opts(PERIODICIDADE)} disabled={bloq} /></div>}
          {(v.modalidade === "ESTIMADO" || v.modalidade === "POR_MEDICAO" || v.modalidade === "POR_CONSUMO") && <div className="col-span-2"><Label>Valor total estimado (teto)</Label><Input type="number" step="0.01" min={0} value={v.valorTotalEstimado} onChange={(e) => set("valorTotalEstimado", e.target.value)} disabled={bloq} /></div>}
          <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={31} value={v.diaVencimento} onChange={(e) => set("diaVencimento", e.target.value)} placeholder="10" /></div>
          {v.modalidade === "FIXO_MENSAL" && <div><Label>1º vencimento</Label><DatePicker value={v.primeiroVencimento} onChange={(x) => set("primeiroVencimento", x)} disabled={bloq} /></div>}
        </div>
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2"><Label>Reajuste</Label><SelectMenu value={v.reajusteTipo} onChange={(x) => set("reajusteTipo", x)} options={opts(REAJUSTE)} disabled={bloq} /></div>
          {v.reajusteTipo === "INDICE" && <div><Label>Índice</Label><SelectMenu value={v.reajusteIndice} onChange={(x) => set("reajusteIndice", x)} options={opts(INDICE)} disabled={bloq} /></div>}
          {v.reajusteTipo === "PERCENTUAL" && <div><Label>% ao ano</Label><Input type="number" step="0.01" value={v.reajustePercentual} onChange={(e) => set("reajustePercentual", e.target.value)} disabled={bloq} /></div>}
          {v.reajusteTipo !== "NENHUM" && <div className="col-span-2"><Label>Mês de aniversário</Label><SelectMenu value={v.reajusteMesBase} onChange={(x) => set("reajusteMesBase", x)} placeholder="Do início" options={[{ value: "", label: "— 12 meses após o início —" }, ...MESES.map((m, i) => ({ value: String(i + 1), label: m }))]} disabled={bloq} /></div>}
        </div>
      </Sec>

      <Sec t="Garantias, multa e observações">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Multa rescisória (texto da cláusula)</Label><Input value={v.multaRescisoria} onChange={(e) => set("multaRescisoria", e.target.value)} placeholder="Ex.: 20% do saldo remanescente" /></div>
          <div><Label>Garantia</Label><Input value={v.garantia} onChange={(e) => set("garantia", e.target.value)} placeholder="Ex.: caução de R$ 5.000 / seguro-garantia" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></div>
          <div><Label>Tags (vírgula)</Label><Input value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="energia, crítico…" /></div>
        </div>
      </Sec>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        {drawer && <Button variant="outline" onClick={drawer.fechar}>Cancelar</Button>}
        {contratoId ? (
          <Button onClick={() => salvar(false)} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => salvar(false)} disabled={saving}>Salvar como minuta</Button>
            <Button onClick={() => salvar(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? "Salvando…" : "Salvar e ativar"}</Button>
          </>
        )}
      </div>
      {dialog}
    </div>
  );
}
