"use client";

// Pagamento EM LOTE de títulos a pagar: uma data, uma forma/conta, cada título
// quitado pelo saldo integral (POST /api/contas-pagar/baixa-lote). Sem encargos
// e sem mexer na classificação já gravada. Os títulos que o servidor vai pular
// aparecem ANTES, com o motivo (mesma regra, calculada na tela).
import { useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import type { FormaOpt, ContaOpt } from "@/components/pedidos-venda/PagamentosInput";
import { FormaContaPicker, formaContaInicial, erroContaInvalida, useUltimaContaPagar } from "@/components/financeiro/PagamentoTituloForm";
import { formatBRL } from "@/lib/utils";

export type TituloLote = {
  id: string;
  numero: string;
  fornecedor: string | null;
  saldo: number;
  /** Motivo pelo qual o lote vai pular o título (null = será pago). */
  motivo: string | null;
};

type Resultado = { pagos: { id: string; numero: string }[]; ignorados: { id: string; numero: string; motivo: string }[] };

export default function PagamentoLoteDialog({
  titulos, formas, contas, onClose, onConcluido,
}: {
  titulos: TituloLote[];
  formas: FormaOpt[];
  contas: ContaOpt[];
  onClose: () => void;
  /** Chamado após o envio (houve baixa) — o pai limpa a seleção e atualiza. */
  onConcluido: () => void;
}) {
  const [ultima, setUltima] = useUltimaContaPagar();
  const ini = formaContaInicial(null, ultima, formas, contas);
  const [dataPag, setDataPag] = useState(() => new Date().toISOString().split("T")[0]);
  const [forma, setForma] = useState(ini.forma);
  const [conta, setConta] = useState(ini.conta);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const pagaveis = titulos.filter((t) => !t.motivo);
  const ignorar = titulos.filter((t) => t.motivo);
  const total = pagaveis.reduce((s, t) => s + t.saldo, 0);

  async function pagar() {
    setErro(null);
    if (!forma) { setErro("Escolha a forma de pagamento."); return; }
    if (!conta) { setErro("Escolha a conta de pagamento."); return; }
    const ruim = erroContaInvalida(forma, conta, formas, contas);
    if (ruim) { setErro(ruim); return; }
    setSaving(true);
    const res = await fetch("/api/contas-pagar/baixa-lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: pagaveis.map((t) => t.id), dataPagamento: dataPag, forma, contaBancariaId: conta }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setErro((res ? (await res.json().catch(() => ({}))).error : null) ?? "Erro ao pagar o lote.");
      return;
    }
    const j = await res.json();
    const r: Resultado = j.data ?? { pagos: [], ignorados: [] };
    // Os pulados no cliente entram no resultado também (o usuário vê tudo junto).
    setResultado({ pagos: r.pagos, ignorados: [...ignorar.map((t) => ({ id: t.id, numero: t.numero, motivo: t.motivo! })), ...r.ignorados] });
    setUltima({ forma, contaBancariaId: conta });
    if (r.pagos.length > 0) onConcluido();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{resultado ? "Resultado do pagamento em lote" : `Pagar ${titulos.length} título${titulos.length !== 1 ? "s" : ""}`}</DialogTitle>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="w-4 h-4" /> {resultado.pagos.length} título{resultado.pagos.length !== 1 ? "s" : ""} pago{resultado.pagos.length !== 1 ? "s" : ""}
              {resultado.pagos.length > 0 && <span className="text-muted-foreground font-mono text-xs truncate">· {resultado.pagos.map((p) => p.numero).join(", ")}</span>}
            </p>
            {resultado.ignorados.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-sm text-warning"><AlertTriangle className="w-4 h-4" /> {resultado.ignorados.length} não pago{resultado.ignorados.length !== 1 ? "s" : ""}</p>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border text-sm">
                  {resultado.ignorados.map((i) => (
                    <div key={i.id} className="flex gap-3 px-3 py-1.5">
                      <span className="font-mono text-xs w-20 shrink-0">{i.numero}</span>
                      <span className="text-muted-foreground text-xs">{i.motivo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              <div>
                <Label className="text-xs">Data</Label>
                <DatePicker value={dataPag} onChange={setDataPag} className="mt-1 w-full" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs">Forma e conta</Label>
                <div className="mt-1">
                  <FormaContaPicker forma={forma} conta={conta} onChange={(v) => { setForma(v.forma); setConta(v.conta); }} formas={formas} contas={contas} />
                </div>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {pagaveis.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="font-mono text-xs w-20 shrink-0">{t.numero}</span>
                  <span className="flex-1 truncate">{t.fornecedor ?? "—"}</span>
                  <span className="tabular-nums font-medium">{formatBRL(t.saldo)}</span>
                </div>
              ))}
              {pagaveis.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum título selecionado pode ser pago em lote.</p>}
            </div>

            {ignorar.length > 0 && (
              <div className="rounded-lg bg-warning/10 px-3 py-2 space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="w-3.5 h-3.5" /> {ignorar.length} título{ignorar.length !== 1 ? "s" : ""} será{ignorar.length !== 1 ? "ão" : ""} ignorado{ignorar.length !== 1 ? "s" : ""}
                </p>
                {ignorar.map((t) => (
                  <p key={t.id} className="text-xs text-muted-foreground"><span className="font-mono">{t.numero}</span> — {t.motivo}</p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Cada título é quitado pelo saldo, sem juros/multa/desconto, mantendo a natureza e o centro de custo já gravados.
              Para encargos ou parcial, pague o título individualmente.
            </p>
            {erro && <p className="text-sm text-danger">{erro}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button onClick={pagar} disabled={saving || pagaveis.length === 0}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Pagando…</> : `Pagar ${pagaveis.length} título${pagaveis.length !== 1 ? "s" : ""} · ${formatBRL(total)}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
