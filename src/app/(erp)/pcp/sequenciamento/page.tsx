"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import PageHeader from "@/components/shared/PageHeader";
import DatePicker from "@/components/shared/DatePicker";
import SelectMenu from "@/components/shared/SelectMenu";
import { CalendarClock, RefreshCw, Flame, AlertTriangle, Wrench } from "lucide-react";

interface ItemCron {
  id: string;
  numero: string;
  produto: string | null;
  quantidade: number;
  ciclos: number;
  inicioDia: number;
  fimDia: number;
}
interface Cronograma {
  itens: ItemCron[];
  totalCiclos: number;
  totalHoras: number;
  totalDias: number;
  totalOps: number;
}
interface FornoOpt { id: string; nome: string; capacidadePadrao: string | number | null; tipo: string | null; }
// OS de manutenção com parada programada nos fornos (indisponibilidade — só aviso).
interface Parada {
  id: string;
  numero: string;
  status: string;
  descricao: string;
  programadaPara: string;
  horasEstimadas: number | null;
  ativo: { tag: string; nome: string } | null;
  tipo: { sigla: string; nome: string } | null;
  centro: { id: string; codigo: string; nome: string } | null;
}
const DIA_MS = 86_400_000;
// Sem estimativa, a parada conta como um turno (8 h) para o cruzamento com as OPs.
const HORAS_PARADA_PADRAO = 8;

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

// Soma `dias` corridos a uma data AAAA-MM-DD, sem fuso (UTC), retorna DD/MM.
function dataMais(dataInicio: string, dias: number): string {
  if (!dataInicio) return "—";
  const base = new Date(`${dataInicio}T00:00:00Z`);
  if (isNaN(base.getTime())) return "—";
  base.setUTCDate(base.getUTCDate() + Math.ceil(dias));
  return base.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

export default function SequenciamentoPage() {
  useTabTitle("Sequenciamento do forno");
  const { canAccess } = useSession();
  const [fornos, setFornos] = useState<FornoOpt[]>([]);
  const [fornoId, setFornoId] = useState("");
  const [capacidade, setCapacidade] = useState("20");
  const [cicloHoras, setCicloHoras] = useState("24");
  const [horasDia, setHorasDia] = useState("24");
  const [dataInicio, setDataInicio] = useState("");
  const [cron, setCron] = useState<Cronograma | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Carrega fornos (centros tipo FORNO) para prefill da capacidade
  useEffect(() => {
    fetch("/api/pcp/centros-trabalho")
      .then((r) => r.json())
      .then((j) => {
        const fs = (j.data ?? []).filter((c: FornoOpt) => c.tipo === "FORNO");
        setFornos(fs);
        if (fs[0]) setFornoId(fs[0].id);
        if (fs[0]?.capacidadePadrao) setCapacidade(String(Number(fs[0].capacidadePadrao)));
      })
      .catch(() => {});
  }, []);

  const sequenciar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({ capacidade, cicloHoras, horasDia });
      const r = await fetch(`/api/pcp/sequenciamento?${qs.toString()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao sequenciar");
      setCron(j.data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao sequenciar");
    } finally {
      setLoading(false);
    }
  }, [capacidade, cicloHoras, horasDia]);

  useEffect(() => { sequenciar(); }, [sequenciar]);

  // Horizonte exibido: do início informado (ou agora) até o fim do cronograma (mín. 7 dias).
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [fornosSemAtivo, setFornosSemAtivo] = useState(0);
  const base = useMemo(() => (dataInicio ? new Date(`${dataInicio}T00:00:00`) : new Date()), [dataInicio]);
  const horizonteDias = Math.max(7, Math.ceil(cron?.totalDias ?? 0));
  useEffect(() => {
    const qs = new URLSearchParams({ de: base.toISOString(), ate: new Date(base.getTime() + horizonteDias * DIA_MS).toISOString() });
    if (fornoId) qs.set("centroId", fornoId);
    fetch(`/api/pcp/sequenciamento/paradas?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => { setParadas(j.data ?? []); setFornosSemAtivo(j.centrosSemAtivo ?? 0); })
      .catch(() => setParadas([]));
  }, [base, horizonteDias, fornoId]);

  // Parada em "dias do cronograma" (mesma régua de inicioDia/fimDia) p/ cruzar com as OPs.
  const paradasDia = useMemo(() => paradas.map((p) => {
    const ini = (new Date(p.programadaPara).getTime() - base.getTime()) / DIA_MS;
    return { ...p, iniDia: ini, fimDia: ini + (p.horasEstimadas ?? HORAS_PARADA_PADRAO) / 24 };
  }), [paradas, base]);
  const pcm = canAccess("pcm");

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Sequenciamento do forno"
        subtitle="Carregamento finito do gargalo: ordena as OPs liberadas no forno (FIFO) e estima quando cada uma fica pronta."
        breadcrumbs={[{ label: "PCP" }, { label: "Sequenciamento" }]}
        action={
          <button onClick={sequenciar} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Sequenciar
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4">
        {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {/* Parâmetros do forno */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Flame className="w-4 h-4 text-amber-500" /> Parâmetros do forno</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            {fornos.length > 0 && (
              <div className="md:col-span-1">
                <label className="block text-xs text-muted-foreground mb-1">Forno</label>
                <SelectMenu
                  value={fornoId}
                  onChange={(v) => { setFornoId(v); const f = fornos.find((x) => x.id === v); if (f?.capacidadePadrao) setCapacidade(String(Number(f.capacidadePadrao))); }}
                  options={fornos.map((f) => ({ value: f.id, label: f.nome }))}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Capacidade/ciclo</label>
              <input className={inputCls} inputMode="decimal" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Ciclo (h)</label>
              <input className={inputCls} inputMode="decimal" value={cicloHoras} onChange={(e) => setCicloHoras(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Horas/dia</label>
              <input className={inputCls} inputMode="decimal" value={horasDia} onChange={(e) => setHorasDia(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Início (opcional)</label>
              <DatePicker value={dataInicio} onChange={(v) => setDataInicio(v)} className="w-full" />
            </div>
          </div>
        </div>

        {/* Indisponibilidade programada (OS de manutenção com parada) — só leitura */}
        {(paradasDia.length > 0 || fornosSemAtivo > 0) && (
          <div className={paradasDia.length > 0 ? "rounded-xl border border-warning/40 bg-warning/5 p-4" : "rounded-xl border border-border bg-card p-4"}>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-warning" />
              {paradasDia.length > 0 ? `${paradasDia.length} parada(s) programada(s) de manutenção nos próximos ${horizonteDias} dias` : "Paradas programadas de manutenção"}
            </h3>
            {paradasDia.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {paradasDia.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="tabular-nums font-medium text-foreground whitespace-nowrap">
                      {new Date(p.programadaPara).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">dia {Math.max(0, Math.round(p.iniDia * 10) / 10)}</span>
                    {pcm ? <Link href={`/pcm/os/${p.id}`} className="font-mono font-semibold text-info hover:underline">{p.numero}</Link> : <span className="font-mono font-semibold">{p.numero}</span>}
                    {p.tipo && <span className="text-muted-foreground">{p.tipo.sigla}</span>}
                    <span className="text-foreground">{p.ativo ? `${p.ativo.tag} ${p.ativo.nome}` : "—"}</span>
                    <span className="text-muted-foreground truncate max-w-[28rem]" title={p.descricao}>· {p.descricao}</span>
                    <span className="text-muted-foreground whitespace-nowrap">· {p.horasEstimadas != null ? `${p.horasEstimadas} h estimadas` : "sem estimativa"}</span>
                    {p.centro && <span className="text-muted-foreground whitespace-nowrap">· {p.centro.nome}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              O sequenciamento abaixo não desconta as paradas — as ordens que caem nelas aparecem marcadas.
              {fornosSemAtivo > 0 && ` ${fornosSemAtivo} forno(s) sem ativo da Manutenção ligado no centro de trabalho não entram nesta conta.`}
            </p>
          </div>
        )}

        {/* Cronograma */}
        {cron && (
          cron.itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-3"><CalendarClock className="w-7 h-7 text-cyan-400" /></div>
              <p className="text-sm font-medium text-foreground">Nenhuma ordem para sequenciar</p>
              <p className="text-xs text-muted-foreground mt-1">Libere ordens de produção (status Liberada) para vê-las no cronograma do forno.</p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 text-xs mb-2">
                <span className="inline-flex items-center rounded-full bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 px-3 py-1 font-medium">{cron.totalOps} ordem(ns)</span>
                <span className="inline-flex items-center rounded-full bg-warning/10 text-warning px-3 py-1 font-medium">{cron.totalCiclos} ciclos de forno</span>
                <span className="inline-flex items-center rounded-full bg-info/10 text-info px-3 py-1 font-medium">{cron.totalHoras} h (~{cron.totalDias} dias)</span>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Ordem</th>
                      <th className="text-left font-medium px-4 py-2">Produto</th>
                      <th className="text-right font-medium px-4 py-2 w-24">Qtd</th>
                      <th className="text-right font-medium px-4 py-2 w-20">Ciclos</th>
                      <th className="text-right font-medium px-4 py-2 w-28">Início (dia)</th>
                      <th className="text-right font-medium px-4 py-2 w-28">Fim (dia)</th>
                      {dataInicio && <th className="text-right font-medium px-4 py-2 w-28">Prev. fim</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cron.itens.map((it) => {
                      const conflitos = paradasDia.filter((p) => p.iniDia < it.fimDia && p.fimDia > it.inicioDia);
                      return (
                      <tr key={it.id} className="hover:bg-muted/60">
                        <td className="px-4 py-2 font-mono font-medium text-foreground">
                          {it.numero}
                          {conflitos.map((p) => (
                            <span key={p.id} title={`Parada de manutenção ${p.numero}: ${p.descricao}`} className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning px-1.5 py-0.5 text-[10px] font-sans font-medium align-middle">
                              <Wrench className="w-3 h-3" /> {p.numero}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{it.produto ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-foreground">{it.quantidade}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{it.ciclos}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">dia {it.inicioDia}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-foreground font-medium">dia {it.fimDia}</td>
                        {dataInicio && <td className="px-4 py-2 text-right tabular-nums text-cyan-700 dark:text-cyan-300">{dataMais(dataInicio, it.fimDia)}</td>}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Carregamento finito guloso (FIFO) no gargalo. Cada ordem ocupa ciclos = qtd ÷ capacidade; o forno faz uma de cada vez.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
