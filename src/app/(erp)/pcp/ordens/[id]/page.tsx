"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { ArrowLeft, RefreshCw, Flame, Play, CheckCircle2, Ban, Send, AlertTriangle } from "lucide-react";

interface Etapa {
  id: string;
  sequencia: number;
  nome: string;
  kind: string;
  centroTrabalho: string | null;
  estadoSaida: string | null;
  status: string;
  qtdEntrada: string | number | null;
  qtdSaida: string | number | null;
  qtdPerda: string | number | null;
  vagoes: number | null;
  vagonetas: number | null;
  apontadoPor: string | null;
}
interface Consumo { id: string; descricao: string | null; quantidadeKg: string | number; milheirosProduzidos: string | number | null; data: string; }
interface Ordem {
  id: string; numero: string; status: string; estadoAtual: string;
  quantidadePlanejada: string | number; unidade: string | null;
  item: { codigo: string; descricao: string } | null;
  fluxoVersao: { versao: number; fluxo: { nome: string } } | null;
  etapas: Etapa[];
  consumos: Consumo[];
}

const STATUS_OP: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: "Rascunho", cls: "bg-gray-100 text-gray-600" },
  LIBERADA: { label: "Liberada", cls: "bg-blue-50 text-blue-700" },
  EM_PRODUCAO: { label: "Em produção", cls: "bg-amber-50 text-amber-700" },
  CONCLUIDA: { label: "Concluída", cls: "bg-emerald-50 text-emerald-700" },
  CANCELADA: { label: "Cancelada", cls: "bg-red-50 text-red-600" },
};
const ETAPA_STATUS: Record<string, string> = { PENDENTE: "bg-gray-100 text-gray-500", EM_EXECUCAO: "bg-amber-100 text-amber-700", CONCLUIDA: "bg-emerald-100 text-emerald-700" };
const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };

type Aponta = { qtdEntrada: string; qtdSaida: string; qtdPerda: string; vagoes: string; vagonetas: string; biomassaKg: string; milheiros: string };
const inCls = "w-full rounded border border-gray-200 px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-cyan-500";

function s(v: string | number | null | undefined): string { return v == null ? "" : String(v); }

export default function OrdemDetalhePage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const router = useRouter();
  useTabTitle("Ordem de Produção");

  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aponta, setAponta] = useState<Record<string, Aponta>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pcp/ordens/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setOrdem(j.data);
      const init: Record<string, Aponta> = {};
      for (const e of j.data.etapas as Etapa[]) {
        init[e.id] = {
          qtdEntrada: s(e.qtdEntrada), qtdSaida: s(e.qtdSaida), qtdPerda: s(e.qtdPerda),
          vagoes: s(e.vagoes), vagonetas: s(e.vagonetas), biomassaKg: "", milheiros: "",
        };
      }
      setAponta(init);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  async function mudarStatus(status: string) {
    setBusy("status");
    try {
      const r = await fetch(`/api/pcp/ordens/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error ?? "Erro"); }
      await load();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setBusy(null); }
  }

  async function apontar(etapa: Etapa, status?: string) {
    const a = aponta[etapa.id];
    setBusy(etapa.id);
    setErro(null);
    try {
      const r = await fetch(`/api/pcp/ordens/${id}/apontar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etapaId: etapa.id,
          qtdEntrada: a.qtdEntrada, qtdSaida: a.qtdSaida, qtdPerda: a.qtdPerda,
          vagoes: a.vagoes, vagonetas: a.vagonetas,
          biomassaKg: a.biomassaKg, milheirosProduzidos: a.milheiros,
          status: status ?? undefined,
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error ?? "Erro ao apontar"); }
      await load();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao apontar"); } finally { setBusy(null); }
  }

  function setA(etapaId: string, patch: Partial<Aponta>) {
    setAponta((prev) => ({ ...prev, [etapaId]: { ...prev[etapaId], ...patch } }));
  }

  if (erro && !ordem) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <AlertTriangle className="w-7 h-7 text-amber-400" /><p className="text-sm text-gray-600">{erro}</p>
      </div>
    );
  }
  if (!ordem) {
    return <div className="flex items-center justify-center h-full text-gray-400 gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>;
  }

  const st = STATUS_OP[ordem.status] ?? { label: ordem.status, cls: "bg-gray-100" };
  const totalPerda = ordem.etapas.reduce((acc, e) => acc + (Number(e.qtdPerda) || 0), 0);
  const totalBiomassa = ordem.consumos.reduce((acc, c) => acc + (Number(c.quantidadeKg) || 0), 0);
  const finalizada = ordem.status === "CONCLUIDA" || ordem.status === "CANCELADA";

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={ordem.numero}
        subtitle={`${ordem.fluxoVersao?.fluxo.nome ?? ""} · ${Number(ordem.quantidadePlanejada)} ${ordem.unidade ?? ""} · estado: ${ESTADO_LABEL[ordem.estadoAtual] ?? ordem.estadoAtual}`}
        breadcrumbs={[{ label: "PCP" }, { label: "Ordens", href: "/pcp/ordens" }, { label: ordem.numero }]}
        action={
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", st.cls)}>{st.label}</span>
            {!finalizada && (
              <>
                {ordem.status === "RASCUNHO" && (
                  <button onClick={() => mudarStatus("LIBERADA")} disabled={busy === "status"} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    <Play className="w-4 h-4" /> Liberar
                  </button>
                )}
                <button onClick={() => mudarStatus("CANCELADA")} disabled={busy === "status"} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Ban className="w-4 h-4" /> Cancelar
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4">
        <button onClick={() => router.push("/pcp/ordens")} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {/* KPIs rápidos */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-cyan-50 text-cyan-700 px-3 py-1 font-medium">
            {ordem.etapas.filter((e) => e.status === "CONCLUIDA").length}/{ordem.etapas.length} etapas concluídas
          </span>
          {totalPerda > 0 && <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 px-3 py-1 font-medium">Perda total: {totalPerda}</span>}
          {totalBiomassa > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-3 py-1 font-medium"><Flame className="w-3 h-3" /> Biomassa: {totalBiomassa} kg</span>}
        </div>

        {/* Etapas */}
        <div className="space-y-2">
          {ordem.etapas.map((e) => {
            const a = aponta[e.id] ?? { qtdEntrada: "", qtdSaida: "", qtdPerda: "", vagoes: "", vagonetas: "", biomassaKg: "", milheiros: "" };
            const ehQueima = e.estadoSaida === "QUEIMADO";
            const concl = e.status === "CONCLUIDA";
            return (
              <div key={e.id} className={cn("rounded-xl border bg-white p-3", concl ? "border-emerald-200" : "border-gray-200")}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex w-6 h-6 items-center justify-center rounded-md bg-gray-100 text-gray-500 text-xs font-semibold">{e.sequencia}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{e.nome}</p>
                    <p className="text-[11px] text-gray-400">{e.centroTrabalho ?? "—"}{e.estadoSaida ? ` · → ${ESTADO_LABEL[e.estadoSaida] ?? e.estadoSaida}` : ""}</p>
                  </div>
                  <span className={cn("ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", ETAPA_STATUS[e.status])}>
                    {e.status === "EM_EXECUCAO" ? "em execução" : e.status === "CONCLUIDA" ? "concluída" : "pendente"}
                  </span>
                </div>

                {!finalizada && (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                    <Field label="Entrada"><input className={inCls} inputMode="decimal" value={a.qtdEntrada} onChange={(ev) => setA(e.id, { qtdEntrada: ev.target.value })} /></Field>
                    <Field label="Saída"><input className={inCls} inputMode="decimal" value={a.qtdSaida} onChange={(ev) => setA(e.id, { qtdSaida: ev.target.value })} /></Field>
                    <Field label="Perda"><input className={inCls} inputMode="decimal" value={a.qtdPerda} onChange={(ev) => setA(e.id, { qtdPerda: ev.target.value })} /></Field>
                    <Field label="Vagões"><input className={inCls} inputMode="numeric" value={a.vagoes} onChange={(ev) => setA(e.id, { vagoes: ev.target.value })} /></Field>
                    {ehQueima ? (
                      <>
                        <Field label="Biomassa (kg)"><input className={inCls} inputMode="decimal" value={a.biomassaKg} onChange={(ev) => setA(e.id, { biomassaKg: ev.target.value })} /></Field>
                        <Field label="Milheiros"><input className={inCls} inputMode="decimal" value={a.milheiros} onChange={(ev) => setA(e.id, { milheiros: ev.target.value })} /></Field>
                      </>
                    ) : (
                      <Field label="Vagonetas"><input className={inCls} inputMode="numeric" value={a.vagonetas} onChange={(ev) => setA(e.id, { vagonetas: ev.target.value })} /></Field>
                    )}
                  </div>
                )}

                {!finalizada && (
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button onClick={() => apontar(e)} disabled={busy === e.id} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {busy === e.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Apontar
                    </button>
                    {!concl && (
                      <button onClick={() => apontar(e, "CONCLUIDA")} disabled={busy === e.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Concluir etapa
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Consumos de biomassa */}
        {ordem.consumos.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-amber-500" /> Consumo de biomassa</p>
            <div className="space-y-1">
              {ordem.consumos.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm text-gray-600">
                  <span>{c.descricao ?? "Caroço de açaí"}</span>
                  <span className="tabular-nums">{Number(c.quantidadeKg)} kg{c.milheirosProduzidos ? ` · ${(Number(c.quantidadeKg) / Number(c.milheirosProduzidos)).toFixed(1)} kg/milheiro` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{label}</label>
      {children}
    </div>
  );
}
