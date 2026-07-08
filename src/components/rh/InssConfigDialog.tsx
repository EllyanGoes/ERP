"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";
import { Loader2, Plus, Trash2, Calculator } from "lucide-react";

export type FaixaInss = { ate: number; aliquota: number };

// Cálculo progressivo: cada alíquota incide só sobre a parcela do salário dentro
// da faixa; salários acima do último limite (teto) contribuem só até ele.
export function calcularInssProgressivo(bruto: number, faixas: FaixaInss[]): number {
  const ordenadas = [...faixas].sort((a, b) => a.ate - b.ate);
  const teto = ordenadas[ordenadas.length - 1]?.ate ?? 0;
  const base = Math.min(Math.max(bruto, 0), teto);
  let inss = 0, anterior = 0;
  for (const f of ordenadas) {
    const parcela = Math.min(base, f.ate) - anterior;
    if (parcela <= 0) break;
    inss += parcela * (f.aliquota / 100);
    anterior = f.ate;
  }
  // toFixed(4) antes do round evita o ruído binário (121.575*100 → 12157.4999…).
  return Math.round(Number((inss * 100).toFixed(4))) / 100;
}

// Faixa em edição: strings pt-BR (vírgula decimal) p/ digitação livre.
type FaixaEdit = { ate: string; aliquota: string };
const paraNumero = (s: string) => { const x = parseFloat(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const paraTexto = (v: number) => String(v).replace(".", ",");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Chamado em "Salvar e calcular": o pai recalcula o INSS dos itens da folha.
  onCalcular?: (faixas: FaixaInss[]) => void;
  podeCalcular: boolean;
}

export default function InssConfigDialog({ open, onOpenChange, onCalcular, podeCalcular }: Props) {
  const [faixas, setFaixas] = useState<FaixaEdit[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [salarioTeste, setSalarioTeste] = useState("");

  useEffect(() => {
    if (!open) return;
    setCarregando(true); setErro("");
    fetch("/api/rh/inss-config")
      .then((r) => r.json())
      .then((j) => setFaixas((j.data?.faixas ?? []).map((f: FaixaInss) => ({ ate: paraTexto(f.ate), aliquota: paraTexto(f.aliquota) }))))
      .finally(() => setCarregando(false));
  }, [open]);

  function validar(): FaixaInss[] | null {
    const parsed = faixas.map((f) => ({ ate: paraNumero(f.ate), aliquota: paraNumero(f.aliquota) }));
    if (!parsed.length || parsed.some((f) => !Number.isFinite(f.ate) || f.ate <= 0 || !Number.isFinite(f.aliquota) || f.aliquota < 0 || f.aliquota > 100)) {
      setErro("Preencha limite e alíquota válidos em todas as faixas.");
      return null;
    }
    return parsed.sort((a, b) => a.ate - b.ate);
  }

  async function salvar(calcular: boolean) {
    const parsed = validar();
    if (!parsed) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/rh/inss-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faixas: parsed }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Falha ao salvar a tabela"); return; }
      if (calcular) onCalcular?.(parsed);
      onOpenChange(false);
    } finally { setSalvando(false); }
  }

  const parsedPreview = faixas.map((f) => ({ ate: paraNumero(f.ate), aliquota: paraNumero(f.aliquota) }))
    .filter((f) => Number.isFinite(f.ate) && Number.isFinite(f.aliquota));
  const teto = parsedPreview.length ? Math.max(...parsedPreview.map((f) => f.ate)) : 0;
  const salarioNum = paraNumero(salarioTeste);
  const inssTeste = Number.isFinite(salarioNum) && parsedPreview.length ? calcularInssProgressivo(salarioNum, parsedPreview) : null;

  // "Parcela a deduzir" de cada faixa (método equivalente ao progressivo:
  // INSS = base × alíquota − parcela). Depende das faixas anteriores na ordem.
  const parcelaDeduzir = (i: number): number | null => {
    const fs = faixas.map((f) => ({ ate: paraNumero(f.ate), aliquota: paraNumero(f.aliquota) }));
    if (fs.slice(0, i + 1).some((f) => !Number.isFinite(f.ate) || !Number.isFinite(f.aliquota))) return null;
    let p = 0;
    for (let k = 1; k <= i; k++) p += fs[k - 1].ate * (fs[k].aliquota - fs[k - 1].aliquota) / 100;
    return Math.round(p * 100) / 100;
  };
  const limiteAnterior = (i: number): number | null => {
    if (i === 0) return null;
    const v = paraNumero(faixas[i - 1].ate);
    return Number.isFinite(v) ? Math.round((v + 0.01) * 100) / 100 : null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-lg: o default do DialogContent é sm:max-w-sm — sem o prefixo
          sm: a classe perde e a grade das faixas estoura p/ fora do popup. */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cálculo do INSS</DialogTitle>
          <DialogDescription>
            Tabela progressiva: cada alíquota incide só sobre a parcela do salário dentro da faixa.
            O limite da última faixa é o teto de contribuição{teto > 0 ? ` (${formatBRL(teto)})` : ""}.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {erro && <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">{erro}</div>}

            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_7rem_2rem] gap-2 text-xs text-muted-foreground uppercase tracking-wide px-1">
                <span>Faixa salarial (R$)</span><span>Alíquota (%)</span><span className="text-right">Parcela a deduzir</span><span />
              </div>
              {faixas.map((f, i) => {
                const de = limiteAnterior(i);
                const parcela = parcelaDeduzir(i);
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_7rem_2rem] gap-2 items-center">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {i === 0 ? "Até" : de != null ? `De ${formatBRL(de)} até` : "De … até"}
                      </span>
                      <input
                        inputMode="decimal" value={f.ate}
                        onChange={(e) => setFaixas((fs) => fs.map((x, j) => j === i ? { ...x, ate: e.target.value } : x))}
                        className="w-full min-w-0 h-9 rounded-md border border-border bg-card px-2 text-sm text-right tabular-nums"
                      />
                    </div>
                    <input
                      inputMode="decimal" value={f.aliquota}
                      onChange={(e) => setFaixas((fs) => fs.map((x, j) => j === i ? { ...x, aliquota: e.target.value } : x))}
                      className="w-full min-w-0 h-9 rounded-md border border-border bg-card px-2 text-sm text-right tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground tabular-nums text-right">
                      {i === 0 ? "—" : parcela != null ? formatBRL(parcela) : "—"}
                    </span>
                    <button onClick={() => setFaixas((fs) => fs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger justify-self-center" title="Remover faixa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setFaixas((fs) => [...fs, { ate: "", aliquota: "" }])}>
                <Plus className="w-4 h-4 mr-1.5" /> Adicionar faixa
              </Button>
            </div>

            {/* Conferência rápida: digite um salário e veja o INSS calculado. */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Testar salário:</span>
              <input
                inputMode="decimal" value={salarioTeste} placeholder="ex.: 6000,00"
                onChange={(e) => setSalarioTeste(e.target.value)}
                className="h-9 w-32 rounded-md border border-border bg-card px-2 text-sm text-right tabular-nums"
              />
              {inssTeste !== null && <span className="text-sm font-semibold tabular-nums">INSS: {formatBRL(inssTeste)}</span>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="outline" onClick={() => salvar(false)} disabled={salvando || carregando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar tabela
          </Button>
          <Button onClick={() => salvar(true)} disabled={salvando || carregando || !podeCalcular} title={podeCalcular ? undefined : "Folha fechada — só é possível calcular em folha em revisão"}>
            <Calculator className="w-4 h-4 mr-2" /> Salvar e calcular na folha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
