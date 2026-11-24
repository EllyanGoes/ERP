"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Página única da compra (PC-0430): cabeçalho do processo + uma aba por etapa.
// Cada aba mostra a tela de detalhe que já existia (Solicitação, Cotação,
// Pedido, Entrada) dentro de CompraEmbutidaProvider — mesmas ações, sem título
// próprio. Etapa sem documento mostra o próximo passo. A aba fica na URL
// (?aba=…&doc=…) para o link levar direto a ela.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, FileText, GanttChart, Loader2,
  PackageCheck, RefreshCw, ShoppingCart,
} from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmpresaTag from "@/components/shared/EmpresaTag";
import { AvatarUsuario } from "@/components/projetos/comum";
import { CompraEmbutidaProvider } from "@/lib/compra-embutida";
import { useTabTitle } from "@/lib/tabs-context";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import type { EtapaCompra } from "@/lib/compras-processo";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import SolicitacaoTela from "@/app/(erp)/compras/necessidades/[id]/page";
import CotacaoTela from "@/app/(erp)/suprimentos/cotacoes/[id]/page";
import PedidoTela from "@/app/(erp)/suprimentos/pedidos-compra/[id]/page";
import EntradaTela from "@/app/(erp)/suprimentos/conferencias/[id]/page";

type Doc = { id: string; numero: string; status: string; numeroAntigo?: string | null; numeroNF?: string | null };

type Compra = {
  numeroCompra: string;
  empresaId: string;
  outrasEmpresas: string[];
  etapa: EtapaCompra;
  concluido: boolean;
  assunto: string | null;
  solicitante: string | null;
  setor: string | null;
  prioridade: number | null;
  dataNecessidade: string | null;
  fornecedor: string | null;
  valor: number | null;
  entregaPrevista: string | null;
  docAtual: Record<EtapaCompra, string | null>;
  documentos: Record<EtapaCompra, Doc[]>;
  historico: { id: string; etapa: EtapaCompra | null; numero: string; statusDe: string | null; statusPara: string; usuario: string | null; em: string }[];
  marcos: { em: string; etapa: EtapaCompra; label: string; numero?: string; cancelado?: boolean; foraDeOrdem?: boolean }[];
  fases: { etapa: EtapaCompra; inicio: string; fim: string | null; emAndamento: boolean }[];
};

type Aba = EtapaCompra | "timeline";

const ETAPAS: { etapa: EtapaCompra; label: string; sigla: string; icon: typeof ClipboardList }[] = [
  { etapa: "solicitacao", label: "Solicitação", sigla: "SC", icon: ClipboardList },
  { etapa: "cotacao",     label: "Cotação",     sigla: "CT", icon: FileText },
  { etapa: "pedido",      label: "Pedido",      sigla: "PC", icon: ShoppingCart },
  { etapa: "entrada",     label: "Entrada",     sigla: "DE", icon: PackageCheck },
];
const NOME_ETAPA: Record<EtapaCompra, string> = {
  solicitacao: "Solicitação", cotacao: "Cotação", pedido: "Pedido", entrada: "Documento de Entrada",
};

const TELAS: Record<EtapaCompra, () => JSX.Element> = {
  solicitacao: SolicitacaoTela,
  cotacao: CotacaoTela,
  pedido: PedidoTela,
  entrada: EntradaTela,
};

// Próximo passo de uma etapa que ainda não tem documento.
function ProximoPasso({ etapa, compra, onIr }: { etapa: EtapaCompra; compra: Compra; onIr: (a: Aba) => void }) {
  const { documentos, docAtual } = compra;
  const sc = documentos.solicitacao[0];
  let texto = "Esta etapa ainda não começou.";
  let acao: { label: string; href?: string; aba?: Aba } | null = null;

  if (etapa === "solicitacao") {
    texto = "Esta compra começou direto pela cotação, pedido ou entrada, sem solicitação.";
  } else if (etapa === "cotacao") {
    if (sc && sc.status === "APROVADA") {
      texto = "A solicitação está aprovada e pronta para cotar.";
      acao = { label: "Gerar cotação", href: `/suprimentos/cotacoes/nova?necessidadeId=${sc.id}` };
    } else if (sc) {
      texto = "A cotação pode ser gerada quando a solicitação for aprovada.";
      acao = { label: "Ver solicitação", aba: "solicitacao" };
    } else {
      texto = "Esta compra não passou por cotação.";
    }
  } else if (etapa === "pedido") {
    if (docAtual.cotacao) {
      texto = "O pedido é gerado quando o aprovador aprova a cotação.";
      acao = { label: "Ver cotação", aba: "cotacao" };
    } else {
      texto = "Ainda não há pedido de compra.";
    }
  } else if (etapa === "entrada") {
    const pedido = documentos.pedido.find((p) => p.id === docAtual.pedido);
    if (pedido && pedido.status !== "CANCELADO") {
      texto = "Quando a mercadoria chegar, dê entrada para conferir a nota e o estoque.";
      acao = { label: "Dar entrada", href: `/suprimentos/conferencias/novo?pedidoId=${pedido.id}` };
    } else {
      texto = "A entrada é feita a partir do pedido de compra.";
    }
  }

  return (
    <div className="mx-8 my-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-14 text-center">
      <p className="text-sm text-muted-foreground max-w-md">{texto}</p>
      {acao?.href && (
        <Link href={acao.href} className="inline-flex items-center h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          {acao.label}
        </Link>
      )}
      {acao?.aba && (
        <button type="button" onClick={() => onIr(acao!.aba!)} className="text-sm font-medium text-primary hover:underline">
          {acao.label}
        </button>
      )}
    </div>
  );
}

// ── Timeline: quanto tempo a compra levou, etapa por etapa ───────────────────
const COR_ETAPA: Record<EtapaCompra, string> = {
  solicitacao: "#9ca3af", cotacao: "#f97316", pedido: "#3b82f6", entrada: "#8b5cf6",
};
const DIA = 86_400_000;
const diasEntre = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DIA);
const fmtDias = (d: number) => (d < 1 ? (d * 24 < 1 ? "< 1 h" : `${Math.round(d * 24)} h`) : `${Math.round(d)} d`);
const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Timeline({ compra }: { compra: Compra }) {
  const { fases, marcos, historico } = compra;
  if (marcos.length === 0) {
    return <p className="mx-8 my-10 text-sm text-muted-foreground text-center">Sem datas registradas para esta compra.</p>;
  }
  const duracoes = fases.map((f) => diasEntre(f.inicio, f.fim ?? new Date().toISOString()));
  const total = fases.length ? diasEntre(fases[0].inicio, fases[fases.length - 1].fim ?? new Date().toISOString()) : 0;
  const maior = Math.max(...duracoes, 0);

  // Eventos: marcos do processo + mudanças de status registradas, em ordem.
  const eventos = [
    ...marcos.map((m) => ({
      em: m.em, etapa: m.etapa, titulo: m.label, detalhe: m.numero ?? null, principal: true,
      cancelado: !!m.cancelado, foraDeOrdem: !!m.foraDeOrdem,
    })),
    ...historico.map((h) => ({
      em: h.em, etapa: h.etapa, titulo: `Status: ${h.statusDe ? `${h.statusDe} → ` : ""}${h.statusPara}`.replace(/_/g, " ").toLowerCase(),
      detalhe: [h.numero, h.usuario].filter(Boolean).join(" · ") || null, principal: false,
      cancelado: false, foraDeOrdem: false,
    })),
  ].sort((a, b) => a.em.localeCompare(b.em));

  return (
    <div className="mx-8 my-6 space-y-6 max-w-5xl rounded-xl border border-border bg-card shadow-sm p-6">
      {/* Resumo */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground">{compra.concluido ? "Tempo total da compra" : "Em andamento há"}</p>
          <p className="text-2xl font-semibold text-foreground">{fmtDias(total)}</p>
        </div>
        {fases.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {fmtData(fases[0].inicio)} → {compra.concluido && fases[fases.length - 1].fim ? fmtData(fases[fases.length - 1].fim!) : "hoje"}
          </p>
        )}
      </div>

      {/* Uma barra por etapa, proporcional ao tempo que ela levou */}
      <div className="space-y-2.5">
        {fases.map((f, i) => {
          const d = duracoes[i];
          const largura = maior > 0 ? Math.max(2, (d / maior) * 100) : 2;
          const pct = total > 0 ? Math.round((d / total) * 100) : 0;
          return (
            <div key={f.etapa} className="grid grid-cols-[120px_1fr_120px] items-center gap-3 text-sm">
              <span className="text-foreground">{NOME_ETAPA[f.etapa]}</span>
              <div className="h-6 rounded-md bg-muted/60 overflow-hidden">
                <div
                  className={cn("h-full rounded-md", f.emAndamento && "opacity-60 bg-[length:12px_12px]")}
                  style={{
                    width: `${largura}%`,
                    backgroundColor: COR_ETAPA[f.etapa],
                    backgroundImage: f.emAndamento
                      ? "linear-gradient(45deg, rgba(255,255,255,.35) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.35) 50%, rgba(255,255,255,.35) 75%, transparent 75%)"
                      : undefined,
                  }}
                  title={`${fmtData(f.inicio)} → ${f.emAndamento ? "agora" : fmtData(f.fim!)}`}
                />
              </div>
              <span className="text-right tabular-nums">
                <span className="font-semibold text-foreground">{fmtDias(d)}</span>
                <span className="text-xs text-muted-foreground"> · {pct}%{f.emAndamento ? " · aberta" : ""}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Linha do tempo dos eventos */}
      <ol className="relative border-l border-border ml-1.5 space-y-3">
        {eventos.map((e, i) => {
          const anterior = i > 0 ? eventos[i - 1].em : null;
          const intervalo = anterior ? diasEntre(anterior, e.em) : 0;
          return (
            <li key={`${e.em}-${i}`} className="relative pl-5">
              <span
                className={cn("absolute -left-[5px] top-1.5 rounded-full", e.principal ? "w-2.5 h-2.5" : "w-2 h-2 -left-[4px] bg-border")}
                style={e.principal && e.etapa ? { backgroundColor: COR_ETAPA[e.etapa] } : undefined}
              />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className={cn("text-sm", e.principal ? "font-medium text-foreground" : "text-muted-foreground first-letter:uppercase")}>
                  {e.titulo}
                </span>
                {e.detalhe && <span className="text-xs text-muted-foreground">{e.detalhe}</span>}
                {e.cancelado && (
                  <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-muted text-muted-foreground">cancelado · fora da contagem</span>
                )}
                {e.foraDeOrdem && (
                  <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-warning/15 text-warning" title="Documento criado antes da etapa anterior e vinculado depois a esta compra">
                    criado antes da etapa anterior · vinculado depois
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {fmtData(e.em)}
                  {anterior && intervalo >= 1 / 24 && <span className="ml-2 text-foreground/70">+{fmtDias(intervalo)}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function CompraPage() {
  const { numero } = useParams<{ numero: string }>();
  const numeroCompra = decodeURIComponent(numero);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const empresa = searchParams.get("empresa");

  // Cabeçalho e abas aparecem na hora ao voltar para a compra; atualiza em 2º plano.
  const { data: compra, loading, refreshing, erro, recarregar: load } = useRelatorioCache<Compra>(
    `/api/compras/compra/${encodeURIComponent(numeroCompra)}${empresa ? `?empresa=${empresa}` : ""}`,
  );
  useTabTitle(`Compra ${numeroCompra}`);

  const abaParam = searchParams.get("aba") as Aba | null;
  // "historico" é o nome antigo da aba Timeline (links já compartilhados).
  const abaNormalizada = (abaParam as string) === "historico" ? "timeline" : abaParam;
  const aba: Aba = abaNormalizada && (abaNormalizada === "timeline" || ETAPAS.some((e) => e.etapa === abaNormalizada))
    ? abaNormalizada
    : compra?.etapa ?? "solicitacao";

  // Documento mostrado na aba: o da URL (se for desta etapa), senão o atual da etapa.
  const docId = useMemo(() => {
    if (!compra || aba === "timeline") return null;
    const docParam = searchParams.get("doc");
    if (docParam && compra.documentos[aba].some((d) => d.id === docParam)) return docParam;
    return compra.docAtual[aba];
  }, [compra, aba, searchParams]);

  const irPara = useCallback((nova: Aba, doc?: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("aba", nova);
    if (doc) qs.set("doc", doc); else qs.delete("doc");
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertTriangle className="w-8 h-8 text-red-500" />
        <p className="text-sm text-muted-foreground">{erro}</p>
        <Link href="/compras/acompanhamento" className="text-sm font-medium text-primary hover:underline">Voltar ao Fluxo de Compras</Link>
      </div>
    );
  }
  if (!compra) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" />
      </div>
    );
  }

  const indiceAtual = ETAPAS.findIndex((e) => e.etapa === compra.etapa);
  const docsDaAba = aba === "timeline" ? [] : compra.documentos[aba];
  const Tela = aba === "timeline" ? null : TELAS[aba];

  return (
    <div>
      {/* Cabeçalho da compra: identificação · indicadores · abas */}
      <div className="px-8 pt-5 border-b border-border bg-card">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/compras/acompanhamento" className="flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Fluxo de Compras
          </Link>
          <span>/</span>
          <span className="font-mono text-foreground/80">{compra.numeroCompra}</span>
        </nav>

        <div className="flex items-start justify-between gap-4 mt-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold text-foreground font-mono tracking-tight">{compra.numeroCompra}</h1>
              {compra.concluido ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Concluída
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                  style={{ color: COR_ETAPA[compra.etapa], borderColor: `${COR_ETAPA[compra.etapa]}55`, backgroundColor: `${COR_ETAPA[compra.etapa]}14` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COR_ETAPA[compra.etapa] }} />
                  {NOME_ETAPA[compra.etapa]}
                </span>
              )}
              {compra.prioridade != null && compra.prioridade >= 4 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-danger/10 text-danger border border-danger/30">
                  {compra.prioridade >= 5 ? "Crítica" : "Urgente"}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-lg font-medium text-foreground truncate" title={compra.assunto ?? undefined}>
              {compra.assunto ?? "Compra sem itens"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {/* Nome por extenso: a sigla da empresa ("CT") se confundia com a de Cotação. */}
              <EmpresaTag empresaId={compra.empresaId} compact={false} />
              {compra.setor && <span>Setor <span className="text-foreground/80 capitalize">{compra.setor.toLowerCase()}</span></span>}
              {compra.outrasEmpresas.length > 0 && (
                <span>
                  Também existe {compra.numeroCompra} em{" "}
                  {compra.outrasEmpresas.map((e) => (
                    <Link key={e} href={`${pathname}?empresa=${e}`} className="ml-1 hover:underline"><EmpresaTag empresaId={e} compact={false} /></Link>
                  ))}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            title="Atualizar"
            className="shrink-0 flex items-center justify-center h-8 w-8 border border-border rounded-lg text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className={cn("w-4 h-4", (loading || refreshing) && "animate-spin")} />
          </button>
        </div>

        {/* Indicadores: sempre os mesmos 5, "—" quando não há */}
        {(() => {
          const prazo = compra.entregaPrevista ?? compra.dataNecessidade;
          const vencido = !!prazo && !compra.concluido && new Date(prazo) < new Date(new Date().toDateString());
          const inicio = compra.fases[0]?.inicio ?? compra.marcos[0]?.em ?? null;
          const fim = compra.concluido ? compra.fases[compra.fases.length - 1]?.fim ?? null : new Date().toISOString();
          const dias = inicio && fim ? diasEntre(inicio, fim) : null;
          const quadros: { rotulo: string; valor: React.ReactNode }[] = [
            {
              rotulo: "Solicitante",
              valor: compra.solicitante ? (
                <span className="flex items-center gap-2 min-w-0">
                  <AvatarUsuario nome={compra.solicitante} size="sm" />
                  <span className="truncate" title={compra.solicitante}>{compra.solicitante}</span>
                </span>
              ) : null,
            },
            { rotulo: "Fornecedor", valor: compra.fornecedor ? <span className="truncate block" title={compra.fornecedor}>{compra.fornecedor}</span> : null },
            { rotulo: "Valor", valor: compra.valor != null ? <span className="font-semibold tabular-nums">{formatBRL(compra.valor)}</span> : null },
            {
              rotulo: compra.entregaPrevista ? "Entrega prevista" : "Necessário em",
              valor: prazo ? (
                <span className={cn("flex items-center gap-1.5", vencido && "text-danger font-semibold")}>
                  <CalendarClock className="w-3.5 h-3.5" />{formatDate(prazo)}{vencido && <span className="text-[11px] font-medium">· vencido</span>}
                </span>
              ) : null,
            },
            {
              rotulo: compra.concluido ? "Tempo total" : "Em andamento há",
              valor: dias != null ? <span className="font-semibold tabular-nums">{fmtDias(dias)}</span> : null,
            },
          ];
          return (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 rounded-xl border border-border bg-muted/30 divide-y md:divide-y-0 md:divide-x divide-border">
              {quadros.map((q) => (
                <div key={q.rotulo} className="px-4 py-2.5 min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{q.rotulo}</p>
                  <div className="mt-0.5 text-sm text-foreground min-w-0">{q.valor ?? <span className="text-muted-foreground">—</span>}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Abas: uma por etapa, na ordem do processo */}
        <nav className="flex flex-wrap items-center gap-1 mt-3">
          {ETAPAS.map((e, i) => {
            const docs = compra.documentos[e.etapa];
            const ativa = aba === e.etapa;
            const feita = docs.length > 0 && (compra.concluido || i < indiceAtual);
            const atual = !compra.concluido && i === indiceAtual;
            const Icon = e.icon;
            return (
              <button
                key={e.etapa}
                type="button"
                onClick={() => irPara(e.etapa)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 text-sm border-b-2 -mb-px transition-colors",
                  ativa ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
                  docs.length === 0 && !ativa && "opacity-60",
                )}
              >
                {feita ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Icon className={cn("w-4 h-4", atual && "text-primary")} />}
                {e.label}
                {docs.length > 1 && <span className="text-xs text-muted-foreground">{docs.length}</span>}
                {atual && <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Etapa atual" />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => irPara("timeline")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-sm border-b-2 -mb-px transition-colors ml-auto",
              aba === "timeline" ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <GanttChart className="w-4 h-4" /> Timeline
          </button>
        </nav>
      </div>

      {/* Conteúdo das abas sobre fundo levemente cinza: os cartões brancos se destacam. */}
      <div className="bg-muted/50 dark:bg-background min-h-[calc(100vh-240px)] pb-8">
      {/* Mais de um documento na etapa (ex.: PC-0430 e PC-0430/2): seletor */}
      {docsDaAba.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 px-8 pt-4">
          {docsDaAba.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => irPara(aba, d.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                d.id === docId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {d.numero}
              <StatusBadge status={d.status} />
            </button>
          ))}
        </div>
      )}

      {aba === "timeline" ? (
        <Timeline compra={compra} />
      ) : docId && Tela ? (
        <CompraEmbutidaProvider key={docId} docId={docId}>
          <Tela />
        </CompraEmbutidaProvider>
      ) : (
        <ProximoPasso etapa={aba} compra={compra} onIr={(a) => irPara(a)} />
      )}
      </div>
    </div>
  );
}
