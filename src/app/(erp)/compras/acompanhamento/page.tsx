"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList,
  Loader2, PackageCheck, Plus, RefreshCw, Search, ShieldCheck, Truck, X,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmpresaTag from "@/components/shared/EmpresaTag";
import SelectMenu from "@/components/shared/SelectMenu";
import CreateDrawer from "@/components/shared/CreateDrawer";
import SolicitacaoCreateForm from "@/components/compras/SolicitacaoCreateForm";
import AcompanhamentoDetalheDialog, { type DocumentoRef } from "@/components/compras/AcompanhamentoDetalheDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { destinoDoArraste, type ColunaCompra } from "@/lib/compras-processo";
import { usePersistedState, useSessionState } from "@/lib/use-persisted-state";
import { cn, formatBRL, formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type Etapa = "solicitacao" | "cotacao" | "pedido" | "entrada";

type Cartao = {
  id: string;
  etapa: Etapa;
  coluna: ColunaCompra;
  numero: string;
  atual: DocumentoRef;
  empresaId: string;
  status: string;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  desde: string;
  prazo: string | null;
  prazoLabel: string | null;
  atrasado: boolean;
  concluido: boolean;
  prioridade: number | null;
  documentos: { etapa: Etapa; id: string; numero: string; status: string }[];
  busca: string;
};

type Resposta = { cartoes: Cartao[]; concluidosDias: number; geradoEm: string };

// ── Colunas: quem deve a próxima ação ──────────────────────────────────────────
const COLUNAS: { coluna: ColunaCompra; label: string; dono: string; icon: typeof ClipboardList; vazio: string; cor: string }[] = [
  { coluna: "montagem",    label: "Em montagem",          dono: "Comprador",          icon: ClipboardList, vazio: "Nenhuma compra em montagem",    cor: "bg-amber-500" },
  { coluna: "aprovacao",   label: "Aguardando aprovação", dono: "Aprovador",          icon: ShieldCheck,   vazio: "Nada aguardando aprovação",     cor: "bg-blue-500" },
  { coluna: "entrega",     label: "Aguardando entrega",   dono: "Fornecedor / financeiro", icon: Truck,    vazio: "Nenhum pedido aguardando entrega", cor: "bg-indigo-500" },
  { coluna: "conferencia", label: "Em conferência",       dono: "Almoxarifado / fiscal",   icon: PackageCheck, vazio: "Nenhuma entrada em conferência", cor: "bg-emerald-500" },
];

function medianaDias(dias: number[]): number {
  const ordem = [...dias].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : Math.round((ordem[meio - 1] + ordem[meio]) / 2);
}

const OPCOES_CONCLUIDOS = [
  { value: "0",  label: "Ocultar concluídos" },
  { value: "7",  label: "Concluídos: 7 dias" },
  { value: "15", label: "Concluídos: 15 dias" },
  { value: "30", label: "Concluídos: 30 dias" },
];

// Cor por STATUS (mesmos tons do StatusBadge): faixa lateral do cartão e os
// contadores clicáveis no cabeçalho da coluna.
const STATUS_INFO: Record<string, { label: string; cor: string }> = {
  RASCUNHO:              { label: "Rascunho",          cor: "bg-gray-400" },
  AGUARDANDO_APROVACAO:  { label: "Aguard. aprovação", cor: "bg-amber-500" },
  APROVADA:              { label: "Aprovada",          cor: "bg-green-500" },
  EM_COTACAO:            { label: "Em cotação",        cor: "bg-blue-500" },
  EM_PEDIDO:             { label: "Em pedido",         cor: "bg-indigo-500" },
  PARCIALMENTE_ATENDIDA: { label: "Parc. atendida",    cor: "bg-orange-500" },
  PENDENTE:              { label: "Pendente",          cor: "bg-amber-500" },
  EM_ANALISE:            { label: "Em análise",        cor: "bg-blue-500" },
  AGUARDANDO_PAGAMENTO:  { label: "Aguard. pagamento", cor: "bg-yellow-500" },
  EM_TRANSITO:           { label: "Em trânsito",       cor: "bg-amber-500" },
  CONFIRMADO:            { label: "Confirmado",        cor: "bg-blue-500" },
  ENVIADO:               { label: "Enviado",           cor: "bg-blue-500" },
  EM_CONFERENCIA:        { label: "Em conferência",    cor: "bg-blue-500" },
  DIVERGENCIA:           { label: "Divergência",       cor: "bg-red-500" },
  CONCLUIDA:             { label: "Concluída",         cor: "bg-green-500" },
};
const statusInfo = (s: string) => STATUS_INFO[s] ?? { label: s, cor: "bg-gray-400" };

// Parado há mais que isto na mesma etapa → contador em destaque.
const DIAS_ALERTA = 7;

function diasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Trilha SC · CT · PC · DE do processo ───────────────────────────────────────
const SIGLAS: { etapa: Etapa; sigla: string; nome: string }[] = [
  { etapa: "solicitacao", sigla: "SC", nome: "Solicitação" },
  { etapa: "cotacao",     sigla: "CT", nome: "Cotação" },
  { etapa: "pedido",      sigla: "PC", nome: "Pedido de Compras" },
  { etapa: "entrada",     sigla: "DE", nome: "Documento de Entrada" },
];

function TrilhaProcesso({ c, onAbrir }: { c: Cartao; onAbrir: (d: DocumentoRef) => void }) {
  const indiceAtual = SIGLAS.findIndex((s) => s.etapa === c.etapa);
  return (
    <div className="grid grid-cols-4 gap-1 pt-2 border-t border-border">
      {SIGLAS.map((s, i) => {
        const docs = c.documentos.filter((d) => d.etapa === s.etapa);
        const atual = i === indiceAtual && !c.concluido;
        const passou = docs.length > 0 && !atual;
        const estilo = cn(
          "h-5 px-1 rounded text-[10px] font-medium truncate text-center leading-5",
          atual && "bg-primary text-primary-foreground",
          passou && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
          !atual && !passou && "bg-muted/60 text-muted-foreground/50",
        );
        if (docs.length === 0) {
          return (
            <span key={s.etapa} className={estilo} title={`${s.nome}: sem documento`}>{s.sigla}</span>
          );
        }
        const extras = docs.length - 1;
        return (
          <button
            key={s.etapa}
            type="button"
            title={`${s.nome}: ${docs.map((d) => d.numero).join(", ")}`}
            onClick={(e) => { e.stopPropagation(); onAbrir({ etapa: docs[0].etapa, id: docs[0].id }); }}
            className={cn(estilo, "hover:opacity-80")}
          >
            {docs[0].numero}{extras > 0 ? ` +${extras}` : ""}
          </button>
        );
      })}
    </div>
  );
}

// ── Cartão ─────────────────────────────────────────────────────────────────────
function CartaoProcesso({ c, onAbrir, arrastando, onArrastar, onSoltar }: {
  c: Cartao;
  onAbrir: (d: DocumentoRef) => void;
  arrastando: boolean;
  onArrastar: (id: string) => void;
  onSoltar: () => void;
}) {
  const dias = diasDesde(c.desde);
  const arrastavel = !c.concluido && c.coluna !== "conferencia";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
        onArrastar(c.id);
      }}
      onDragEnd={onSoltar}
      onClick={() => onAbrir(c.atual)}
      onKeyDown={(e) => { if (e.key === "Enter") onAbrir(c.atual); }}
      className={cn(
        "relative overflow-hidden bg-card rounded-lg border p-3 pl-4 space-y-2 cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        c.atrasado ? "border-red-300 dark:border-red-500/40" : "border-border",
        c.concluido && "opacity-70",
        arrastavel && "active:cursor-grabbing",
        arrastando && "opacity-40",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", statusInfo(c.status).cor)} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{c.numero}</span>
          <EmpresaTag empresaId={c.empresaId} />
          {c.prioridade != null && c.prioridade >= 4 && (
            <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
              {c.prioridade >= 5 ? "Crítica" : "Alta"}
            </span>
          )}
        </div>
        {c.concluido ? (
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        ) : (
          <span
            title={`Nesta etapa desde ${formatDate(c.desde)}`}
            className={cn(
              "text-[11px] font-medium whitespace-nowrap shrink-0",
              dias >= DIAS_ALERTA ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {dias === 0 ? "hoje" : `${dias} d`}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm text-foreground truncate" title={c.titulo}>{c.titulo}</p>
        {c.resumo && <p className="text-xs text-muted-foreground truncate" title={c.resumo}>{c.resumo}</p>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={c.status} />
        {c.valor != null && c.valor > 0 && (
          <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatBRL(c.valor)}</span>
        )}
      </div>

      {c.prazo && (
        <div className="flex items-center justify-end">
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] whitespace-nowrap",
              c.atrasado ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground",
            )}
            title={c.prazoLabel ?? undefined}
          >
            {c.atrasado ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
            {c.prazoLabel ? `${c.prazoLabel}: ` : ""}{formatDate(c.prazo)}
          </span>
        </div>
      )}

      <TrilhaProcesso c={c} onAbrir={onAbrir} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AcompanhamentoComprasPage() {
  const [busca, setBusca] = useSessionState<string>("compras:acompanhamento:busca", "");
  const [soAtrasados, setSoAtrasados] = usePersistedState<boolean>("compras:acompanhamento:so-atrasados", false);
  const [concluidosDias, setConcluidosDias] = usePersistedState<string>("compras:acompanhamento:concluidos-dias", "7");

  // Filtro de status por coluna (clique nos contadores do cabeçalho).
  const [filtroStatus, setFiltroStatus] = usePersistedState<Partial<Record<ColunaCompra, string>>>("compras:acompanhamento:status-coluna", {});
  const [aberto, setAberto] = useState<DocumentoRef | null>(null);

  // Arrastar leva ao formulário do próximo documento (nada é criado aqui).
  const router = useRouter();
  const [arrastadoId, setArrastadoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<ColunaCompra | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; href?: string; acao?: string } | null>(null);

  const [data, setData] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErro(null);
    fetch(`/api/compras/acompanhamento?concluidosDias=${concluidosDias}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Erro ao carregar o acompanhamento");
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [concluidosDias]);

  useEffect(() => { load(); }, [load]);

  const termo = normalizar(busca.trim());
  const porColuna = useMemo(() => {
    const mapa: Record<ColunaCompra, Cartao[]> = { montagem: [], aprovacao: [], entrega: [], conferencia: [] };
    for (const c of data?.cartoes ?? []) {
      if (soAtrasados && !c.atrasado) continue;
      if (termo) {
        const alvo = normalizar(
          [c.numero, c.titulo, c.resumo, c.busca, ...c.documentos.map((d) => d.numero)].filter(Boolean).join(" "),
        );
        if (!alvo.includes(termo)) continue;
      }
      mapa[c.coluna].push(c);
    }
    // Atrasados no topo, depois os mais antigos na etapa; concluídos por último.
    for (const coluna of Object.keys(mapa) as ColunaCompra[]) {
      mapa[coluna].sort((a, b) =>
        Number(a.concluido) - Number(b.concluido) ||
        Number(b.atrasado) - Number(a.atrasado) ||
        a.desde.localeCompare(b.desde),
      );
    }
    return mapa;
  }, [data, soAtrasados, termo]);

  const totalAtrasados = (data?.cartoes ?? []).filter((c) => c.atrasado).length;

  function encerrarArraste() {
    setArrastadoId(null);
    setColunaAlvo(null);
  }

  function soltarNaColuna(coluna: ColunaCompra) {
    const cartao = data?.cartoes.find((c) => c.id === arrastadoId);
    encerrarArraste();
    if (!cartao) return;
    const resultado = destinoDoArraste(cartao, coluna);
    if (!resultado) return;
    if ("erro" in resultado) setAviso({ texto: resultado.erro });
    else if (resultado.aviso) setAviso({ texto: resultado.aviso, href: resultado.href, acao: resultado.acao });
    else router.push(resultado.href);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <PageHeader
          title="Kanban de Compras"
          subtitle="Cada compra é um cartão, na coluna de quem deve a próxima ação"
          breadcrumbs={[{ label: "Compras" }, { label: "Kanban" }]}
        />
        <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1">
          <Button onClick={() => setNovaAberta(true)} className="h-9">
            <Plus className="w-4 h-4 mr-1" />Nova compra
          </Button>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar número, fornecedor, item..."
              className="pl-9 pr-8 h-9 text-sm"
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSoAtrasados((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors",
              soAtrasados
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
            title="Mostrar só os documentos com prazo vencido"
          >
            <AlertTriangle className="w-4 h-4" />
            Atrasados{totalAtrasados > 0 ? ` (${totalAtrasados})` : ""}
          </button>
          <SelectMenu
            value={concluidosDias}
            options={OPCOES_CONCLUIDOS}
            onChange={setConcluidosDias}
            triggerClassName="h-9 text-sm"
            title="Compras concluídas exibidas no quadro"
          />
          <button
            onClick={load}
            className="flex items-center justify-center h-9 w-9 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {aviso && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground">
          <span>{aviso.texto}</span>
          <div className="flex items-center gap-3 shrink-0">
            {aviso.href && (
              <Link href={aviso.href} className="font-medium text-primary hover:underline">{aviso.acao}</Link>
            )}
            <button type="button" onClick={() => setAviso(null)} title="Fechar" className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {erro ? (
        <div className="bg-card rounded-xl border border-border flex flex-col items-center justify-center py-16 gap-3">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-sm text-muted-foreground">{erro}</p>
        </div>
      ) : loading && !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-4 gap-4 min-w-[1040px]">
            {COLUNAS.map((col) => {
              const todos = porColuna[col.coluna];
              // Contagem por status (antes do filtro de status da coluna).
              const porStatus = new Map<string, number>();
              for (const c of todos) porStatus.set(c.status, (porStatus.get(c.status) ?? 0) + 1);
              const statusAtivo = filtroStatus[col.coluna] && porStatus.has(filtroStatus[col.coluna]!)
                ? filtroStatus[col.coluna]!
                : null;
              const cartoes = statusAtivo ? todos.filter((c) => c.status === statusAtivo) : todos;
              const abertos = cartoes.filter((c) => !c.concluido);
              const atrasados = abertos.filter((c) => c.atrasado).length;
              const valor = abertos.reduce((s, c) => s + (c.valor ?? 0), 0);
              const idades = abertos.map((c) => diasDesde(c.desde));
              const acima30 = idades.filter((d) => d > 30).length;
              const Icon = col.icon;
              return (
                <div
                  key={col.coluna}
                  onDragOver={(e) => {
                    if (!arrastadoId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setColunaAlvo(col.coluna);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setColunaAlvo(null);
                  }}
                  onDrop={(e) => { e.preventDefault(); soltarNaColuna(col.coluna); }}
                  className={cn(
                    "flex flex-col bg-muted/50 rounded-xl border min-w-0 transition-colors",
                    colunaAlvo === col.coluna ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                >
                  <div className="px-3 py-3 border-b border-border space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", col.cor)} />
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold text-foreground truncate">{col.label}</span>
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-card border border-border text-xs font-semibold text-foreground">
                        {abertos.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Próxima ação: {col.dono}</p>
                    {abertos.length > 0 && (
                      <p className="text-[11px] text-muted-foreground" title="Tempo na coluna atual">
                        Mediana {medianaDias(idades)} d
                        {acima30 > 0 && <> · <span className="text-amber-600 dark:text-amber-400 font-semibold">{acima30} há mais de 30 d</span></>}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground h-4">
                      <span>{valor > 0 ? formatBRL(valor) : ""}</span>
                      {atrasados > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {atrasados} atrasado{atrasados > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {porStatus.size > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {Array.from(porStatus.entries()).map(([status, qtd]) => {
                          const info = statusInfo(status);
                          const ativo = statusAtivo === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setFiltroStatus((f) => ({ ...f, [col.coluna]: ativo ? undefined : status }))}
                              title={ativo ? "Remover filtro de status" : `Mostrar só ${info.label}`}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors",
                                ativo
                                  ? "border-foreground/40 bg-card text-foreground"
                                  : "border-border text-muted-foreground hover:bg-card hover:text-foreground",
                                statusAtivo && !ativo && "opacity-50",
                              )}
                            >
                              <span className={cn("w-2 h-2 rounded-full shrink-0", info.cor)} />
                              {info.label}
                              <span className="font-semibold text-foreground">{qtd}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-330px)] min-h-[160px]">
                    {cartoes.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 text-center py-8 px-3">
                        {termo || soAtrasados || statusAtivo ? "Nada encontrado com os filtros atuais" : col.vazio}
                      </p>
                    ) : (
                      cartoes.map((c) => <CartaoProcesso key={c.id} c={c} onAbrir={setAberto} arrastando={arrastadoId === c.id} onArrastar={setArrastadoId} onSoltar={encerrarArraste} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AcompanhamentoDetalheDialog documento={aberto} onNavegar={setAberto} onClose={() => setAberto(null)} />

      <CreateDrawer open={novaAberta} onOpenChange={setNovaAberta} title="Nova compra" width="2xl" onCreated={load}>
        <SolicitacaoCreateForm modoCompra />
      </CreateDrawer>
    </div>
  );
}
