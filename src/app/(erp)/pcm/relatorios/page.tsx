"use client";

// Relatórios da Manutenção no período (OS concluídas): custo por ativo / centro de
// custo / tipo / equipe, Pareto de falhas (sintoma × causa) e horas por executante.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import DatePicker from "@/components/shared/DatePicker";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { brl, fmtHoras } from "@/components/manutencao/comum";

type Linha = { chave: string; rotulo: string; os: number; maoObra: number; material: number; terceiros: number; total: number; link?: string };
type Dados = {
  totalOs: number; total: number; porAtivo: Linha[]; porCentro: Linha[]; porTipo: Linha[]; porEquipe: Linha[];
  pareto: { sintoma: string; causa: string; ocorrencias: number; acumulado: number }[]; totalFalhas: number;
  produtividade: { nome: string; horas: number; os: number; ocupacao: number }[];
};

const ABAS = [
  { id: "ativo", label: "Custo por ativo" },
  { id: "centro", label: "Por centro de custo" },
  { id: "tipo", label: "Por tipo" },
  { id: "equipe", label: "Por equipe" },
  { id: "pareto", label: "Pareto de falhas" },
  { id: "produtividade", label: "Horas por executante" },
];

const iso = (d: Date) => d.toLocaleDateString("sv-SE");

export default function RelatoriosManutencaoPage() {
  useTabTitle("Manutenção — Relatórios");
  const [aba, setAba] = usePersistedState<string>("pcm:rel:aba", "ativo");
  const [de, setDe] = usePersistedState<string>("pcm:rel:de", iso(new Date(Date.now() - 90 * 86_400_000)));
  const [ate, setAte] = usePersistedState<string>("pcm:rel:ate", iso(new Date()));
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true); const [erro, setErro] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setErro("");
    const r = await fetch(`/api/pcm/relatorios?de=${de}&ate=${ate}`).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) { setErro(j?.error || "Erro ao carregar."); setLoading(false); return; }
    setD(j.data); setLoading(false);
  }, [de, ate]);
  useEffect(() => { load(); }, [load]);

  const linhas = d ? ({ ativo: d.porAtivo, centro: d.porCentro, tipo: d.porTipo, equipe: d.porEquipe } as Record<string, Linha[]>)[aba] : undefined;

  return (
    <div>
      <PageHeader title="Relatórios da Manutenção" subtitle="OS concluídas no período" breadcrumbs={[{ label: "Manutenção", href: "/pcm" }, { label: "Relatórios" }]} />
      <div className="px-8 pb-10 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">De</Label><DatePicker value={de} onChange={(v) => v && setDe(v)} className="w-40" /></div>
          <div><Label className="text-xs">Até</Label><DatePicker value={ate} onChange={(v) => v && setAte(v)} className="w-40" /></div>
          {d && <p className="text-sm text-muted-foreground pb-2">{d.totalOs} OS · <b className="text-foreground">{brl(d.total)}</b></p>}
        </div>
        <div className="flex flex-wrap gap-1 border-b border-border">
          {ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} className={cn("text-sm px-3 py-2 -mb-px border-b-2", aba === a.id ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{a.label}</button>)}
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        {loading || !d ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            {linhas && (
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">{ABAS.find((a) => a.id === aba)?.label.replace(/^(Custo )?[Pp]or /, "")}</th><th className="text-right px-3 py-2">OS</th><th className="text-right px-3 py-2">Mão de obra</th><th className="text-right px-3 py-2">Material</th><th className="text-right px-3 py-2">Terceiros</th><th className="text-right px-3 py-2">Total</th><th className="text-left px-4 py-2 w-48">% do período</th></tr></thead>
                <tbody>{linhas.map((l) => (
                  <tr key={l.chave} className="border-t border-border/60">
                    <td className="px-4 py-1.5">{l.link ? <Link href={l.link} className="hover:underline">{l.rotulo}</Link> : l.rotulo}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.os}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{brl(l.maoObra)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{brl(l.material)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{brl(l.terceiros)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{brl(l.total)}</td>
                    <td className="px-4 py-1.5"><Barra v={d.total ? l.total / d.total : 0} /></td>
                  </tr>
                ))}
                {linhas.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhuma OS concluída no período.</td></tr>}</tbody>
              </table>
            )}
            {aba === "pareto" && (
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Sintoma (defeito)</th><th className="text-left px-3 py-2">Causa</th><th className="text-right px-3 py-2">Ocorrências</th><th className="text-left px-4 py-2 w-48">Acumulado</th></tr></thead>
                <tbody>{d.pareto.map((p, i) => (
                  <tr key={i} className={cn("border-t border-border/60", p.acumulado - p.ocorrencias / (d.totalFalhas || 1) < 0.8 && "bg-warning/5")}>
                    <td className="px-4 py-1.5">{p.sintoma}</td><td className="px-3 py-1.5 text-muted-foreground">{p.causa}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.ocorrencias}</td>
                    <td className="px-4 py-1.5"><Barra v={p.acumulado} /></td>
                  </tr>
                ))}
                {d.pareto.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma falha registrada no período.</td></tr>}</tbody>
                {d.pareto.length > 0 && <tfoot><tr><td colSpan={4} className="px-4 py-2 text-[11px] text-muted-foreground">{d.totalFalhas} falhas no período. Destacadas: as combinações que somam os primeiros 80%.</td></tr></tfoot>}
              </table>
            )}
            {aba === "produtividade" && (
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Executante</th><th className="text-right px-3 py-2">OS</th><th className="text-right px-3 py-2">Horas apontadas</th><th className="text-left px-4 py-2 w-48">Ocupação (44 h/sem.)</th></tr></thead>
                <tbody>{d.produtividade.map((p) => (
                  <tr key={p.nome} className="border-t border-border/60">
                    <td className="px-4 py-1.5">{p.nome}</td><td className="px-3 py-1.5 text-right tabular-nums">{p.os}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtHoras(p.horas)}</td>
                    <td className="px-4 py-1.5"><Barra v={Math.min(1, p.ocupacao)} rotulo={`${Math.round(p.ocupacao * 100)}%`} /></td>
                  </tr>
                ))}
                {d.produtividade.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhum apontamento no período.</td></tr>}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Barra({ v, rotulo }: { v: number; rotulo?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-info" style={{ width: `${Math.max(0, Math.min(100, v * 100))}%` }} /></div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">{rotulo ?? `${Math.round(v * 100)}%`}</span>
    </div>
  );
}
