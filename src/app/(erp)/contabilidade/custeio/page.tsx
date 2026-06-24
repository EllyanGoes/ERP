"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, BadgeCheck, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Produto = {
  itemId: string; codigo: string; descricao: string;
  volumeUn: number; volumeMilheiros: number;
  materialMilheiro: number; modMilheiro: number; cifMilheiro: number;
  custoMilheiro: number; custoUnitario: number;
};
type Result = {
  competencia: string;
  biomassaMes: number; combustivelMes: number; energiaMes: number;
  cifPoolMes: number; folhaMes: number;
  volumeTotalMilheiros: number; cifRate: number; modRate: number;
  produtos: Produto[];
  params: { biomassaDia: number; energiaMes: number; combustivelDia: number; folhaMes: number; diasTrabalhados: number } | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mil = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function mesCorrente() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function CusteioPage() {
  const [competencia, setCompetencia] = useState(mesCorrente());
  const [biomassaDia, setBiomassaDia] = useState("");
  const [energiaMes, setEnergiaMes] = useState("");
  const [combustivelDia, setCombustivelDia] = useState("");
  const [folhaMes, setFolhaMes] = useState("");
  const [diasTrabalhados, setDiasTrabalhados] = useState("26");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (comp: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/contabilidade/custeio?competencia=${comp}`);
      const j = await r.json();
      const d: Result = j.data;
      setResult(d);
      if (d.params) {
        setBiomassaDia(String(d.params.biomassaDia));
        setEnergiaMes(String(d.params.energiaMes));
        setCombustivelDia(String(d.params.combustivelDia));
        setFolhaMes(String(d.params.folhaMes));
        setDiasTrabalhados(String(d.params.diasTrabalhados));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(competencia); }, [competencia, load]);

  async function salvar() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/contabilidade/custeio", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, biomassaDia, energiaMes, combustivelDia, folhaMes, diasTrabalhados }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao salvar");
      setResult(j.data);
      setMsg({ ok: true, text: "Parâmetros salvos e taxa recalculada." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
    } finally { setSaving(false); }
  }

  async function aplicar() {
    if (!confirm("Gravar o custo calculado (material + MOD + CIF) no estoque de produto acabado? Isso passa a valorar PA e CPV por esse custo.")) return;
    setAplicando(true); setMsg(null);
    try {
      const r = await fetch("/api/contabilidade/custeio/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao aplicar");
      setResult(j.data);
      setMsg({ ok: true, text: `Custo aplicado a ${j.aplicados} produto(s) no estoque de acabado.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
    } finally { setAplicando(false); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Calculator className="w-5 h-5" /> Custeio — taxa de CIF/MOD</h1>
        <p className="text-sm text-muted-foreground">Parâmetros indiretos (biomassa, energia, combustível) e mão de obra para derivar a taxa predeterminada por milheiro e valorar o estoque de acabado.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parâmetros da competência</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label>Competência</Label>
              <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Biomassa (R$/dia)</Label>
              <Input inputMode="decimal" value={biomassaDia} onChange={(e) => setBiomassaDia(e.target.value)} placeholder="1035,36" /></div>
            <div className="space-y-1.5"><Label>Energia elétrica (R$/mês)</Label>
              <Input inputMode="decimal" value={energiaMes} onChange={(e) => setEnergiaMes(e.target.value)} placeholder="110000" /></div>
            <div className="space-y-1.5"><Label>Combustível (R$/dia)</Label>
              <Input inputMode="decimal" value={combustivelDia} onChange={(e) => setCombustivelDia(e.target.value)} placeholder="2050" /></div>
            <div className="space-y-1.5"><Label>Mão de obra / folha (R$/mês)</Label>
              <Input inputMode="decimal" value={folhaMes} onChange={(e) => setFolhaMes(e.target.value)} placeholder="116280,50" /></div>
            <div className="space-y-1.5"><Label>Dias trabalhados/mês</Label>
              <Input inputMode="numeric" value={diasTrabalhados} onChange={(e) => setDiasTrabalhados(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar e calcular</Button>
            {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</span>}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</div>
      ) : result && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Taxa predeterminada (competência {result.competencia})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Stat label="Volume produzido" value={`${mil(result.volumeTotalMilheiros)} mi`} hint="entradas no PA" />
                <Stat label="Pool CIF / mês" value={brl(result.cifPoolMes)} hint="biomassa + energia + combustível" />
                <Stat label="Taxa CIF" value={`${brl(result.cifRate)}/mi`} hint="predeterminada" strong />
                <Stat label="Taxa MOD" value={`${brl(result.modRate)}/mi`} hint={`folha ${brl(result.folhaMes)}`} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                CIF/mês = biomassa {brl(result.biomassaMes)} + energia {brl(result.energiaMes)} + combustível {brl(result.combustivelMes)}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Custo por produto (estoque de acabado)</CardTitle>
              <Button onClick={aplicar} disabled={aplicando || result.volumeTotalMilheiros <= 0} variant="default">
                {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} Aplicar ao estoque de PA
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                <span className="font-semibold text-foreground">Custo Total</span>
                {" = "}
                <span className="text-amber-600 dark:text-amber-400 font-medium">Material Direto</span>
                {" + "}
                <span className="text-sky-600 dark:text-sky-400 font-medium">Mão de Obra Direta (MOD)</span>
                {" + "}
                <span className="text-violet-600 dark:text-violet-400 font-medium">Custo Indireto de Fabricação (CIF)</span>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Material da engenharia (BOM × CMPM) por produto; MOD e CIF rateados por milheiro produzido (taxa predeterminada). Valores por milheiro; o custo unitário é ÷ 1.000.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase tracking-wide">
                    <tr className="border-b border-border">
                      <th className="text-left py-2">Produto</th>
                      <th className="text-right py-2">Volume (mi)</th>
                      <th className="text-right py-2 text-amber-600 dark:text-amber-400">Material Direto</th>
                      <th className="text-right py-2 text-sky-600 dark:text-sky-400">+ MOD</th>
                      <th className="text-right py-2 text-violet-600 dark:text-violet-400">+ CIF</th>
                      <th className="text-right py-2">= Custo/mi</th>
                      <th className="text-right py-2">Custo/un</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.produtos.map((p) => (
                      <tr key={p.itemId} className="border-b border-border/50">
                        <td className="py-2"><span className="text-muted-foreground">{p.codigo}</span> {p.descricao}</td>
                        <td className="text-right tabular-nums">{mil(p.volumeMilheiros)}</td>
                        <td className="text-right tabular-nums text-amber-700 dark:text-amber-300">{brl(p.materialMilheiro)}</td>
                        <td className="text-right tabular-nums text-sky-700 dark:text-sky-300">{brl(p.modMilheiro)}</td>
                        <td className="text-right tabular-nums text-violet-700 dark:text-violet-300">{brl(p.cifMilheiro)}</td>
                        <td className="text-right tabular-nums font-semibold">{brl(p.custoMilheiro)}</td>
                        <td className="text-right tabular-nums font-semibold">{brl(p.custoUnitario)}</td>
                      </tr>
                    ))}
                    {result.produtos.length === 0 && (
                      <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Sem produtos com entrada no estoque de acabado nesta competência.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 ${strong ? "text-lg font-semibold text-foreground" : "text-base font-medium text-foreground"}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
