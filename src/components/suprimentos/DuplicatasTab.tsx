"use client";

import { useState, type ReactNode } from "react";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import TituloDetalhesDialog, { type TituloCampo } from "@/components/financeiro/TituloDetalhesDialog";
import type { PreviewDuplicatas } from "@/lib/duplicatas-preview";
import { FileText, Info, Lock } from "lucide-react";

// Aba "Duplicatas" do Documento de Entrada, no layout do Protheus: campos da
// negociação (condição/natureza) à ESQUERDA e a grade de títulos à DIREITA.
// Antes de concluir → PRÉVIA calculada no cliente, reagindo em tempo real à
// condição selecionada; depois de concluída → os títulos reais vinculados.

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
  headerControls?: ReactNode; // slot: Condição de Pagamento + Natureza Financeira controladas pela página
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

export default function DuplicatasTab({ titulosReais, preview, condicaoNome, fornecedorNome, concluida, headerControls }: Props) {
  const [detalhe, setDetalhe] = useState<TituloResumo | null>(null);
  const temReais = titulosReais.length > 0;

  const totalReais = titulosReais.reduce((s, t) => s + decimalToNumber(t.valorOriginal), 0);
  const totalPreview = (preview?.parcelas ?? []).reduce((s, p) => s + p.valor, 0);

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
                Os títulos já foram <b>gerados na conclusão</b> — alterar a condição de pagamento não regera títulos existentes.
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
                {titulosReais.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setDetalhe(t)}
                    className="border-b border-border last:border-0 hover:bg-muted cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-mono text-info">{t.numero}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{parcelaLabel(t.parcelaNumero, t.parcelaTotal)}</td>
                    <td className="px-4 py-2.5">{t.dataVencimento ? formatDate(t.dataVencimento) : "A combinar"}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatBRL(decimalToNumber(t.valorOriginal))}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge status={statusExibido(t)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 border-t border-border font-semibold">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase" colSpan={3}>
                    {titulosReais.length} título(s){condicaoNome ? ` · ${condicaoNome}` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatBRL(totalReais)}</td>
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
        ) : preview && preview.parcelas.length > 0 ? (
          /* ── Prévia (antes de concluir) — reage à condição selecionada ── */
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-info/5 border-b border-border">
              <span className="inline-flex items-center rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">Prévia</span>
              <span className="text-xs text-muted-foreground">
                Os títulos abaixo serão gerados na conclusão do documento{condicaoNome ? ` · ${condicaoNome}` : ""}.
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-center px-4 py-2.5 w-24">Parcela</th>
                  <th className="text-left px-4 py-2.5">Vencimento</th>
                  <th className="text-right px-4 py-2.5">Valor</th>
                </tr>
              </thead>
              <tbody>
                {preview.parcelas.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{parcelaLabel(p.parcelaNumero, p.parcelaTotal)}</td>
                    <td className="px-4 py-2.5">{p.dataVencimento ? formatDate(p.dataVencimento) : "A combinar"}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatBRL(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 border-t border-border font-semibold">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase" colSpan={2}>
                    {preview.parcelas.length} parcela(s)
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatBRL(totalPreview)}</td>
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
