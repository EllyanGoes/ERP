"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
import DetalheOs from "@/components/pcm/DetalheOs";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  AlertTriangle,
  PackageSearch,
  Lock,
  Unlock,
  Save,
  TriangleAlert,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { FechamentoRow } from "@/app/api/pcm/ativo-saude/fechamento/route";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtH = (n: number | null) => (n === null ? "—" : `${numFmt.format(n)} h`);
const calcMtbf = (f: number, p: number, n: number) => (n > 0 ? Math.max(f - p, 0) / n : null);
const calcMttr = (p: number, n: number) => (n > 0 ? p / n : null);

type Filtro = "all" | "A" | "B" | "C";

export default function FechamentoPage() {
  useTabTitle("Fechamento mensal");

  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<FechamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [savingCodApl, setSavingCodApl] = useState<number | null>(null);
  const [bulk, setBulk] = useState(false);
  const [soRevisar, setSoRevisar] = useState(false);
  const [codAplFiltro, setCodAplFiltro] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErroCarga(null);
    setErroSalvar("");
    try {
      const res = await fetch(`/api/pcm/ativo-saude/fechamento?ano=${ano}&mes=${mes}`);
      if (res.status === 503) {
        setErroCarga("Engeman indisponível no momento. Tente novamente.");
        setRows([]);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setErroCarga(j?.error || "Não foi possível carregar os ativos do mês.");
        setRows([]);
        return;
      }
      const j = await res.json();
      setRows(j.rows ?? []);
    } catch {
      setErroCarga("Erro de conexão ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    let r = filtro === "all" ? rows : rows.filter((x) => x.criticidade === filtro);
    if (soRevisar) r = r.filter((x) => x.temEstimativa);
    if (codAplFiltro !== null) r = r.filter((x) => x.codApl === codAplFiltro);
    return r;
  }, [rows, filtro, soRevisar, codAplFiltro]);

  const ativoOpts = useMemo(
    () =>
      rows
        .map((r) => ({ codApl: r.codApl, descricao: r.descricao || r.tag, tag: r.tag }))
        .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR")),
    [rows]
  );
  const resumo = useMemo(() => {
    const fechados = rows.filter((r) => r.fechado).length;
    const aRevisar = rows.filter((r) => r.temEstimativa).length;
    return { total: rows.length, fechados, abertos: rows.length - fechados, aRevisar };
  }, [rows]);

  function setCampo(
    codApl: number,
    campo: "horasFuncionamento" | "horasParadaNaoPlanejada" | "numeroFalhas",
    valor: number,
  ) {
    setRows((rs) => rs.map((r) => (r.codApl === codApl ? { ...r, [campo]: valor } : r)));
  }

  const salvar = useCallback(
    async (row: FechamentoRow, fechadoAlvo: boolean) => {
      setSavingCodApl(row.codApl);
      setErroSalvar("");
      try {
        const res = await fetch("/api/pcm/ativo-saude/fechamento", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codApl: row.codApl,
            ano,
            mes,
            horasFuncionamento: row.horasFuncionamento,
            horasParadaNaoPlanejada: row.horasParadaNaoPlanejada,
            numeroFalhas: row.numeroFalhas,
            fechado: fechadoAlvo,
            tag: row.tag,
            descricao: row.descricao,
          }),
        });
        if (!res.ok) throw new Error();
        setRows((rs) =>
          rs.map((r) => (r.codApl === row.codApl ? { ...r, salvo: true, fechado: fechadoAlvo } : r)),
        );
      } catch {
        setErroSalvar(`Não foi possível salvar "${row.tag}". Tente novamente.`);
      } finally {
        setSavingCodApl(null);
      }
    },
    [ano, mes],
  );

  async function fecharTodos() {
    const abertos = visible.filter((r) => !r.fechado);
    if (abertos.length === 0) return;
    setBulk(true);
    setErroSalvar("");
    try {
      await Promise.all(
        abertos.map((row) =>
          fetch("/api/pcm/ativo-saude/fechamento", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              codApl: row.codApl,
              ano,
              mes,
              horasFuncionamento: row.horasFuncionamento,
              horasParadaNaoPlanejada: row.horasParadaNaoPlanejada,
              numeroFalhas: row.numeroFalhas,
              fechado: true,
              tag: row.tag,
              descricao: row.descricao,
            }),
          }),
        ),
      );
      const fechadosIds = new Set(abertos.map((r) => r.codApl));
      setRows((rs) => rs.map((r) => (fechadosIds.has(r.codApl) ? { ...r, salvo: true, fechado: true } : r)));
    } catch {
      setErroSalvar("Alguns fechamentos podem ter falhado. Recarregue para conferir.");
    } finally {
      setBulk(false);
    }
  }

  const anos = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Fechamento mensal"
        subtitle="Confira e ajuste funcionamento, parada não planejada e nº de falhas (pré-preenchidos do Engeman) e feche o mês. Só meses fechados entram no relatório de MTBF/MTTR."
        breadcrumbs={[{ label: "PCM" }, { label: "Ativo Saúde" }, { label: "Fechamento mensal" }]}
      />

      {/* Toolbar: competência + filtro + ações */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Ativo
          <ComboboxWithCreate
            value={codAplFiltro === null ? "" : String(codAplFiltro)}
            onChange={(v) => setCodAplFiltro(v ? Number(v) : null)}
            noneLabel="Todos os ativos"
            triggerClassName="h-9 rounded-lg max-w-[240px]"
            options={ativoOpts.map((a) => ({ value: String(a.codApl), label: `${a.descricao}${a.tag ? ` (${a.tag})` : ""}` }))}
          />
        </label>

        <div className="flex items-center gap-1.5">
          {(["all", "A", "B", "C"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                filtro === f ? "bg-blue-600 text-white border-blue-600" : "bg-card text-muted-foreground border-border hover:bg-muted",
              )}
            >
              {f === "all" ? "Todos" : <>Criticidade {f}</>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSoRevisar((v) => !v)}
            title="Mostrar só os ativos com falha sem o carimbo de parada MAQPAR→MAQFUN (parada principal entrou como 0h)"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              soRevisar
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-card text-warning border-warning/30 hover:bg-warning/10",
            )}
          >
            <TriangleAlert className="w-3.5 h-3.5" /> Só a revisar
            {resumo.aRevisar > 0 ? ` (${resumo.aRevisar})` : ""}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>{resumo.fechados}/{resumo.total} fechados</span>
          <button
            type="button"
            onClick={fecharTodos}
            disabled={bulk || loading || visible.every((r) => r.fechado)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {bulk ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Fechar todos (visíveis)
          </button>
        </div>
      </div>

      {erroSalvar && (
        <div className="mx-8 mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erroSalvar}
        </div>
      )}

      {/* Observação sobre o sinal de estimativa */}
      {!loading && !erroCarga && resumo.aRevisar > 0 && (
        <div className="mx-8 mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
          <span>
            A tag <strong>Revisar</strong> indica que há <strong>falha sem o carimbo de parada</strong>{" "}
            <code>MAQPAR→MAQFUN</code> no Engeman — nesse caso a parada principal entra como{" "}
            <strong>0h</strong> (só contam paradas adicionais, se houver). Vale conferir/preencher
            antes de fechar o mês. Use o filtro <strong>“Só a revisar”</strong> para ver apenas
            esses ativos.
          </span>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 flex flex-col px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : erroCarga ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-warning/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-foreground">{erroCarga}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <PackageSearch className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum ativo neste mês</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sem falhas registradas no Engeman em {MESES[mes - 1]}/{ano} para o filtro atual.
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-auto min-h-0">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground uppercase tracking-wider shadow-sm">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Ativo</th>
                  <th className="text-center font-medium px-2 py-2 w-12">Crit.</th>
                  <th className="text-right font-medium px-2 py-2 w-32">Funcionamento (h)</th>
                  <th className="text-right font-medium px-2 py-2 w-32">Parada não planej. (h)</th>
                  <th className="text-right font-medium px-2 py-2 w-24">Nº falhas</th>
                  <th className="text-right font-medium px-2 py-2 w-24">MTBF</th>
                  <th className="text-right font-medium px-2 py-2 w-24">MTTR</th>
                  <th className="text-right font-medium px-3 py-2 w-44">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((row) => {
                  const mtbf = calcMtbf(row.horasFuncionamento, row.horasParadaNaoPlanejada, row.numeroFalhas);
                  const mttr = calcMttr(row.horasParadaNaoPlanejada, row.numeroFalhas);
                  const saving = savingCodApl === row.codApl || bulk;
                  return (
                    <Fragment key={row.codApl}>
                    <tr
                      className={cn(row.fechado ? "bg-success/10" : row.temEstimativa && "bg-warning/10")}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDetalhe((d) => (d === row.codApl ? null : row.codApl))}
                            className="text-muted-foreground hover:text-muted-foreground shrink-0"
                            title="Ver as OS do Engeman deste ativo no mês"
                          >
                            {detalhe === row.codApl ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <div className="min-w-0">
                            <div className="text-foreground truncate max-w-[260px]" title={row.descricao}>{row.descricao}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{row.tag}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {row.criticidade ? <CriticidadeBadge value={row.criticidade} /> : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number" min={0} step={1}
                          value={row.horasFuncionamento}
                          disabled={row.fechado || saving}
                          onChange={(e) => setCampo(row.codApl, "horasFuncionamento", e.target.value === "" ? 0 : Number(e.target.value))}
                          className="w-24 rounded border border-border px-2 py-1 text-right tabular-nums disabled:bg-muted disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {row.temEstimativa && (
                          <div className="flex justify-end mb-1">
                            <span
                              className="inline-flex items-center gap-1 rounded bg-warning/15 text-warning px-1.5 py-0.5 text-[10px] font-semibold"
                              title="Há falha sem o carimbo de parada MAQPAR→MAQFUN — a parada principal entrou como 0h. Confira/preencha antes de fechar."
                            >
                              <TriangleAlert className="w-3 h-3" /> Revisar
                            </span>
                          </div>
                        )}
                        <input
                          type="number" min={0} step={0.5}
                          value={row.horasParadaNaoPlanejada}
                          disabled={row.fechado || saving}
                          title={row.temEstimativa ? "Há falha sem o carimbo de parada MAQPAR→MAQFUN (parada principal = 0h)" : `Engeman: ${numFmt.format(row.engemanParada)} h`}
                          onChange={(e) => setCampo(row.codApl, "horasParadaNaoPlanejada", e.target.value === "" ? 0 : Number(e.target.value))}
                          className="w-24 rounded border border-border px-2 py-1 text-right tabular-nums disabled:bg-muted disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number" min={0} step={1}
                          value={row.numeroFalhas}
                          disabled={row.fechado || saving}
                          title={`Engeman: ${row.engemanFalhas}`}
                          onChange={(e) => setCampo(row.codApl, "numeroFalhas", e.target.value === "" ? 0 : Number(e.target.value))}
                          className="w-16 rounded border border-border px-2 py-1 text-right tabular-nums disabled:bg-muted disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-info">{fmtH(mtbf)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">{fmtH(mttr)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.fechado ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                                <Lock className="w-3.5 h-3.5" /> Fechado
                              </span>
                              <button
                                type="button" disabled={saving}
                                onClick={() => salvar(row, false)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                              >
                                <Unlock className="w-3.5 h-3.5" /> Reabrir
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button" disabled={saving}
                                onClick={() => salvar(row, false)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                              >
                                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
                              </button>
                              <button
                                type="button" disabled={saving}
                                onClick={() => salvar(row, true)}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                              >
                                <Lock className="w-3.5 h-3.5" /> Fechar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {detalhe === row.codApl && (
                      <tr>
                        <td colSpan={8} className="bg-muted/70 px-4 py-3 border-b border-border">
                          <DetalheOs codApl={row.codApl} ano={ano} mes={mes} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
