"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Compra única (PC-0430): cabeçalho do processo + uma aba por etapa.
// Cada aba mostra a tela de detalhe que já existia (Solicitação, Cotação,
// Pedido, Entrada) dentro de CompraEmbutidaProvider — mesmas ações, sem título
// próprio. Etapa sem documento mostra o próximo passo. A aba fica na URL
// (?aba=…&doc=…) para o link levar direto a ela.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, FileText, GanttChart, Loader2,
  ExternalLink, PackageCheck, RefreshCw, ShoppingCart, Wallet, XCircle,
} from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmpresaTag from "@/components/shared/EmpresaTag";
import { AvatarUsuario } from "@/components/projetos/comum";
import { CompraEmbutidaProvider } from "@/lib/compra-embutida";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import type { EtapaCompra } from "@/lib/compras-processo";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import SolicitacaoTela from "@/app/(erp)/compras/necessidades/[id]/page";
import CotacaoTela from "@/app/(erp)/suprimentos/cotacoes/[id]/page";
import PedidoTela from "@/app/(erp)/suprimentos/pedidos-compra/[id]/page";
import EntradaTela from "@/app/(erp)/suprimentos/conferencias/[id]/page";
import EditarPedidoTela from "@/app/(erp)/suprimentos/pedidos-compra/[id]/editar/page";
import AnaliseCotacaoTela from "@/app/(erp)/suprimentos/cotacoes/[id]/analise/page";
import CancelarCompraDialog from "@/components/compras/CancelarCompraDialog";
import { EtapaSecao, tabela } from "@/components/compras/etapa/EtapaUI";

type Doc = { id: string; numero: string; status: string; numeroNF?: string | null };

type Compra = {
  numeroCompra: string;
  empresaId: string;
  outrasEmpresas: string[];
  etapa: EtapaCompra;
  concluido: boolean;
  cancelada: boolean;
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
  pagamentos: {
    id: string; numero: string; descricao: string; status: string; antecipado: boolean; parcela: string | null;
    vencimento: string | null; pagoEm: string | null; valor: number; pago: number; forma: string | null;
  }[];
  historico: { id: string; etapa: EtapaCompra | null; numero: string; statusDe: string | null; statusPara: string; usuario: string | null; em: string }[];
  marcos: {
    em: string; etapa: EtapaCompra; label: string; numero?: string; quem?: string | null; soData?: boolean;
    cancelado?: boolean; foraDeOrdem?: boolean;
  }[];
  fases: { etapa: EtapaCompra; inicio: string; fim: string | null; emAndamento: boolean }[];
};

type Aba = EtapaCompra | "pagamentos" | "timeline";
const ABAS_EXTRAS: Aba[] = ["pagamentos", "timeline"];

const ETAPAS: { etapa: EtapaCompra; label: string; sigla: string; icon: typeof ClipboardList }[] = [
  { etapa: "solicitacao", label: "Solicitação", sigla: "SC", icon: ClipboardList },
  { etapa: "cotacao",     label: "Cotação",     sigla: "CT", icon: FileText },
  { etapa: "pedido",      label: "Pedido",      sigla: "PC", icon: ShoppingCart },
  { etapa: "entrada",     label: "Entrada",     sigla: "DE", icon: PackageCheck },
];
const NOME_ETAPA: Record<EtapaCompra, string> = {
  solicitacao: "Solicitação", cotacao: "Cotação", pedido: "Pedido", entrada: "Documento de Entrada",
};

/** Rótulo de um documento no seletor da aba. Números internos (SC-/CT-/DE-)
 *  não aparecem: o pedido já leva o da compra (PC-0430, PC-0430/2); a entrada
 *  vai pela NF; os demais, pela ordem. */
function rotuloDoc(etapa: EtapaCompra, d: Doc, i: number): string {
  if (etapa === "pedido") return d.numero;
  if (etapa === "entrada" && d.numeroNF) return `NF ${d.numeroNF}`;
  return `${NOME_ETAPA[etapa]} ${i + 1}`;
}

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

// Status gravado → nome mostrado (AGUARDANDO_PAGAMENTO do pedido é "emitido").
const NOME_STATUS: Record<string, string> = { AGUARDANDO_PAGAMENTO: "emitido" };
const nomeStatus = (st: string) => NOME_STATUS[st] ?? st.replace(/_/g, " ").toLowerCase();

// ── Timeline: quanto tempo a compra levou, etapa por etapa ───────────────────
const COR_ETAPA: Record<EtapaCompra, string> = {
  solicitacao: "#9ca3af", cotacao: "#f97316", pedido: "#3b82f6", entrada: "#8b5cf6",
};
const DIA = 86_400_000;
const diasEntre = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DIA);
const fmtDias = (d: number) => (d < 1 ? (d * 24 < 1 ? "< 1 h" : `${Math.round(d * 24)} h`) : `${Math.round(d)} d`);
const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
// Datas gravadas sem hora (NF, conferência antiga) ficam em 00:00 UTC: mostrar só o dia, em UTC.
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

// ── Pagamentos: títulos a pagar da compra (pedido antecipado e entrada) ─────
const SITUACAO_TITULO: Record<string, { label: string; cls: string }> = {
  ABERTA:    { label: "A pagar",   cls: "bg-info/15 text-info" },
  VENCIDA:   { label: "Vencido",   cls: "bg-danger/15 text-danger" },
  PARCIAL:   { label: "Parcial",   cls: "bg-warning/15 text-warning" },
  PAGA:      { label: "Pago",      cls: "bg-success/15 text-success" },
  CANCELADA: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

function Pagamentos({ compra }: { compra: Compra }) {
  const hoje = new Date(new Date().toDateString());
  const ativos = compra.pagamentos.filter((t) => t.status !== "CANCELADA");
  const vencido = (t: Compra["pagamentos"][number]) =>
    t.status !== "PAGA" && t.status !== "CANCELADA" && !!t.vencimento && new Date(t.vencimento) < hoje;
  const total = ativos.reduce((s, t) => s + t.valor, 0);
  const pago = ativos.reduce((s, t) => s + t.pago, 0);
  const emAtraso = ativos.filter(vencido).reduce((s, t) => s + (t.valor - t.pago), 0);
  const proximo = ativos
    .filter((t) => t.status !== "PAGA" && t.vencimento && !vencido(t))
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))[0];

  if (compra.pagamentos.length === 0) {
    return (
      <div className="mx-8 my-10 rounded-xl border border-dashed border-border bg-card py-14 text-center text-sm text-muted-foreground">
        Nenhum título a pagar nesta compra ainda. Os títulos nascem no pedido (pagamento antecipado) ou na entrada da nota.
      </div>
    );
  }

  const quadros = [
    { rotulo: "Total", valor: formatBRL(total), cls: "text-foreground" },
    { rotulo: "Pago", valor: formatBRL(pago), cls: "text-success" },
    { rotulo: "A pagar", valor: formatBRL(Math.max(0, total - pago)), cls: "text-foreground" },
    { rotulo: "Em atraso", valor: formatBRL(emAtraso), cls: emAtraso > 0 ? "text-danger" : "text-muted-foreground" },
    { rotulo: "Próximo vencimento", valor: proximo?.vencimento ? formatDate(proximo.vencimento) : "—", cls: "text-foreground" },
  ];

  return (
    <div className="mx-8 my-6 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 rounded-xl border border-border bg-card shadow-sm divide-y md:divide-y-0 md:divide-x divide-border">
        {quadros.map((q) => (
          <div key={q.rotulo} className="px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{q.rotulo}</p>
            <p className={cn("mt-0.5 text-base font-semibold tabular-nums", q.cls)}>{q.valor}</p>
          </div>
        ))}
      </div>

      <EtapaSecao titulo="Títulos a pagar" semPadding>
        <table className={tabela.table}>
          <thead className={tabela.thead}>
            <tr>
              <th className={tabela.th}>Título</th>
              <th className={tabela.th}>Parcela</th>
              <th className={tabela.th}>Vencimento</th>
              <th className={tabela.thNum}>Valor</th>
              <th className={tabela.thNum}>Pago</th>
              <th className={tabela.th}>Situação</th>
              <th className={tabela.th}>Pago em</th>
              <th className={tabela.th}>Forma</th>
            </tr>
          </thead>
          <tbody>
            {compra.pagamentos.map((t) => {
              const atrasado = vencido(t);
              const sit = atrasado ? SITUACAO_TITULO.VENCIDA : SITUACAO_TITULO[t.status] ?? { label: t.status, cls: "bg-muted text-muted-foreground" };
              return (
                <tr
                  key={t.id}
                  onClick={() => window.open(`/contas-pagar?abrir=${t.id}`, "_self")}
                  className={cn(tabela.tr, "cursor-pointer hover:bg-muted/40", t.status === "CANCELADA" && "opacity-50")}
                  title={t.descricao}
                >
                  <td className={tabela.td}>
                    <span className="font-mono text-xs font-semibold">{t.numero}</span>
                    {t.antecipado && <span className="ml-1.5 rounded px-1.5 py-px text-[10px] font-semibold bg-info/15 text-info">antecipado</span>}
                  </td>
                  <td className={tabela.td}>{t.parcela ?? "—"}</td>
                  <td className={cn(tabela.td, atrasado && "text-danger font-semibold")}>{t.vencimento ? formatDate(t.vencimento) : "—"}</td>
                  <td className={tabela.tdNum}>{formatBRL(t.valor)}</td>
                  <td className={tabela.tdNum}>{t.pago > 0 ? formatBRL(t.pago) : "—"}</td>
                  <td className={tabela.td}><span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", sit.cls)}>{sit.label}</span></td>
                  <td className={tabela.td}>{t.pagoEm ? formatDate(t.pagoEm) : "—"}</td>
                  <td className={cn(tabela.td, "text-muted-foreground")}>{t.forma ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </EtapaSecao>
    </div>
  );
}

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
      em: m.em, etapa: m.etapa, titulo: m.label, principal: true, soData: !!m.soData,
      detalhe: [m.numero, m.quem ? `por ${m.quem}` : null].filter(Boolean).join(" · ") || null,
      cancelado: !!m.cancelado, foraDeOrdem: !!m.foraDeOrdem,
    })),
    ...historico.map((h) => ({
      em: h.em, etapa: h.etapa, titulo: `Status: ${h.statusDe ? `${nomeStatus(h.statusDe)} → ` : ""}${nomeStatus(h.statusPara)}`,
      detalhe: [h.numero, h.usuario].filter(Boolean).join(" · ") || null, principal: false,
      cancelado: false, foraDeOrdem: false, soData: false,
    })),
  ].sort((a, b) => b.em.localeCompare(a.em)); // mais recente no topo

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
          // Intervalo desde o evento anterior no tempo (o de baixo na lista).
          const anterior = i < eventos.length - 1 ? eventos[i + 1].em : null;
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
                  {e.soData ? fmtDia(e.em) : fmtData(e.em)}
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

export type NavegacaoCompra = { aba?: string | null; doc?: string | null };

/**
 * Compra inteira (cabeçalho + abas). Usada pela página /compras/compra/[numero]
 * (aba na URL) e pelo popup do Fluxo de Compras (aba em estado local).
 */
export default function CompraDetalhe({
  numeroCompra, empresa, abaParam, docParam, onNavegar, onAbrirEmAba,
}: {
  numeroCompra: string;
  empresa: string | null;
  abaParam: string | null;
  docParam: string | null;
  onNavegar: (n: NavegacaoCompra) => void;
  /** Presente no popup: mostra "Abrir em aba" e esconde o link de volta. */
  onAbrirEmAba?: () => void;
}) {
  // Cabeçalho e abas aparecem na hora ao voltar para a compra; atualiza em 2º plano.
  const { data: compra, loading, refreshing, erro, recarregar: load } = useRelatorioCache<Compra>(
    `/api/compras/compra/${encodeURIComponent(numeroCompra)}${empresa ? `?empresa=${empresa}` : ""}`,
  );

  const [cancelarAberto, setCancelarAberto] = useState(false);

  // "historico" é o nome antigo da aba Timeline (links já compartilhados).
  const abaNormalizada = (abaParam === "historico" ? "timeline" : abaParam) as Aba | null;
  const aba: Aba = abaNormalizada && (ABAS_EXTRAS.includes(abaNormalizada) || ETAPAS.some((e) => e.etapa === abaNormalizada))
    ? abaNormalizada
    : compra?.etapa ?? "solicitacao";

  // Documento mostrado na aba: o da URL (se for desta etapa), senão o atual da etapa.
  const docId = useMemo(() => {
    if (!compra || ABAS_EXTRAS.includes(aba)) return null;
    const etapa = aba as EtapaCompra;
    if (docParam && compra.documentos[etapa].some((d) => d.id === docParam)) return docParam;
    return compra.docAtual[etapa];
  }, [compra, aba, docParam]);


  // Telas auxiliares (editar pedido, analisar cotação) abrem aqui mesmo, sem
  // sair da compra; ao salvar/voltar, retornam à aba do documento.
  const [subTela, setSubTela] = useState<{ tipo: "editar-pedido" | "analise-cotacao"; id: string } | null>(null);
  // Trocar de aba fecha a tela auxiliar aberta.
  const irPara = useCallback((nova: Aba, doc?: string) => {
    setSubTela(null);
    onNavegar({ aba: nova, doc: doc ?? null });
  }, [onNavegar]);
  const abrir = useCallback((href: string): boolean => {
    let m = href.match(/^\/suprimentos\/pedidos-compra\/([^/?#]+)\/editar$/);
    if (m) { setSubTela({ tipo: "editar-pedido", id: m[1] }); return true; }
    m = href.match(/^\/suprimentos\/cotacoes\/([^/?#]+)\/analise$/);
    if (m) { setSubTela({ tipo: "analise-cotacao", id: m[1] }); return true; }
    // Documento desta mesma compra: troca de aba em vez de navegar.
    m = href.match(/^\/suprimentos\/(pedidos-compra|cotacoes)\/([^/?#]+)$/);
    if (m && compra) {
      const etapa: EtapaCompra = m[1] === "cotacoes" ? "cotacao" : "pedido";
      // Documento desta compra — inclusive o pedido que acabou de nascer da
      // aprovação (ainda não está na lista carregada): troca de aba e recarrega.
      const conhecido = compra.documentos[etapa].some((d) => d.id === m![2]);
      const recemCriado = etapa === "pedido" && compra.documentos.pedido.length === 0
        || etapa === "pedido" && !conhecido && compra.etapa === "cotacao";
      if (conhecido || recemCriado) {
        setSubTela(null);
        irPara(etapa, m[2]);
        load();
        return true;
      }
    }
    return false;
  }, [compra, irPara, load]);

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
  const etapaDaAba = ABAS_EXTRAS.includes(aba) ? null : (aba as EtapaCompra);
  const docsDaAba = etapaDaAba ? compra.documentos[etapaDaAba] : [];
  const Tela = etapaDaAba ? TELAS[etapaDaAba] : null;

  return (
    <div>
      {/* Cabeçalho da compra */}
      <div className={cn("px-8 pt-6 pb-4 border-b border-border space-y-3", onAbrirEmAba && "pr-16")}>
        {!onAbrirEmAba && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/compras/acompanhamento" className="flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Fluxo de Compras
            </Link>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground font-mono">{compra.numeroCompra}</h1>
              {/* Nome por extenso: a sigla da empresa ("CT") se confundia com a de Cotação. */}
              <EmpresaTag empresaId={compra.empresaId} compact={false} />
              {compra.cancelada ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                  <XCircle className="w-3.5 h-3.5" /> Cancelada
                </span>
              ) : compra.concluido ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Concluída
                </span>
              ) : (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {NOME_ETAPA[compra.etapa]}
                </span>
              )}
              {compra.prioridade != null && compra.prioridade >= 4 && (
                <span className="rounded px-2 py-0.5 text-xs font-semibold bg-danger/15 text-danger">
                  {compra.prioridade >= 5 ? "Crítica" : "Urgente"}
                </span>
              )}
              {compra.setor && (
                <span className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground capitalize">{compra.setor.toLowerCase()}</span>
              )}
            </div>
            {compra.assunto && <p className="text-base text-foreground">{compra.assunto}</p>}
            {compra.outrasEmpresas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Também existe {compra.numeroCompra} em:{" "}
                {compra.outrasEmpresas.map((e) => (
                  <Link key={e} href={`/compras/compra/${encodeURIComponent(numeroCompra)}?empresa=${e}`} className="mr-2 hover:underline"><EmpresaTag empresaId={e} compact={false} /></Link>
                ))}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {compra.fornecedor && (
              <div><p className="text-[11px] text-muted-foreground">Fornecedor</p><p className="font-medium text-foreground">{compra.fornecedor}</p></div>
            )}
            {compra.valor != null && (
              <div><p className="text-[11px] text-muted-foreground">Valor</p><p className="font-semibold text-foreground">{formatBRL(compra.valor)}</p></div>
            )}
            {(compra.entregaPrevista || compra.dataNecessidade) && (
              <div>
                <p className="text-[11px] text-muted-foreground">{compra.entregaPrevista ? "Entrega prevista" : "Necessário em"}</p>
                <p className="flex items-center gap-1 text-foreground">
                  <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
                  {formatDate(compra.entregaPrevista ?? compra.dataNecessidade!)}
                </p>
              </div>
            )}
            {compra.solicitante && (
              <div className="flex items-center gap-2">
                <AvatarUsuario nome={compra.solicitante} />
                <div><p className="text-[11px] text-muted-foreground">Solicitante</p><p className="text-foreground">{compra.solicitante}</p></div>
              </div>
            )}
            {!compra.concluido && !compra.cancelada && (
              <button
                type="button"
                onClick={() => setCancelarAberto(true)}
                className="flex items-center gap-1.5 h-8 px-3 border border-border rounded-lg text-sm text-danger hover:bg-danger/10"
              >
                <XCircle className="w-4 h-4" /> Cancelar compra
              </button>
            )}
            {onAbrirEmAba && (
              <button
                type="button"
                onClick={onAbrirEmAba}
                className="flex items-center gap-1.5 h-8 px-3 border border-border rounded-lg text-sm text-foreground hover:bg-muted"
              >
                <ExternalLink className="w-4 h-4" /> Abrir em aba
              </button>
            )}
            <button
              type="button"
              onClick={load}
              title="Atualizar"
              className="flex items-center justify-center h-8 w-8 border border-border rounded-lg text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className={cn("w-4 h-4", (loading || refreshing) && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Abas: uma por etapa, na ordem do processo */}
        <nav className="flex flex-wrap items-center gap-1 -mb-4 pt-1">
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
            onClick={() => irPara("pagamentos")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-sm border-b-2 -mb-px transition-colors ml-auto",
              aba === "pagamentos" ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Wallet className="w-4 h-4" /> Pagamentos
            {compra.pagamentos.length > 0 && <span className="text-xs text-muted-foreground">{compra.pagamentos.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => irPara("timeline")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-sm border-b-2 -mb-px transition-colors",
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
          {docsDaAba.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => irPara(aba, d.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                d.id === docId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {etapaDaAba && rotuloDoc(etapaDaAba, d, i)}
              <StatusBadge status={d.status} />
            </button>
          ))}
        </div>
      )}

      {subTela ? (
        <>
          <div className="px-8 pt-4">
            <button
              type="button"
              onClick={() => setSubTela(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              {subTela.tipo === "editar-pedido" ? "Voltar ao pedido" : "Voltar à cotação"}
            </button>
          </div>
          <CompraEmbutidaProvider key={`${subTela.tipo}:${subTela.id}`} docId={subTela.id} abrir={abrir}>
            {subTela.tipo === "editar-pedido" ? <EditarPedidoTela /> : <AnaliseCotacaoTela />}
          </CompraEmbutidaProvider>
        </>
      ) : aba === "pagamentos" ? (
        <Pagamentos compra={compra} />
      ) : aba === "timeline" ? (
        <Timeline compra={compra} />
      ) : docId && Tela ? (
        <CompraEmbutidaProvider key={docId} docId={docId} abrir={abrir}>
          <Tela />
        </CompraEmbutidaProvider>
      ) : (
        <ProximoPasso etapa={aba as EtapaCompra} compra={compra} onIr={(a) => irPara(a)} />
      )}
      </div>
      <CancelarCompraDialog
        open={cancelarAberto}
        onOpenChange={setCancelarAberto}
        numeroCompra={compra.numeroCompra}
        empresaId={compra.empresaId}
        onConcluido={load}
      />
    </div>
  );
}
