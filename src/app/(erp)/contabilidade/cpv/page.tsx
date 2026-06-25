"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Loader2, Save, BadgeCheck, Calculator, Info, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";

type Produto = {
  itemId: string; codigo: string; descricao: string;
  volumeUn: number; volumeMilheiros: number;
  materialMilheiro: number; modMilheiro: number; cifMilheiro: number;
  custoMilheiro: number; custoUnitario: number;
};
type Coluna = { total: number; itens: { nome: string; valorMilheiro: number }[] };
type Composicao = { materiaPrima: Coluna; embalagem: Coluna; md: Coluna; cif: Coluna; mod: Coluna; custoTotalMilheiro: number };
type Result = {
  competencia: string;
  biomassaMes: number; combustivelMes: number; energiaMes: number;
  cifPoolMes: number; folhaMes: number;
  volumeTotalMilheiros: number; cifRate: number; modRate: number;
  composicao: Composicao;
  produtos: Produto[];
  params: Params;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mil = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function mesCorrente() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type Params = { biomassaDia: number; energiaMes: number; combustivelDia: number; folhaMes: number; folhaMoiMes: number; diasTrabalhados: number; depreciacaoMes: number; diaristasMes: number } | null;

// Balão de origem do dado ao passar o mouse sobre o valor.
function Val({ origem, children, className }: { origem: string; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={`cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 ${className ?? ""}`} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[270px] text-xs leading-snug">{origem}</TooltipContent>
    </Tooltip>
  );
}

function origemDoItem(nome: string, p: Params, vol: number): string {
  const dias = p?.diasTrabalhados ?? 26;
  const v = `rateado por ${mil(vol)} milheiros produzidos`;
  if (nome === "Biomassa") return `Biomassa do forno: ${brl(p?.biomassaDia ?? 0)}/dia × ${dias} dias = ${brl((p?.biomassaDia ?? 0) * dias)}/mês, ${v}.`;
  if (nome === "Energia elétrica") return `Energia elétrica (parcela fabril): ${brl(p?.energiaMes ?? 0)}/mês, ${v}.`;
  if (nome === "Combustível") return `Combustível das máquinas: ${brl(p?.combustivelDia ?? 0)}/dia × ${dias} dias = ${brl((p?.combustivelDia ?? 0) * dias)}/mês, ${v}.`;
  if (nome === "Folha de pagamento") return `Folha de pagamento — mão de obra direta (MOD): ${brl(p?.folhaMes ?? 0)}/mês, ${v}.`;
  if (nome === "Mão de obra indireta (MOI)") return `Mão de obra indireta (MOI): ${brl(p?.folhaMoiMes ?? 0)}/mês (parte da folha que não é direta), ${v}.`;
  if (nome === "Depreciação e amortização") return `Depreciação/amortização fabril: ${brl(p?.depreciacaoMes ?? 0)}/mês, ${v}.`;
  if (nome === "Diaristas (diretos)") return `Diaristas diretos (lançamento de diaristas): ${brl(p?.diaristasMes ?? 0)}/mês, ${v}.`;
  return `${nome}: consumo na engenharia do produto (BOM) × custo médio (CMPM), média ponderada pelo volume de cada produto.`;
}
function origemDaColuna(cor: string): string {
  if (cor === "violet") return "CIF (custos indiretos de fabricação): biomassa + energia + combustível + MOI + depreciação, rateados por milheiro produzido — taxa predeterminada.";
  if (cor === "sky") return "MOD (mão de obra direta): folha de pagamento + diaristas diretos ÷ volume produzido — taxa predeterminada.";
  if (cor === "orange") return "Embalagem: fita, selo, palete e demais materiais de embalagem da engenharia (BOM × CMPM), média ponderada pelo volume.";
  return "Matéria-prima: consumo da engenharia (BOM) × custo médio (CMPM), pelo volume de cada produto (sem embalagem).";
}

export default function CusteioPage() {
  useTabTitle("CPV");
  const [competencia, setCompetencia] = useState(mesCorrente());
  const [biomassaDia, setBiomassaDia] = useState("");
  const [energiaMes, setEnergiaMes] = useState("");
  const [combustivelDia, setCombustivelDia] = useState("");
  const [folhaMes, setFolhaMes] = useState("");
  const [folhaMoiMes, setFolhaMoiMes] = useState("");
  const [depreciacaoMes, setDepreciacaoMes] = useState("");
  const [diaristasMes, setDiaristasMes] = useState("");
  const [diasTrabalhados, setDiasTrabalhados] = useState("26");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [view, setView] = useState<"total" | "milheiro">("total");
  const [aba, setAba] = usePersistedState<"taxa" | "fechamento" | "mensal">("cpv:aba", "taxa");
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
        setFolhaMoiMes(String(d.params.folhaMoiMes));
        setDepreciacaoMes(String(d.params.depreciacaoMes ?? 0));
        setDiaristasMes(String(d.params.diaristasMes ?? 0));
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
        body: JSON.stringify({ competencia, biomassaDia, energiaMes, combustivelDia, folhaMes, folhaMoiMes, depreciacaoMes, diaristasMes, diasTrabalhados }),
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

  const [apropriando, setApropriando] = useState(false);
  async function apropriarCif() {
    if (!confirm("Apropriar o saldo de \"CIF a Apropriar\" (1.1.4.0001) ao PEP-CIF (1.1.3.0005.0003)? Zera o staging e leva o CIF real ao custo de produção.")) return;
    setApropriando(true); setMsg(null);
    try {
      const r = await fetch("/api/contabilidade/apropriar-cif", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: competencia }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao apropriar");
      const ap = j.data?.apropriado ?? 0;
      setMsg({ ok: true, text: ap > 0 ? `CIF apropriado ao PEP: ${brl(ap)}.` : "Nada a apropriar (CIF a Apropriar já está zerado)." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
    } finally { setApropriando(false); }
  }

  return (
    <TooltipProvider delay={150}>
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Calculator className="w-5 h-5" /> CPV — Custo dos Produtos Vendidos</h1>
          <button type="button" onClick={() => setShowInfo((v) => !v)} title="O que é a taxa predeterminada?"
            className={`flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${showInfo ? "border-sky-400 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400" : "border-border text-muted-foreground hover:text-sky-600 hover:border-sky-300"}`}>
            <Info className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Parâmetros indiretos (biomassa, energia, combustível) e mão de obra para derivar a taxa predeterminada por milheiro e valorar o estoque de acabado.</p>
        {showInfo && (
          <div className="mt-2 flex gap-2 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2.5 text-sm">
            <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-foreground/90">
              <span className="font-medium">Para que serve a taxa predeterminada?</span> Permite que cada milheiro produzido já <b>absorva</b> a mão de obra (MOD) e os custos indiretos (CIF) <b>em tempo real</b>, sem esperar o fechamento do mês. Ela é derivada do <b>custo do período ÷ volume produzido</b>. No fechamento, compara-se o <b>aplicado</b> (taxa × milheiros) com o <b>real</b> e a diferença (sub/super-absorção) é ajustada.
            </div>
          </div>
        )}
      </div>

      {/* Abas: definição da taxa pré-definida × fechamentos (apropriações) */}
      <div className="flex gap-0 border-b border-border">
        {([["taxa", "Definição de taxa pré-definida"], ["fechamento", "Fechamentos"], ["mensal", "Detalhamento mensal"]] as const).map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => { setAba(k); setMsg(null); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === k ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {lbl}
          </button>
        ))}
      </div>

      {aba === "taxa" && (<>
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
            <div className="space-y-1.5"><Label>Mão de obra DIRETA — MOD (R$/mês)</Label>
              <Input inputMode="decimal" value={folhaMes} onChange={(e) => setFolhaMes(e.target.value)} placeholder="116280,50" /></div>
            <div className="space-y-1.5"><Label>Mão de obra INDIRETA — MOI (R$/mês)</Label>
              <Input inputMode="decimal" value={folhaMoiMes} onChange={(e) => setFolhaMoiMes(e.target.value)} placeholder="0,00" /></div>
            <div className="space-y-1.5"><Label>Depreciação/amortização — CIF (R$/mês)</Label>
              <Input inputMode="decimal" value={depreciacaoMes} onChange={(e) => setDepreciacaoMes(e.target.value)} placeholder="0,00" /></div>
            <div className="space-y-1.5"><Label>Diaristas diretos — MOD (R$/mês)</Label>
              <Input inputMode="decimal" value={diaristasMes} onChange={(e) => setDiaristasMes(e.target.value)} placeholder="0,00" /></div>
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
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Composição do custo — competência {result.competencia}</CardTitle>
              <div className="flex rounded-lg border border-border p-0.5 text-xs shrink-0">
                {([["total", "Totais"], ["milheiro", "Por milheiro"]] as const).map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setView(k)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${view === k ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const vol = result.volumeTotalMilheiros;
                const total = view === "total";
                const ctMi = result.composicao.custoTotalMilheiro;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <ColunaComp titulo="Matéria-Prima" cor="amber" coluna={result.composicao.materiaPrima} total={total} vol={vol} params={result.params} />
                    <ColunaComp titulo="Embalagem" cor="orange" op="+" coluna={result.composicao.embalagem} total={total} vol={vol} params={result.params} />
                    <ColunaComp titulo="Custo Indireto (CIF)" cor="violet" op="+" coluna={result.composicao.cif} total={total} vol={vol} params={result.params} />
                    <ColunaComp titulo="Mão de Obra (MOD)" cor="sky" op="+" coluna={result.composicao.mod} total={total} vol={vol} params={result.params} />
                    <div className="rounded-lg border-2 border-foreground/20 bg-muted/40 p-3 flex flex-col justify-center">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">= Custo Total</p>
                      <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
                        <Val origem="Custo Total = Material Direto + CIF + MOD (soma das três parcelas por milheiro).">{brl(total ? ctMi * vol : ctMi)}</Val>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{total ? `${brl(ctMi)}/milheiro · ${brl(ctMi / 1000)}/un` : `por milheiro · ${brl(ctMi / 1000)}/un`}</p>
                    </div>
                  </div>
                );
              })()}
              <p className="text-[11px] text-muted-foreground">
                Volume: <b>{mil(result.volumeTotalMilheiros)} milheiros</b> (só produtos de fabricação). Matéria-prima e embalagem são a média ponderada pelo volume (variam por produto — ver tabela); CIF e MOD são as taxas predeterminadas (custo do mês ÷ volume).
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
                      <th className="text-right py-2 text-violet-600 dark:text-violet-400">+ CIF</th>
                      <th className="text-right py-2 text-sky-600 dark:text-sky-400">+ MOD</th>
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
                        <td className="text-right tabular-nums text-violet-700 dark:text-violet-300">{brl(p.cifMilheiro)}</td>
                        <td className="text-right tabular-nums text-sky-700 dark:text-sky-300">{brl(p.modMilheiro)}</td>
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
      </>)}

      {aba === "fechamento" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Fechamentos — apropriação ao PEP</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Processos de fechamento que levam os custos reais acumulados ao Produto em Processo (PEP). Rode ao fechar a competência.</p>
            <div className="rounded-lg border border-border p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Apropriar CIF ao PEP</p>
                <p className="text-[12px] text-muted-foreground">Leva o saldo de “CIF a Apropriar” (1.1.4.0001) ao PEP-CIF (1.1.3.0005.0003), estágio queimado. Zera o staging.</p>
              </div>
              <Button onClick={apropriarCif} disabled={apropriando} variant="default">
                {apropriando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Apropriar CIF
              </Button>
            </div>
            <div className="rounded-lg border border-border p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Apropriar MOD ao PEP</p>
                <p className="text-[12px] text-muted-foreground">
                  A mão de obra é apropriada ao <b>fechar a folha</b> da competência (RH → Folhas):
                  MOD → PEP-MOD (1.1.3.0005.0002), MOI → CIF a Apropriar, Admin → Despesa.
                  Classifique os colaboradores (MOD/MOI/Admin) e feche a folha do mês.
                </p>
              </div>
              <a href="/rh/folhas"
                className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted">
                <FileText className="w-4 h-4" /> Ir para Folhas
              </a>
            </div>
            {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</span>}
          </CardContent>
        </Card>
      )}

      {aba === "mensal" && <CpvMensal />}
    </div>
    </TooltipProvider>
  );
}

type CpvItem = { nome: string; meses: number[]; total: number };
type CpvSecao = { chave: string; nome: string; meses: number[]; total: number; itens?: CpvItem[] };
type CpvDetalhadoData = {
  ano: number;
  secoes: CpvSecao[];
  totalMeses: number[];
  totalTotal: number;
  totalAnterior: number;
  variacao: number | null;
};
const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// CPV detalhado por COMPONENTE, mês a mês (derivado da composição de custo). A DRE
// só mostra o CPV consolidado; aqui abrimos Matéria-Prima (com sub-itens), Embalagens,
// Mão-de-obra, Gastos Gerais de Fabricação e Depreciação — somam ao CPV do razão.
function CpvMensal() {
  const [ano, setAno] = useState<number>(() => new Date().getUTCFullYear());
  const [data, setData] = useState<CpvDetalhadoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/contabilidade/cpv-detalhado?ano=${ano}`)
      .then((r) => r.json())
      .then((d: CpvDetalhadoData) => setData(d))
      .finally(() => setLoading(false));
  }, [ano]);

  const cel = (v: number) =>
    Math.abs(v) < 0.005 ? <span className="text-muted-foreground/50">—</span> : <span className={v < 0 ? "text-rose-500" : ""}>{brl(v)}</span>;
  const temMov = data && data.secoes.some((s) => Math.abs(s.total) >= 0.005);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">CPV detalhado — mês a mês</CardTitle>
          <p className="text-[12px] text-muted-foreground">Componentes do custo (derivados da composição) — a soma bate com o CPV do razão. Posição do exercício corrente.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          Exercício
          <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="h-9 rounded-lg border border-border px-2 text-sm bg-card">
            {Array.from({ length: 6 }).map((_, i) => { const y = new Date().getUTCFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
          </select>
        </label>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : !temMov ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem movimento de CPV no exercício.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums whitespace-nowrap">
              <thead className="text-xs text-muted-foreground uppercase tracking-wide">
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 sticky left-0 bg-card min-w-[15rem]">Custos</th>
                  {MESES_CURTO.map((m) => <th key={m} className="text-right py-2 px-2 w-24">{m}</th>)}
                  <th className="text-right py-2 pl-3 w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {data!.secoes.map((s) => (
                  <Fragment key={s.chave}>
                    <tr className="border-b border-border/60 bg-muted/30 font-semibold text-foreground">
                      <td className="py-1.5 pr-3 sticky left-0 bg-muted/30">{s.nome}</td>
                      {s.meses.map((v, i) => <td key={i} className="text-right py-1.5 px-2">{cel(v)}</td>)}
                      <td className="text-right py-1.5 pl-3">{cel(s.total)}</td>
                    </tr>
                    {(s.itens ?? []).map((it) => (
                      <tr key={s.chave + it.nome} className="border-b border-border/40 text-muted-foreground hover:bg-muted/30">
                        <td className="py-1 pr-3 pl-6 sticky left-0 bg-card">{it.nome}</td>
                        {it.meses.map((v, i) => <td key={i} className="text-right py-1 px-2">{cel(v)}</td>)}
                        <td className="text-right py-1 pl-3">{cel(it.total)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="border-t-2 border-border bg-muted/60 font-bold text-foreground">
                  <td className="py-2 pr-3 sticky left-0 bg-muted/60">TOTAL</td>
                  {data!.totalMeses.map((v, i) => <td key={i} className="text-right py-2 px-2">{cel(v)}</td>)}
                  <td className="text-right py-2 pl-3">{brl(data!.totalTotal)}</td>
                </tr>
                {data!.variacao != null && (
                  <tr className="text-xs text-muted-foreground">
                    <td className="py-1.5 pr-3 sticky left-0 bg-card">Variação no CPV (vs {ano - 1})</td>
                    <td colSpan={12} />
                    <td className={cn("text-right py-1.5 pl-3 font-semibold", data!.variacao < 0 ? "text-emerald-600" : "text-rose-500")}>
                      {data!.variacao > 0 ? "+" : ""}{data!.variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CORES: Record<string, { borda: string; texto: string }> = {
  amber:  { borda: "border-amber-200 dark:border-amber-900",   texto: "text-amber-600 dark:text-amber-400" },
  orange: { borda: "border-orange-200 dark:border-orange-900", texto: "text-orange-600 dark:text-orange-400" },
  violet: { borda: "border-violet-200 dark:border-violet-900", texto: "text-violet-600 dark:text-violet-400" },
  sky:    { borda: "border-sky-200 dark:border-sky-900",       texto: "text-sky-600 dark:text-sky-400" },
};

function ColunaComp({ titulo, cor, op, coluna, total, vol, params }: { titulo: string; cor: string; op?: string; coluna: Coluna; total: boolean; vol: number; params: Params }) {
  const c = CORES[cor] ?? CORES.amber;
  const colVal = total ? coluna.total * vol : coluna.total;
  return (
    <div className={`rounded-lg border p-3 ${c.borda}`}>
      <p className={`text-[11px] uppercase tracking-wide font-medium ${c.texto}`}>{op && <span className="mr-1">{op}</span>}{titulo}</p>
      <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">
        <Val origem={origemDaColuna(cor)}>{brl(colVal)}</Val>{!total && <span className="text-xs font-normal text-muted-foreground">/mi</span>}
      </p>
      {total && <p className="text-[11px] text-muted-foreground tabular-nums">{brl(coluna.total)}/mi</p>}
      <div className="mt-2 border-t border-border pt-2 space-y-1.5">
        {coluna.itens.map((it) => (
          <div key={it.nome} className="flex justify-between gap-2 text-[12px]">
            <span className="text-muted-foreground truncate pt-0.5">{it.nome}</span>
            <span className="shrink-0 text-right">
              <Val origem={origemDoItem(it.nome, params, vol)} className="tabular-nums">{brl(total ? it.valorMilheiro * vol : it.valorMilheiro)}</Val>
              {total && <span className="block text-[10px] text-muted-foreground tabular-nums">{brl(it.valorMilheiro)}/mi</span>}
            </span>
          </div>
        ))}
        {coluna.itens.length === 0 && <p className="text-[11px] text-muted-foreground italic">—</p>}
      </div>
    </div>
  );
}
