"use client";

// Indicadores de acidentes (NBR 14280): taxa de frequência e gravidade por mês
// com horas-homem trabalhadas (lançadas ou estimadas) + histórico de
// conformidade (snapshots diários do cron).
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Camera, Pencil } from "lucide-react";
import { fmtData } from "@/components/sst/comum";

type Mes = { mes: number; horas: number | null; estimadas: number; empregados: number | null; estimado: boolean; ocorrencias: number; comAfastamento: number; semAfastamento: number; quaseAcidentes: number; diasPerdidos: number; tf: number | null; tg: number | null };
type Dados = { ano: number; empregadosAtivos: number; meses: Mes[]; acumulado: { hht: number; ocorrencias: number; comAfastamento: number; diasPerdidos: number; tf: number | null; tg: number | null; mesesEstimados: number }; historico: { data: string; totais: { colaboradores: number; ok: number; atencao: number; critico: number; porSeveridade: Record<string, number> } }[] };
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtN = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

export default function SstIndicadoresPage() {
  useTabTitle("SST — Indicadores");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const j = await fetch(`/api/sst/indicadores?ano=${ano}`).then((r) => r.json()).catch(() => null); setD(j?.data ?? null); setLoading(false); }, [ano]);
  useEffect(() => { load(); }, [load]);

  const [edit, setEdit] = useState<Mes | null>(null); const [horas, setHoras] = useState(""); const [emp, setEmp] = useState(""); const [saving, setSaving] = useState(false);
  async function salvarHoras() {
    if (!edit) return; setSaving(true);
    await fetch("/api/sst/indicadores", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano: Number(ano), mes: edit.mes, horas: Number(horas), empregados: emp || null }) });
    setSaving(false); setEdit(null); load();
  }
  async function foto() { setSaving(true); await fetch("/api/sst/indicadores", { method: "POST" }); setSaving(false); load(); }
  const anos = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i));
  const maxTf = d ? Math.max(1, ...d.meses.map((m) => m.tf ?? 0)) : 1;
  const maxCrit = d ? Math.max(1, ...d.historico.map((h) => (h.totais.porSeveridade?.CRITICA ?? 0) + (h.totais.porSeveridade?.ALTA ?? 0))) : 1;

  return (
    <div>
      <PageHeader title="Indicadores de SST" subtitle="Taxa de frequência (TF) e de gravidade (TG) por milhão de horas-homem trabalhadas — NBR 14280" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Indicadores" }]}
        action={<div className="flex items-center gap-2"><SelectMenu value={ano} onChange={setAno} className="w-28" options={anos.map((a) => ({ value: a, label: a }))} /><Button variant="outline" size="sm" onClick={foto} disabled={saving} className="gap-1.5"><Camera className="w-3.5 h-3.5" /> Registrar foto de hoje</Button></div>} />
      <div className="px-8 pb-8 space-y-6">
        {loading || !d ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[["TF acumulada", fmtN(d.acumulado.tf), "text-foreground"], ["TG acumulada", fmtN(d.acumulado.tg), "text-foreground"], ["Acid. c/ afastamento", d.acumulado.comAfastamento, "text-danger"], ["Dias perdidos", d.acumulado.diasPerdidos, "text-danger"], ["HHT no ano", fmtN(d.acumulado.hht), "text-muted-foreground"], ["Empregados ativos", d.empregadosAtivos, "text-muted-foreground"]].map(([l, v, c]) => (
                <div key={String(l)} className="bg-card rounded-xl border border-border p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={cn("mt-1 text-2xl font-semibold", String(c))}>{v}</div></div>
              ))}
            </div>
            {d.acumulado.mesesEstimados > 0 && <p className="text-xs text-warning">{d.acumulado.mesesEstimados} mês(es) sem horas lançadas — HHT estimada em {d.empregadosAtivos} empregados × 220h. Lance as horas reais (folha/ponto) clicando no lápis de cada mês.</p>}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Mês</th><th className="text-right px-3 py-2 font-semibold">HHT</th><th className="text-right px-3 py-2 font-semibold">Ocorrências</th><th className="text-right px-3 py-2 font-semibold">C/ afast.</th><th className="text-right px-3 py-2 font-semibold">S/ afast.</th><th className="text-right px-3 py-2 font-semibold">Quase</th><th className="text-right px-3 py-2 font-semibold">Dias perdidos</th><th className="text-right px-3 py-2 font-semibold">TF</th><th className="text-right px-3 py-2 font-semibold">TG</th><th className="text-left px-3 py-2 font-semibold w-40">TF</th><th className="px-2 py-2"></th></tr></thead>
                <tbody>
                  {d.meses.map((m) => (
                    <tr key={m.mes} className="border-t border-border/60">
                      <td className="px-4 py-2 text-foreground">{MESES[m.mes - 1]}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", m.estimado ? "text-muted-foreground italic" : "text-foreground")}>{fmtN(m.horas ?? m.estimadas)}{m.estimado && "*"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.ocorrencias}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", m.comAfastamento > 0 && "text-danger font-medium")}>{m.comAfastamento}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.semAfastamento}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.quaseAcidentes}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", m.diasPerdidos > 0 && "text-danger font-medium")}>{m.diasPerdidos}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtN(m.tf)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtN(m.tg)}</td>
                      <td className="px-3 py-2"><div className="h-2 rounded bg-muted overflow-hidden"><div className={cn("h-full", (m.tf ?? 0) > 0 ? "bg-danger" : "bg-success")} style={{ width: `${Math.max(2, ((m.tf ?? 0) / maxTf) * 100)}%` }} /></div></td>
                      <td className="px-2 py-2"><button onClick={() => { setEdit(m); setHoras(String(m.horas ?? m.estimadas)); setEmp(m.empregados ? String(m.empregados) : ""); }} className="text-muted-foreground hover:text-foreground" title="Lançar horas"><Pencil className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/60">* estimado. TF = acidentes com afastamento × 1.000.000 ÷ HHT · TG = dias perdidos × 1.000.000 ÷ HHT.</p>
            </div>

            <section className="bg-card rounded-xl border border-border">
              <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Histórico de conformidade (últimos 90 dias)</h2></div>
              {d.historico.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground italic">Sem fotos ainda — o cron grava uma por dia útil; use &quot;Registrar foto de hoje&quot; para começar.</p> : (
                <div className="p-4">
                  <div className="flex items-end gap-1 h-32">
                    {d.historico.map((h) => { const n = (h.totais.porSeveridade?.CRITICA ?? 0) + (h.totais.porSeveridade?.ALTA ?? 0); return (
                      <div key={h.data} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${fmtData(h.data)}: ${n} críticas/altas · ${h.totais.ok}/${h.totais.colaboradores} regulares`}>
                        <div className={cn("w-full rounded-t", n === 0 ? "bg-success" : "bg-danger/70")} style={{ height: `${Math.max(4, (n / maxCrit) * 100)}%` }} />
                      </div>
                    ); })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>{fmtData(d.historico[0].data)}</span><span>pendências críticas + altas por dia</span><span>{fmtData(d.historico[d.historico.length - 1].data)}</span></div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Horas trabalhadas — {edit ? MESES[edit.mes - 1] : ""}/{ano}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Horas-homem trabalhadas no mês</Label><Input type="number" min={0} value={horas} onChange={(e) => setHoras(e.target.value)} /><p className="text-[11px] text-muted-foreground mt-0.5">Da folha/ponto: soma das horas efetivamente trabalhadas por todos os empregados.</p></div>
            <div><Label>Empregados no mês (opcional)</Label><Input type="number" min={0} value={emp} onChange={(e) => setEmp(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={salvarHoras} disabled={saving}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
