"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, XCircle, Info,
  RefreshCw, ArrowLeft, ClipboardList,
  MapPin, Clock, Tag, Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualidadeResponse } from "@/app/api/pcm/qualidade/route";

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QualidadeDadosPage() {
  const router = useRouter();
  const [data, setData] = useState<QualidadeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [engemanOffline, setEngemanOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pcm/qualidade");
      if (res.status === 503) { setEngemanOffline(true); setData(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEngemanOffline(false);
      setData(await res.json());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Analisando qualidade dos dados no Engeman…</span>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-sm">
      <Database className="w-10 h-10 text-red-300" />
      <p className="font-semibold text-danger">
        {engemanOffline ? "Engeman inacessível" : "Erro ao carregar dados"}
      </p>
      <p className="text-muted-foreground text-center max-w-sm">
        {engemanOffline
          ? "O servidor Engeman não está acessível neste ambiente (rede local apenas)."
          : "Não foi possível carregar os dados de qualidade."}
      </p>
      <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={load}>
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </Button>
    </div>
  );

  const scoreColor = data.score >= 80 ? "text-success" : data.score >= 60 ? "text-warning" : "text-danger";
  const scoreLabel = data.score >= 80 ? "Dados confiáveis" : data.score >= 60 ? "Atenção necessária" : "Dados críticos";

  // Níveis de criticidade
  const levelOsSemApl  = data.osSemEquipamento.pct > 20 ? "error" : data.osSemEquipamento.pct > 10 ? "warn" : "ok";
  const levelTempo     = data.semNenhumTempo.pct > 5    ? "error" : data.semNenhumTempo.pct > 2    ? "warn" : "ok";
  const levelLocal     = data.equipSemLocal.total > 20  ? "warn"  : data.equipSemLocal.total > 0   ? "warn" : "ok";
  const levelLongas    = data.osTempoLongo.total > 0    ? "warn"  : "ok";

  return (
    <div>
      <PageHeader
        title="Qualidade dos Dados — PCM"
        breadcrumbs={[
          { label: "PCM" },
          { label: "Ativo Saúde", href: "/pcm/ativo-saude" },
          { label: "Qualidade dos Dados" },
        ]}
        action={
          <div className="flex items-center gap-2">
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

      <div className="px-8 pb-8 max-w-4xl space-y-6">

        {/* ── Score + resumo ────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-8">
            {/* Ring */}
            <div className="relative flex items-center justify-center shrink-0">
              <ScoreRing score={data.score} />
            </div>

            {/* Summary */}
            <div className="flex-1 min-w-0">
              <p className={cn("text-lg font-bold mb-0.5", scoreColor)}>{scoreLabel}</p>
              <p className="text-xs text-muted-foreground mb-4">
                Score calculado sobre {data.totalCorretivas} OS corretivas dos últimos {data.periodo} dias.
                Fonte: Engeman CMMS.
              </p>
              <div className="space-y-2.5">
                <CoverageBar
                  label="OS com equipamento vinculado"
                  value={data.totalCorretivas - data.osSemEquipamento.total}
                  total={data.totalCorretivas}
                  color="bg-green-500"
                />
                <CoverageBar
                  label="OS com MAQPAR + MAQFUN (parada real)"
                  value={data.comMaqparMaqfun.total}
                  total={data.totalCorretivas}
                  color="bg-blue-500"
                />
                <CoverageBar
                  label="OS com horas executadas (HOREXEREA)"
                  value={data.semMaqparComHh.total}
                  total={data.totalCorretivas}
                  color="bg-amber-400"
                />
                <CoverageBar
                  label="Equipamentos com local de instalação"
                  value={data.equipSemLocal.totalAtivos - data.equipSemLocal.total}
                  total={data.equipSemLocal.totalAtivos}
                  color="bg-purple-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bloco informativo ─────────────────────────────────────────── */}
        <div className="bg-info/10 border border-info/20 rounded-xl px-5 py-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-info space-y-1">
            <p className="font-semibold">Como o relatório calcula os indicadores</p>
            <p className="text-xs text-info">
              <strong>MTBF</strong> = (período total − horas de reparo) ÷ nº de falhas &nbsp;|&nbsp;
              <strong>MTTR</strong> = horas de reparo ÷ nº de falhas &nbsp;|&nbsp;
              <strong>Confiabilidade</strong> R(24h) = e<sup>−24/MTBF</sup> — probabilidade de operar 24h sem falha
            </p>
            <p className="text-xs text-info">
              O tempo de reparo é lido de <strong>MAQPAR → MAQFUN</strong> (hora parada → hora retorno).
              Quando não preenchido, usa <strong>Horas Executadas Reais (HOREXEREA)</strong> como fallback.
              OS sem nenhum dado de tempo contam como falha mas com 0h de reparo, distorcendo o MTTR para baixo.
            </p>
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pontos de atenção</p>

        {/* ── Seção 1: OS sem equipamento ───────────────────────────────── */}
        <Section
          icon={Tag}
          title={`OS sem Equipamento Vinculado — ${data.osSemEquipamento.total} OS (${data.osSemEquipamento.pct}%)`}
          subtitle="OS corretivas fechadas sem CODAPL preenchido. Essas ordens NÃO entram no cálculo de MTBF/MTTR e são invisíveis no relatório."
          level={levelOsSemApl}
        >
          <p className="text-xs text-muted-foreground mb-3">
            <strong className="text-foreground">Ação:</strong> Ao abrir uma OS corretiva no Engeman, sempre selecionar o equipamento no campo <em>Aplicação</em>.
          </p>
          {data.osSemEquipamento.lista.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-4">Nº OS</th>
                    <th className="text-left py-1.5 pr-4">Data Abertura</th>
                    <th className="text-left py-1.5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.osSemEquipamento.lista.slice(0, 15).map((os) => (
                    <tr key={os.codord} className="hover:bg-muted">
                      <td className="py-1.5 pr-4 text-orange-500 font-medium">{os.codord}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{os.datent}</td>
                      <td className="py-1.5 text-muted-foreground">{os.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.osSemEquipamento.lista.length > 15 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{data.osSemEquipamento.lista.length - 15} registros adicionais não exibidos.
                </p>
              )}
            </div>
          )}
        </Section>

        {/* ── Seção 2: Tempo de parada ──────────────────────────────────── */}
        <Section
          icon={Clock}
          title={`Tempo de Parada — ${data.comMaqparMaqfun.pct}% com MAQPAR+MAQFUN preenchidos`}
          subtitle="MAQPAR (hora parada) e MAQFUN (hora retorno) são os campos mais precisos para calcular o tempo real de inatividade."
          level={levelTempo}
        >
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-success/10 border border-green-100 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-success">{data.comMaqparMaqfun.total}</p>
                <p className="text-success font-medium">Com MAQPAR+MAQFUN</p>
                <p className="text-green-500 text-[11px]">Tempo real registrado</p>
              </div>
              <div className="bg-warning/10 border border-amber-100 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-warning">{data.semMaqparComHh.total}</p>
                <p className="text-warning font-medium">Apenas HOREXEREA</p>
                <p className="text-amber-500 text-[11px]">Tempo estimado (fallback)</p>
              </div>
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-danger">{data.semNenhumTempo.total}</p>
                <p className="text-danger font-medium">Sem nenhum dado</p>
                <p className="text-red-500 text-[11px]">Contam como 0h de reparo</p>
              </div>
            </div>
            <p>
              <strong className="text-foreground">Ação:</strong> Ao <strong>abrir</strong> a OS, registrar
              a <em>Hora Parada Máquina</em>. Ao <strong>fechar</strong>, registrar a <em>Hora Retorno</em>.
              Se não for possível, preencher as <em>Horas Executadas Reais</em> (HOREXEREA).
            </p>
          </div>
        </Section>

        {/* ── Seção 3: Equipamentos sem local ──────────────────────────── */}
        <Section
          icon={MapPin}
          title={`Equipamentos sem Local de Instalação — ${data.equipSemLocal.total} de ${data.equipSemLocal.totalAtivos} ativos`}
          subtitle="Equipamentos sem local aparecem como 'Não informado' no filtro do dashboard, dificultando a análise por área."
          level={levelLocal}
        >
          <p className="text-xs text-muted-foreground mb-3">
            <strong className="text-foreground">Ação:</strong> Acessar o cadastro de cada equipamento no Engeman e preencher o campo <em>Local de Instalação</em>.
          </p>
          {data.equipSemLocal.lista.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-4">Cód APL</th>
                    <th className="text-left py-1.5 pr-4">TAG</th>
                    <th className="text-left py-1.5">Equipamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.equipSemLocal.lista.map((e) => (
                    <tr key={e.codApl} className="hover:bg-muted">
                      <td className="py-1.5 pr-4 text-orange-500 font-medium">{e.codApl}</td>
                      <td className="py-1.5 pr-4 font-mono text-muted-foreground text-[11px]">{e.tag}</td>
                      <td className="py-1.5 text-foreground">{e.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── Seção 4: OS com tempo longo ──────────────────────────────── */}
        <Section
          icon={AlertTriangle}
          title={`OS com Reparo > 72h — ${data.osTempoLongo.total} ocorrência${data.osTempoLongo.total !== 1 ? "s" : ""}`}
          subtitle="Tempos de reparo acima de 72h podem indicar erro de digitação nas datas de MAQPAR/MAQFUN, distorcendo o MTTR para cima."
          level={levelLongas}
        >
          {data.osTempoLongo.lista.length === 0 ? (
            <p className="text-xs text-success">Nenhuma OS com reparo acima de 72h. ✓</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                <strong className="text-foreground">Ação:</strong> Verificar cada OS abaixo no Engeman e corrigir as datas de MAQPAR/MAQFUN se forem inválidas.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5">Nº OS</th>
                    <th className="text-left py-1.5">Equipamento</th>
                    <th className="text-left py-1.5">TAG</th>
                    <th className="text-left py-1.5">Início parada</th>
                    <th className="text-left py-1.5">Retorno</th>
                    <th className="text-right py-1.5">Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.osTempoLongo.lista.map((os) => (
                    <tr key={os.codord} className="hover:bg-muted">
                      <td className="py-1.5 font-mono font-semibold text-warning">{os.codord}</td>
                      <td className="py-1.5 text-foreground">{os.equip}</td>
                      <td className="py-1.5 font-mono text-muted-foreground text-[11px]">{os.tag}</td>
                      <td className="py-1.5 text-muted-foreground">{os.maqpar}</td>
                      <td className="py-1.5 text-muted-foreground">{os.maqfun}</td>
                      <td className="py-1.5 text-right font-bold text-warning">{os.hhReparo}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {/* ── Checklist ─────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Checklist para cada OS corretiva</p>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Vincular o equipamento (Aplicação) à OS",                    critical: true  },
              { label: "Registrar a hora de parada da máquina (MAQPAR)",              critical: true  },
              { label: "Registrar a hora de retorno da máquina (MAQFUN) ao fechar",   critical: true  },
              { label: "Preencher Horas Executadas Reais (HOREXEREA) se não houver MAQPAR/MAQFUN", critical: false },
              { label: "Fechar a OS após conclusão do serviço",                        critical: true  },
              { label: "Verificar se MAQFUN > MAQPAR (retorno após parada)",           critical: false },
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
          Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")} ·{" "}
          Fonte: Engeman CMMS
        </p>
      </div>
    </div>
  );
}
