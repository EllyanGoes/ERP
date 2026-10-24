"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import SelectMenu from "@/components/shared/SelectMenu";
import { usePersistedState } from "@/lib/use-persisted-state";
import {
  AlertTriangle, CheckCircle2, XCircle, Info,
  RefreshCw, ArrowLeft, ClipboardList,
  MapPin, Clock, Tag, Database, Timer, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualidadeResponse, OsRef, AtivoRef } from "@/app/api/pcm/qualidade/route";

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Bom" : score >= 60 ? "Regular" : "Crítico";
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <svg width={110} height={110} className="-rotate-90">
        <circle cx={55} cy={55} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
        <circle
          cx={55} cy={55} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center" style={{ marginTop: -76 }}>
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

// ── Coverage bar ──────────────────────────────────────────────────────────────
function CoverageBar({
  label, value, total, color,
}: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value} <span className="text-muted-foreground font-normal">({pct.toFixed(1)}%)</span></span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ level }: { level: "ok" | "warn" | "error" }) {
  if (level === "ok")    return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />;
  if (level === "warn")  return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
  return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({
  icon: Icon, title, subtitle, level, children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  level: "ok" | "warn" | "error";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const borderCls = level === "ok" ? "border-green-100" : level === "warn" ? "border-amber-100" : "border-danger/20";
  const bgCls     = level === "ok" ? "bg-success/10"  : level === "warn" ? "bg-warning/10"  : "bg-danger/10";

  return (
    <div className={cn("rounded-xl border overflow-hidden", borderCls)}>
      <div className={cn("flex items-start gap-3 px-5 py-4", bgCls)}>
        <div className="mt-0.5 p-2 bg-card rounded-lg shadow-sm">
          <Icon className={cn("w-4 h-4", level === "ok" ? "text-success" : level === "warn" ? "text-warning" : "text-danger")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm">{title}</p>
            <StatusIcon level={level} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {children && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-info hover:underline shrink-0 mt-0.5"
          >
            {open ? "Ocultar" : "Ver detalhes"}
          </button>
        )}
      </div>
      {open && children && (
        <div className="px-5 py-4 border-t border-border bg-card">{children}</div>
      )}
    </div>
  );
}

// ── Helpers de exibição ───────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta", PLANEJADA: "Planejada", EM_EXECUCAO: "Em execução", PAUSADA: "Pausada",
  AGUARDANDO_MATERIAL: "Aguard. material", AGUARDANDO_TERCEIRO: "Aguard. terceiro",
  ENCERRADA: "Encerrada (validar)", CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function OsLink({ id, numero }: { id: string; numero: string }) {
  return <Link href={`/pcm/os/${id}`} className="font-mono font-semibold text-info hover:underline">{numero}</Link>;
}

function TabelaOs<T extends OsRef>({ lista, extra }: { lista: T[]; extra?: { titulo: string; render: (o: T) => React.ReactNode } }) {
  if (lista.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-3">Nº OS</th>
            <th className="text-left py-1.5 pr-3">Data</th>
            <th className="text-left py-1.5 pr-3">Tipo</th>
            <th className="text-left py-1.5 pr-3">Ativo</th>
            <th className="text-left py-1.5 pr-3">Status</th>
            {extra && <th className="text-left py-1.5">{extra.titulo}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {lista.map((o) => (
            <tr key={o.id} className="hover:bg-muted">
              <td className="py-1.5 pr-3"><OsLink id={o.id} numero={o.numero} /></td>
              <td className="py-1.5 pr-3 text-muted-foreground">{fmtData(o.data)}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{o.tipo}</td>
              <td className="py-1.5 pr-3 text-foreground">{o.ativo ?? <span className="text-muted-foreground/60">—</span>}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{STATUS_LABEL[o.status] ?? o.status}</td>
              {extra && <td className="py-1.5">{extra.render(o)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaAtivos({ lista }: { lista: AtivoRef[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="overflow-x-auto max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="text-left py-1.5 pr-4">TAG</th>
            <th className="text-left py-1.5">Ativo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {lista.map((a) => (
            <tr key={a.codApl} className="hover:bg-muted">
              <td className="py-1.5 pr-4">
                <Link href={`/pcm/ativos?ativo=${a.codApl}`} className="font-mono text-[11px] text-info hover:underline">{a.tag}</Link>
              </td>
              <td className="py-1.5 text-foreground">{a.descricao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PERIODOS = [
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
  { value: "365", label: "Últimos 12 meses" },
  { value: "730", label: "Últimos 24 meses" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QualidadeDadosPage() {
  const router = useRouter();
  const [data, setData] = useState<QualidadeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = usePersistedState("pcm:qualidade:dias", "365");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pcm/qualidade?dias=${dias}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [dias]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (
    <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Analisando a qualidade dos dados da Manutenção…</span>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-sm">
      <Database className="w-10 h-10 text-red-300" />
      <p className="font-semibold text-danger">Erro ao carregar dados</p>
      <p className="text-muted-foreground text-center max-w-sm">Não foi possível carregar os dados de qualidade.</p>
      <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={load}>
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </Button>
    </div>
  );

  const scoreColor = data.score >= 80 ? "text-success" : data.score >= 60 ? "text-warning" : "text-danger";
  const scoreLabel = data.score >= 80 ? "Dados confiáveis" : data.score >= 60 ? "Atenção necessária" : "Dados críticos";

  // Níveis de criticidade
  const lvlOsAtivo  = data.osSemAtivo.pct > 20 ? "error" : data.osSemAtivo.pct > 5 ? "warn" : "ok";
  const lvlFalha    = data.corretivaSemFalha.pct > 20 ? "error" : data.corretivaSemFalha.total > 0 ? "warn" : "ok";
  const lvlParada   = data.paradaSemFim.fechadas > 0 ? "error" : data.paradaSemFim.total > 0 ? "warn" : "ok";
  const lvlApont    = data.apontamentoAberto.total > 0 ? "warn" : "ok";
  const lvlLocal    = data.ativoSemLocal.total > 0 ? "warn" : "ok";
  const lvlCritico  = data.criticoSemPlano.total > 0 ? "error" : "ok";

  return (
    <div>
      <PageHeader
        title="Qualidade dos Dados — Manutenção"
        breadcrumbs={[
          { label: "Manutenção" },
          { label: "Ativo Saúde", href: "/pcm/ativo-saude" },
          { label: "Qualidade dos Dados" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <SelectMenu value={dias} onChange={setDias} options={PERIODOS} className="w-44" />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/pcm/ativo-saude")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">

        {/* ── Score + resumo ────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-8">
            <div className="relative flex items-center justify-center shrink-0">
              <ScoreRing score={data.score} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-lg font-bold mb-0.5", scoreColor)}>{scoreLabel}</p>
              <p className="text-xs text-muted-foreground mb-4">
                {data.totalOs} OS no período ({data.totalCorretivas} corretivas concluídas) — últimos {data.periodo} dias.
              </p>
              <div className="space-y-2.5">
                <CoverageBar label="OS com ativo vinculado" value={data.totalOs - data.osSemAtivo.total} total={data.totalOs} color="bg-green-500" />
                <CoverageBar label="Corretivas com sintoma e causa" value={data.totalCorretivas - data.corretivaSemFalha.total} total={data.totalCorretivas} color="bg-blue-500" />
                <CoverageBar label="Corretivas com parada registrada (início e fim)" value={data.comParada.total} total={data.totalCorretivas} color="bg-amber-400" />
                <CoverageBar label="Equipamentos com localização" value={data.ativoSemLocal.totalAtivos - data.ativoSemLocal.total} total={data.ativoSemLocal.totalAtivos} color="bg-purple-400" />
                <CoverageBar label="Ativos críticos (A) com plano ativo" value={data.criticoSemPlano.totalCriticos - data.criticoSemPlano.total} total={data.criticoSemPlano.totalCriticos} color="bg-rose-400" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bloco informativo ─────────────────────────────────────────── */}
        <div className="bg-info/10 border border-info/20 rounded-xl px-5 py-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-info space-y-1">
            <p className="font-semibold">Por que isso importa</p>
            <p className="text-xs text-info">
              <strong>MTBF</strong> = (período − horas de reparo) ÷ nº de falhas &nbsp;|&nbsp;
              <strong>MTTR</strong> = horas de reparo ÷ nº de falhas. Falha é corretiva concluída com
              <strong> sintoma</strong> registrado; o tempo de reparo vem da <strong>parada</strong> (início → fim) da OS.
            </p>
            <p className="text-xs text-info">
              OS sem ativo não entram em nenhum indicador; corretiva sem sintoma não conta como falha; parada sem fim
              deixa o ativo como PARADO indefinidamente.
            </p>
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pontos de atenção</p>

        <Section
          icon={Tag}
          title={`OS sem ativo — ${data.osSemAtivo.total} OS (${data.osSemAtivo.pct}%)`}
          subtitle="OS não canceladas do período sem ativo vinculado. Ficam fora de MTBF/MTTR, custo por ativo e histórico."
          level={lvlOsAtivo}
        >
          <p className="text-xs text-muted-foreground mb-3">
            <strong className="text-foreground">Ação:</strong> abrir a OS e informar o ativo (as mais recentes abaixo).
          </p>
          <TabelaOs lista={data.osSemAtivo.lista} />
        </Section>

        <Section
          icon={ClipboardList}
          title={`Corretivas concluídas sem sintoma/causa — ${data.corretivaSemFalha.total} (${data.corretivaSemFalha.pct}%)`}
          subtitle={`${data.corretivaSemFalha.semSintoma} sem sintoma (não contam como falha) · ${data.corretivaSemFalha.semCausa} sem causa (fora do FMEA).`}
          level={lvlFalha}
        >
          <TabelaOs
            lista={data.corretivaSemFalha.lista}
            extra={{ titulo: "Falta", render: (o) => <span className="text-danger font-medium">{o.falta}</span> }}
          />
          {data.corretivaSemFalha.total > data.corretivaSemFalha.lista.length && (
            <p className="text-xs text-muted-foreground mt-2">
              +{data.corretivaSemFalha.total - data.corretivaSemFalha.lista.length} registros adicionais não exibidos.
            </p>
          )}
        </Section>

        <Section
          icon={Clock}
          title={`Parada sem fim — ${data.paradaSemFim.total} OS${data.paradaSemFim.fechadas ? ` (${data.paradaSemFim.fechadas} já encerradas/concluídas)` : ""}`}
          subtitle="OS com início de parada e sem retorno. O ativo segue PARADO; se a OS já foi encerrada, o fim da parada foi esquecido."
          level={lvlParada}
        >
          {data.paradaSemFim.lista.length === 0 ? (
            <p className="text-xs text-success">Nenhuma parada em aberto.</p>
          ) : (
            <TabelaOs
              lista={data.paradaSemFim.lista}
              extra={{
                titulo: "Parada desde",
                render: (o) => (
                  <span className="text-warning">{fmtDataHora(o.paradaInicio)} · {o.horas}h</span>
                ),
              }}
            />
          )}
        </Section>

        <Section
          icon={Timer}
          title={`Apontamentos abertos há mais de 24h — ${data.apontamentoAberto.total}`}
          subtitle="Cronômetro de mão de obra iniciado e nunca encerrado: infla horas e custo da OS."
          level={lvlApont}
        >
          {data.apontamentoAberto.lista.length === 0 ? (
            <p className="text-xs text-success">Nenhum apontamento esquecido.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">Nº OS</th>
                  <th className="text-left py-1.5 pr-3">Executante</th>
                  <th className="text-left py-1.5 pr-3">Início</th>
                  <th className="text-right py-1.5">Aberto há</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.apontamentoAberto.lista.map((a, i) => (
                  <tr key={`${a.ordemId}-${i}`} className="hover:bg-muted">
                    <td className="py-1.5 pr-3"><OsLink id={a.ordemId} numero={a.numero} /></td>
                    <td className="py-1.5 pr-3 text-foreground">{a.nome}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{fmtDataHora(a.inicio)}</td>
                    <td className="py-1.5 text-right font-bold text-warning">{a.horas}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          icon={ShieldAlert}
          title={`Ativos críticos (A) sem plano ativo — ${data.criticoSemPlano.total} de ${data.criticoSemPlano.totalCriticos}`}
          subtitle="Ativo classificado como crítico sem nenhum plano de manutenção ativo aplicado: só recebe corretiva."
          level={lvlCritico}
        >
          <p className="text-xs text-muted-foreground mb-3">
            <strong className="text-foreground">Ação:</strong> aplicar um plano preventivo/inspeção em Manutenção › Planos.
          </p>
          <TabelaAtivos lista={data.criticoSemPlano.lista} />
        </Section>

        <Section
          icon={MapPin}
          title={`Equipamentos sem localização — ${data.ativoSemLocal.total} de ${data.ativoSemLocal.totalAtivos}`}
          subtitle="Equipamentos, componentes e veículos ativos sem localização preenchida na ficha (nós do tipo Local não entram)."
          level={lvlLocal}
        >
          <p className="text-xs text-muted-foreground mb-3">
            <strong className="text-foreground">Ação:</strong> abrir o ativo em Manutenção › Ativos e preencher a localização.
          </p>
          <TabelaAtivos lista={data.ativoSemLocal.lista} />
        </Section>

        {/* ── Checklist ─────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Checklist para cada OS corretiva</p>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Vincular o ativo à OS",                                     critical: true  },
              { label: "Registrar o início da parada da máquina",                    critical: true  },
              { label: "Registrar o fim da parada ao liberar a máquina",             critical: true  },
              { label: "Informar sintoma e causa no serviço executado",              critical: true  },
              { label: "Encerrar o apontamento de mão de obra ao sair do serviço",   critical: false },
              { label: "Encerrar a OS e validar a conclusão no PCM",                 critical: true  },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <div className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                  item.critical ? "border-red-300 bg-danger/10" : "border-border"
                )}>
                  {item.critical && <span className="text-red-500 text-[10px] font-bold">!</span>}
                </div>
                <span>{item.label}</span>
                {item.critical && (
                  <span className="ml-auto text-[10px] font-semibold text-red-500 bg-danger/10 border border-danger/20 rounded px-1.5 py-0.5 shrink-0">
                    Obrigatório
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-right">
          Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")} · Fonte: Manutenção (ERP)
        </p>
      </div>
    </div>
  );
}
