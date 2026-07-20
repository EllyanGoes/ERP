"use client";

import { useState, type ReactNode } from "react";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import DatePicker from "@/components/shared/DatePicker";
import TituloDetalhesDialog, { type TituloCampo } from "@/components/financeiro/TituloDetalhesDialog";
import type { PreviewDuplicatas, ParcelaCustomRow } from "@/lib/duplicatas-preview";
import { FileText, Info, Lock, Pencil, Plus, Trash2, RotateCcw, Loader2, CheckCircle2 } from "lucide-react";

// Aba "Duplicatas" do Documento de Entrada, no layout do Protheus: campos da
// negociação (condição/natureza) à ESQUERDA e a grade de títulos à DIREITA.
// Antes de concluir → PRÉVIA calculada no cliente (editável manualmente via
// parcelasCustom); depois de concluída → os títulos reais, com ajuste de
// vencimento/valor das parcelas ainda em aberto.

export type TituloResumo = {
  id: string;
  numero: string;
  descricao: string | null;
  valorOriginal: unknown;
  valorPago: unknown;
  dataVencimento: string | null;
  dataPagamento: string | null;
  status: string;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  notaFiscal?: string | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
};

type Props = {
  titulosReais: TituloResumo[];
  preview: PreviewDuplicatas | null;
  condicaoNome: string | null;
  fornecedorNome?: string | null;
  concluida?: boolean; // documento já concluído → sem títulos não há "prévia": a conclusão não gerou financeiro
  headerControls?: ReactNode; // slot: Condição + Forma + Natureza + Pagamento já realizado (controlados pela página)
  // Grade manual (antes de concluir): estado vive na página (salvo no PATCH).
  parcelasCustom?: ParcelaCustomRow[] | null;
  onParcelasCustomChange?: (rows: ParcelaCustomRow[] | null) => void;
  // Depois de concluir: chamado após salvar ajustes nas parcelas reais (refresh).
  onGradeReaisSalva?: () => void;
};

function parcelaLabel(n: number | null, total: number | null): string {
  if (!total || total <= 1) return "Única";
  return `${n ?? 1}/${total}`;
}

// Status exibido: título em aberto sem data de vencimento ganha o status
// derivado SEM_VENCIMENTO (mesmo padrão do VENCIDA nas listagens).
function statusExibido(t: TituloResumo): string {
  if (!t.dataVencimento && (t.status === "ABERTA" || t.status === "PARCIAL")) return "SEM_VENCIMENTO";
  return t.status;
}

const parseBR = (s: string): number => {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const fmtBR = (n: number): string => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoDia = (d: Date | string | null): string | null => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

export default function DuplicatasTab({
  titulosReais, preview, condicaoNome, fornecedorNome, concluida, headerControls,
  parcelasCustom, onParcelasCustomChange, onGradeReaisSalva,
}: Props) {
  const [detalhe, setDetalhe] = useState<TituloResumo | null>(null);
  const temReais = titulosReais.length > 0;

  const totalReais = titulosReais.reduce((s, t) => s + decimalToNumber(t.valorOriginal), 0);
  const totalPreview = (preview?.parcelas ?? []).reduce((s, p) => s + p.valor, 0);

  // ── Edição da grade REAL (pós-conclusão): venc/valor das parcelas ABERTAS ──
  const [editReais, setEditReais] = useState<Record<string, { valor: string; venc: string | null }> | null>(null);
  const [salvandoReais, setSalvandoReais] = useState(false);
  const editavel = (t: TituloResumo) => t.status === "ABERTA" && decimalToNumber(t.valorPago) <= 0.005;
  const algumEditavel = titulosReais.some(editavel);
  const somaEditada = editReais
    ? titulosReais.reduce((s, t) => {
        const e = editReais[t.id];
        return s + (e ? parseBR(e.valor) : decimalToNumber(t.valorOriginal));
      }, 0)
    : totalReais;
  const divergeReais = Math.abs(somaEditada - totalReais) > 0.01;

  function iniciarEdicaoReais() {
    const init: Record<string, { valor: string; venc: string | null }> = {};
    for (const t of titulosReais) {
      if (editavel(t)) init[t.id] = { valor: fmtBR(decimalToNumber(t.valorOriginal)), venc: isoDia(t.dataVencimento) };
    }
    setEditReais(init);
  }

  async function salvarGradeReais() {
    if (!editReais) return;
    setSalvandoReais(true);
    try {
      for (const t of titulosReais) {
        const e = editReais[t.id];
        if (!e) continue;
        const novoValor = parseBR(e.valor);
        const mudouValor = Math.abs(novoValor - decimalToNumber(t.valorOriginal)) > 0.005;
        const mudouVenc = (e.venc ?? null) !== isoDia(t.dataVencimento);
        if (!mudouValor && !mudouVenc) continue;
        const res = await fetch(`/api/contas-pagar/${t.id}/ajustar-parcela`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(mudouValor ? { valorOriginal: novoValor } : {}),
            ...(mudouVenc ? { dataVencimento: e.venc } : {}),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(`${t.numero}: ${d.error ?? "não foi possível ajustar."}`);
          setSalvandoReais(false);
          return;
        }
      }
      setEditReais(null);
      onGradeReaisSalva?.();
    } finally {
      setSalvandoReais(false);
    }
  }

  // ── Grade manual da PRÉVIA ─────────────────────────────────────────────────
  const custom = !!(parcelasCustom && parcelasCustom.length > 0);
  const somaCustom = (parcelasCustom ?? []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const restanteEsperado = preview?.restante ?? 0;
  const divergeCustom = custom && Math.abs(somaCustom - restanteEsperado) > 0.01;

  function iniciarGradeManual() {
    if (!preview || !onParcelasCustomChange) return;
    onParcelasCustomChange(preview.parcelas.map((p) => ({ valor: p.valor, dataVencimento: isoDia(p.dataVencimento) })));
  }
  function setCustomRow(i: number, patch: Partial<ParcelaCustomRow>) {
    if (!parcelasCustom || !onParcelasCustomChange) return;
    onParcelasCustomChange(parcelasCustom.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* ── Esquerda: campos da negociação (estilo Protheus) ─────────────── */}
      {headerControls && (
        <div className="lg:w-80 shrink-0 space-y-3">
          {headerControls}
          {temReais && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>
                Os títulos já foram <b>gerados na conclusão</b> — alterar a condição de pagamento não regera títulos existentes. Vencimento e valor das parcelas em aberto podem ser ajustados em <b>Editar grade</b>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Direita: títulos que serão criados / já criados ──────────────── */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Banner de bloqueio (só relevante na prévia) */}
        {!temReais && preview?.bloqueio === "PA" && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-300/50 rounded-lg p-3 text-sm">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-amber-800 dark:text-amber-200">
              <b>Pagamento antecipado (PA):</b> os títulos deste documento nascem já no <b>Pedido de Compra</b>, antes da entrada. Não serão gerados novos títulos na conclusão.
            </p>
          </div>
        )}
        {!temReais && preview?.bloqueio === "INTRAGRUPO" && (
          <div className="flex items-start gap-2 bg-info/10 border border-info/20 rounded-lg p-3 text-sm text-info">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Pedido <b>intragrupo</b>: não gera contas a pagar neste documento (o financeiro é espelhado entre as empresas).</p>
          </div>
        )}
        {!temReais && preview?.bloqueio === "SEM_FORNECEDOR" && (
          <div className="flex items-start gap-2 bg-muted border border-border rounded-lg p-3 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Informe o <b>fornecedor</b> para calcular os títulos a pagar deste documento.</p>
          </div>
        )}

        {temReais ? (
          /* ── Títulos reais (documento concluído) ─────────────────────── */
          <div className="rounded-xl border border-border overflow-hidden">
            {algumEditavel && (
              <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/60 border-b border-border">
                <span className="text-xs text-muted-foreground">
                  {editReais ? "Ajuste vencimento/valor das parcelas em aberto — parcelas pagas ficam travadas." : "Grade gerada na conclusão."}
                </span>
                {editReais ? (
                  <span className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditReais(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button
                      type="button"
                      onClick={salvarGradeReais}
                      disabled={salvandoReais}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {salvandoReais ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Salvar grade
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={iniciarEdicaoReais}
                    className="inline-flex items-center gap-1 text-xs text-info hover:underline"
                  >
                    <Pencil className="w-3 h-3" /> Editar grade
                  </button>
                )}
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Nº Título</th>
                  <th className="text-center px-4 py-2.5 w-24">Parcela</th>
                  <th className="text-left px-4 py-2.5">Vencimento</th>
                  <th className="text-right px-4 py-2.5">Valor</th>
                  <th className="text-center px-4 py-2.5 w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {titulosReais.map((t) => {
                  const e = editReais?.[t.id];
                  return (
                    <tr
                      key={t.id}
                      onClick={() => !editReais && setDetalhe(t)}
                      className={cn("border-b border-border last:border-0", !editReais && "hover:bg-muted cursor-pointer")}
                    >
                      <td className="px-4 py-2.5 font-mono text-info">{t.numero}</td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">{parcelaLabel(t.parcelaNumero, t.parcelaTotal)}</td>
                      <td className="px-4 py-2.5">
                        {e ? (
                          <DatePicker value={e.venc ?? ""} onChange={(v: string) => setEditReais((prev) => prev ? { ...prev, [t.id]: { ...prev[t.id], venc: v || null } } : prev)} triggerClassName="h-8" />
                        ) : t.dataVencimento ? formatDate(t.dataVencimento) : "A combinar"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {e ? (
                          <input
                            value={e.valor}
                            onChange={(ev) => setEditReais((prev) => prev ? { ...prev, [t.id]: { ...prev[t.id], valor: ev.target.value } } : prev)}
                            onBlur={() => setEditReais((prev) => prev ? { ...prev, [t.id]: { ...prev[t.id], valor: fmtBR(parseBR(prev[t.id].valor)) } } : prev)}
                            className="w-28 h-8 rounded-md border border-input bg-background px-2 text-right text-sm"
                            inputMode="decimal"
                          />
                        ) : formatBRL(decimalToNumber(t.valorOriginal))}
                      </td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={statusExibido(t)} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 border-t border-border font-semibold">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase" colSpan={3}>
                    {titulosReais.length} título(s){condicaoNome ? ` · ${condicaoNome}` : ""}
                    {editReais && divergeReais && (
                      <span className="ml-2 normal-case font-normal text-amber-600 dark:text-amber-400">
                        soma difere do original ({formatBRL(totalReais)}) — o total deixa de bater com a entrada
                      </span>
                    )}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right", editReais && divergeReais && "text-amber-600 dark:text-amber-400")}>
                    {formatBRL(editReais ? somaEditada : totalReais)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : concluida && !preview?.bloqueio ? (
          /* ── Concluído sem títulos vinculados (fluxo antigo/sem financeiro) ── */
          <div className="flex items-start gap-2 bg-muted border border-border rounded-lg p-4 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Documento <b>concluído sem títulos a pagar vinculados</b> — a conclusão não gerou financeiro (fluxo antigo, sem fornecedor ou sem valor). Se o pagamento existe, ele foi lançado direto no Contas a Pagar, sem vínculo com este documento.
            </p>
          </div>
        ) : preview && (preview.parcelas.length > 0 || preview.entradaPaga) ? (
          /* ── Prévia (antes de concluir) — reage à condição selecionada ── */
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-info/5 border-b border-border">
              <span className="inline-flex items-center rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">Prévia</span>
              {custom && (
                <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Manual</span>
              )}
              <span className="text-xs text-muted-foreground flex-1">
                Os títulos abaixo serão gerados na conclusão do documento{condicaoNome && !custom ? ` · ${condicaoNome}` : ""}.
              </span>
              {onParcelasCustomChange && (custom ? (
                <button type="button" onClick={() => onParcelasCustomChange(null)} className="inline-flex items-center gap-1 text-xs text-info hover:underline shrink-0">
                  <RotateCcw className="w-3 h-3" /> Recalcular pela condição
                </button>
              ) : preview.parcelas.length > 0 ? (
                <button type="button" onClick={iniciarGradeManual} className="inline-flex items-center gap-1 text-xs text-info hover:underline shrink-0">
                  <Pencil className="w-3 h-3" /> Editar grade
                </button>
              ) : null)}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-center px-4 py-2.5 w-24">Parcela</th>
                  <th className="text-left px-4 py-2.5">Vencimento</th>
                  <th className="text-right px-4 py-2.5">Valor</th>
                  {custom && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {/* Entrada já paga — vira título QUITADO na conclusão */}
                {preview.entradaPaga && (
                  <tr className="border-b border-border bg-success/5 text-success">
                    <td className="px-4 py-2.5 text-center text-xs font-semibold uppercase">Entrada</td>
                    <td className="px-4 py-2.5">
                      Paga{preview.entradaPaga.data ? ` em ${formatDate(preview.entradaPaga.data)}` : ""} — título nasce quitado
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatBRL(preview.entradaPaga.valor)}</td>
                    {custom && <td />}
                  </tr>
                )}
                {custom
                  ? (parcelasCustom ?? []).map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{parcelaLabel(parcelasCustom!.length > 1 ? i + 1 : null, parcelasCustom!.length > 1 ? parcelasCustom!.length : null)}</td>
                        <td className="px-4 py-2">
                          <DatePicker value={p.dataVencimento ?? ""} onChange={(v: string) => setCustomRow(i, { dataVencimento: v || null })} triggerClassName="h-8" />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <ValorInput valor={p.valor} onCommit={(v) => setCustomRow(i, { valor: v })} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => onParcelasCustomChange!(parcelasCustom!.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-destructive"
                            title="Remover parcela"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  : preview.parcelas.map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{parcelaLabel(p.parcelaNumero, p.parcelaTotal)}</td>
                        <td className="px-4 py-2.5">{p.dataVencimento ? formatDate(p.dataVencimento) : "A combinar"}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatBRL(p.valor)}</td>
                      </tr>
                    ))}
                {custom && (
                  <tr>
                    <td colSpan={4} className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => onParcelasCustomChange!([...(parcelasCustom ?? []), { valor: 0, dataVencimento: null }])}
                        className="inline-flex items-center gap-1 text-xs text-info hover:underline"
                      >
                        <Plus className="w-3 h-3" /> Parcela
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 border-t border-border font-semibold">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase" colSpan={2}>
                    {(custom ? parcelasCustom!.length : preview.parcelas.length)} parcela(s)
                    {divergeCustom && (
                      <span className="ml-2 normal-case font-normal text-amber-600 dark:text-amber-400">
                        soma {formatBRL(somaCustom)} ≠ a parcelar {formatBRL(restanteEsperado)} — ajuste antes de concluir
                      </span>
                    )}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right", divergeCustom && "text-amber-600 dark:text-amber-400")}>
                    {formatBRL(custom ? somaCustom : totalPreview)}
                  </td>
                  {custom && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ── Vazio (sem bloqueio e sem valor) ────────────────────────── */
          !preview?.bloqueio && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <FileText className="w-8 h-8 opacity-40" />
              <p className="text-sm">Sem valor a pagar — informe os itens e a condição de pagamento para ver as duplicatas.</p>
            </div>
          )
        )}
      </div>

      {/* Popup de detalhes do título real */}
      {detalhe && (
        <TituloDetalhesDialog
          open={!!detalhe}
          onOpenChange={(o) => !o && setDetalhe(null)}
          numero={detalhe.numero}
          status={statusExibido(detalhe)}
          criadoPor={detalhe.criadoPor}
          atualizadoPor={detalhe.atualizadoPor}
          campos={buildCampos(detalhe, fornecedorNome)}
          acoes={[]}
        />
      )}
    </div>
  );
}

// Input de valor BR (edita como texto, commita número no blur).
function ValorInput({ valor, onCommit }: { valor: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <input
      value={txt ?? fmtBR(valor)}
      onChange={(e) => setTxt(e.target.value)}
      onFocus={() => setTxt(fmtBR(valor))}
      onBlur={() => { if (txt != null) onCommit(parseBR(txt)); setTxt(null); }}
      className="w-28 h-8 rounded-md border border-input bg-background px-2 text-right text-sm"
      inputMode="decimal"
    />
  );
}

function buildCampos(t: TituloResumo, fornecedorNome?: string | null): TituloCampo[] {
  const valor = decimalToNumber(t.valorOriginal);
  const pago = decimalToNumber(t.valorPago);
  const campos: TituloCampo[] = [];
  if (fornecedorNome) campos.push({ label: "Fornecedor", valor: fornecedorNome, full: true });
  if (t.descricao) campos.push({ label: "Descrição", valor: t.descricao, full: true });
  campos.push({ label: "Parcela", valor: parcelaLabel(t.parcelaNumero, t.parcelaTotal) });
  campos.push({ label: "Vencimento", valor: t.dataVencimento ? formatDate(t.dataVencimento) : "A combinar" });
  campos.push({ label: "Valor", valor: formatBRL(valor) });
  campos.push({ label: "Pago", valor: pago > 0 ? formatBRL(pago) : "—" });
  if (t.dataPagamento) campos.push({ label: "Pagamento", valor: formatDate(t.dataPagamento) });
  if (t.notaFiscal) campos.push({ label: "Nota Fiscal", valor: t.notaFiscal });
  return campos;
}
