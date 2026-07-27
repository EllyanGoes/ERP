"use client";

// Edição de um título (a pagar / a receber) EM POP-UP, no mesmo padrão dos demais
// pop-ups do processo financeiro (Dialog). Corrige os dados do próprio título —
// descrição, valor, vencimento, natureza e observações — sem tocar na origem
// (material). Preserva o beneficiário (fornecedor/cliente) do título.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import { centroExigidoPelaNatureza } from "@/lib/natureza-centro";
import { cn, formatBRL } from "@/lib/utils";

export type TituloEdicao = {
  id: string;
  numero: string;
  descricao: string;
  valorOriginal: unknown;
  dataVencimento: Date | string;
  naturezaFinanceiraId?: string | null;
  observacoes?: string | null;
  centroCustoId?: string | null;
  // Beneficiário preservado (não editável aqui — a origem manda):
  fornecedorId?: string | null;
  clienteId?: string | null;
  beneficiarioTipo?: string | null;
  beneficiarioId?: string | null;
};

function toISODate(d: Date | string): string {
  if (!d) return "";
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

export default function EditarTituloDialog({ tipo, titulo, permiteCentro = false, origemInfo, onOpenChange, onSaved }: {
  tipo: "pagar" | "receber";
  titulo: TituloEdicao | null;
  // Título AVULSO (sem material): o centro de custo é editável aqui. Título de
  // material mantém o centro somente-leitura (vem do material) e este fica false.
  permiteCentro?: boolean;
  // Faixa de origem (somente leitura) no topo — mesmo padrão do modal de baixa.
  origemInfo?: { origem: string; tes: string; centro: string } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [naturezaId, setNaturezaId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [naturezas, setNaturezas] = useState<NaturezaOpt[]>([]);
  const [centros, setCentros] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const natSel = naturezas.find((n) => n.id === naturezaId) ?? null;
  const exigeCentro = permiteCentro && centroExigidoPelaNatureza(natSel);

  // Popula ao abrir.
  useEffect(() => {
    if (!titulo) return;
    setDescricao(titulo.descricao ?? "");
    setValor(String(Number(titulo.valorOriginal ?? 0)));
    setVencimento(toISODate(titulo.dataVencimento));
    setNaturezaId(titulo.naturezaFinanceiraId ?? "");
    setObservacoes(titulo.observacoes ?? "");
    setCentroCustoId(titulo.centroCustoId ?? "");
    setErro(null);
  }, [titulo]);

  useEffect(() => {
    const t = tipo === "pagar" ? "SAIDA" : "ENTRADA";
    fetch(`/api/financeiro/naturezas?tipo=${t}&ativo=1`).then((r) => r.json())
      .then((j) => setNaturezas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    if (permiteCentro) {
      fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json())
        .then((j) => setCentros(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    }
  }, [tipo, permiteCentro]);

  async function salvar() {
    if (!titulo) return;
    if (descricao.trim().length < 2) { setErro("Descrição é obrigatória."); return; }
    const v = parseFloat(String(valor).replace(",", "."));
    if (!(v > 0)) { setErro("Valor inválido."); return; }
    if (!vencimento) { setErro("Informe o vencimento."); return; }
    if (exigeCentro && !centroCustoId) { setErro("Centro de custo é obrigatório para esta natureza (despesa/CIF)."); return; }
    setSaving(true); setErro(null);
    // Corpo compatível com o schema; preserva o beneficiário do título.
    const bene = tipo === "pagar"
      ? { fornecedorId: titulo.fornecedorId ?? null, beneficiarioTipo: titulo.beneficiarioTipo ?? (titulo.fornecedorId ? "FORNECEDOR" : null), beneficiarioId: titulo.beneficiarioId ?? null }
      : { clienteId: titulo.clienteId ?? null, beneficiarioTipo: titulo.beneficiarioTipo ?? (titulo.clienteId ? "CLIENTE" : null), beneficiarioId: titulo.beneficiarioId ?? null };
    try {
      const res = await fetch(`/api/contas-${tipo}/${titulo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bene,
          descricao: descricao.trim(),
          valorOriginal: v,
          dataVencimento: vencimento,
          naturezaFinanceiraId: naturezaId || null,
          observacoes: observacoes.trim() || null,
          // Avulso: centro editável (só quando o destino é de custo). Material:
          // preserva o valor atual (não edita aqui).
          centroCustoId: permiteCentro ? (exigeCentro ? (centroCustoId || null) : null) : (titulo.centroCustoId ?? null),
        }),
      });
      if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Erro ao salvar."); return; }
      onOpenChange(false);
      onSaved();
    } catch { setErro("Erro de conexão."); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={!!titulo} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Título</DialogTitle>
          {titulo && (
            <p className="text-sm text-muted-foreground">
              {titulo.numero} — Valor: {formatBRL(Number(titulo.valorOriginal ?? 0))}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Classificação de origem (somente leitura) — mesmo padrão do modal de baixa. */}
          {origemInfo && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs grid grid-cols-3 gap-2">
              <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Origem</span><span className="text-foreground">{origemInfo.origem}</span></div>
              <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">TES</span><span className="text-foreground">{origemInfo.tes}</span></div>
              <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Centro de custo</span><span className="text-foreground">{origemInfo.centro}</span></div>
            </div>
          )}
          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1 h-9 text-right font-mono" />
            </div>
            <div>
              <Label className="text-xs">Vencimento</Label>
              <DatePicker value={vencimento} onChange={(v) => setVencimento(v)} className="mt-1 w-full" />
            </div>
          </div>
          {/* Classificação gerencial — mesma seção do modal de baixa. Centro só em
              título avulso com destino de custo (material herda da origem). */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classificação</Label>
            <div className={cn("grid gap-2", exigeCentro ? "grid-cols-2" : "grid-cols-1")}>
              <div>
                <Label className="text-xs">Natureza</Label>
                <div className="mt-1">
                  <NaturezaCombobox
                    value={naturezaId}
                    onChange={setNaturezaId}
                    naturezas={naturezas}
                    defaultTipo={tipo === "pagar" ? "SAIDA" : "ENTRADA"}
                    allowCreate
                    onCreated={(n) => setNaturezas((prev) => [...prev, n])}
                  />
                </div>
              </div>
              {exigeCentro && (
                <div>
                  <Label className="text-xs">Centro de custo</Label>
                  <div className="mt-1">
                    <ComboboxWithCreate
                      options={centros.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))}
                      value={centroCustoId}
                      onChange={setCentroCustoId}
                      placeholder="Centro de custo..."
                    />
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {permiteCentro
                ? "Beneficiário e TES vêm da origem e não são editados aqui."
                : "TES, centro de custo e beneficiário vêm do documento de origem e não são editados aqui."}
            </p>
          </div>
          <div>
            <Label>Observações</Label>
            <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="mt-1" placeholder="Opcional" />
          </div>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
