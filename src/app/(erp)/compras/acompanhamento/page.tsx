"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Clock, Loader2, MoreHorizontal, Plus, RefreshCw, Search, X } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmpresaTag from "@/components/shared/EmpresaTag";
import SelectMenu from "@/components/shared/SelectMenu";
import CreateDrawer from "@/components/shared/CreateDrawer";
import SolicitacaoCreateForm from "@/components/compras/SolicitacaoCreateForm";
import AcompanhamentoDetalheDialog, { type DocumentoRef } from "@/components/compras/AcompanhamentoDetalheDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarUsuario } from "@/components/projetos/comum";
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
  assunto: string;
  solicitante: string | null;
  setor: string | null;
  documentos: { etapa: Etapa; id: string; numero: string; status: string }[];
  busca: string;
};

type Resposta = { cartoes: Cartao[]; concluidosDias: number; geradoEm: string };

// ── Colunas: uma por etapa; a contagem é quantos processos estão nela ─────────
// Visual do kanban de Projetos: lista de 272px, nome em pílula na cor da etapa.
const COLUNAS: { coluna: ColunaCompra; label: string; dono: string; vazio: string; cor: string }[] = [
  { coluna: "montagem",    label: "Solicitação de Compras", dono: "Comprador",               vazio: "Nenhuma solicitação em aberto",       cor: "#9ca3af" },
  { coluna: "aprovacao",   label: "Aguardando Aprovação",   dono: "Aprovador",               vazio: "Nada aguardando aprovação",           cor: "#f97316" },
  { coluna: "entrega",     label: "Pedido de Compras",      dono: "Fornecedor / financeiro", vazio: "Nenhum pedido em aberto",             cor: "#3b82f6" },
  { coluna: "conferencia", label: "Documento de Entrada",   dono: "Almoxarifado / fiscal",   vazio: "Nenhuma entrada em conferência",      cor: "#8b5cf6" },
  { coluna: "concluido",   label: "Concluído",              dono: "",                        vazio: "Nenhuma compra concluída no período", cor: "#22c55e" },
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
  { value: "90", label: "Concluídos: 90 dias" },
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
    <div className="flex items-center gap-1 mt-2">
      {SIGLAS.map((s, i) => {
        const docs = c.documentos.filter((d) => d.etapa === s.etapa);
        const atual = i === indiceAtual && !c.concluido;
        const passou = docs.length > 0 && !atual;
        const estilo = cn(
          "h-4 px-1.5 rounded text-[10px] font-medium leading-4 whitespace-nowrap",
          atual && "bg-primary text-primary-foreground",
          passou && "bg-success/15 text-success",
          !atual && !passou && "bg-muted text-muted-foreground/50",
        );
        if (docs.length === 0) {
          return <span key={s.etapa} className={estilo} title={`${s.nome}: sem documento`}>{s.sigla}</span>;
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
            {s.sigla}{extras > 0 ? ` +${extras}` : ""}
          </button>
        );
      })}
    </div>
  );
}

// ── Cartão (mesmo desenho do cartão de Projetos) ──────────────────────────────
function CartaoProcesso({ c, onAbrir, arrastando, onArrastar, onSoltar }: {
  c: Cartao;
  onAbrir: (d: DocumentoRef) => void;
  arrastando: boolean;
  onArrastar: (id: string) => void;
  onSoltar: () => void;
}) {
  const dias = diasDesde(c.desde);
  const arrastavel = !c.concluido;
  // Na SC o "título" da API é o solicitante; nas demais etapas é o fornecedor/cotação.
  const contraparte = c.etapa === "solicitacao" || c.titulo === c.assunto ? null : c.titulo;

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
        "relative bg-card rounded-lg border px-3 py-2 shadow-sm cursor-pointer transition-colors hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        c.atrasado ? "border-danger/50" : "border-border",
        c.concluido && "opacity-70",
        arrastando && "opacity-40",
      )}
    >
      {(c.setor || (c.prioridade != null && c.prioridade >= 4)) && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {c.prioridade != null && c.prioridade >= 4 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium text-white bg-red-500">
              {c.prioridade >= 5 ? "Crítica" : "Urgente"}
            </span>
          )}
          {c.setor && (
            <span className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium text-white bg-blue-600" title="Setor">
              {c.setor}
            </span>
          )}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {c.concluido && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />}
        <p
          className={cn("text-sm text-foreground leading-snug flex-1 line-clamp-2", c.concluido && "line-through text-muted-foreground")}
          title={c.assunto}
        >
          {c.assunto}
        </p>
      </div>

      <div className="flex items-center gap-1.5 mt-1 min-w-0 text-[11px] text-muted-foreground">
        <span className="font-medium whitespace-nowrap">{c.numero}</span>
        <EmpresaTag empresaId={c.empresaId} />
        {contraparte && <span className="truncate" title={contraparte}>· {contraparte}</span>}
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {!c.concluido && <StatusBadge status={c.status} />}
        {c.prazo && (
          <span
            title={c.prazoLabel ?? undefined}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md whitespace-nowrap",
              c.concluido ? "bg-success/15 text-success" : c.atrasado ? "bg-danger/15 text-danger font-semibold" : "text-muted-foreground",
            )}
          >
            <Clock className="w-3 h-3" /> {formatDate(c.prazo)}
          </span>
        )}
        {!c.concluido && (
          <span
            title={`Nesta etapa desde ${formatDate(c.desde)}`}
            className={cn("text-[11px] whitespace-nowrap", dias >= DIAS_ALERTA ? "text-warning font-semibold" : "text-muted-foreground")}
          >
            {dias === 0 ? "hoje" : `${dias} d`}
          </span>
        )}
        {c.valor != null && c.valor > 0 && (
          <span className="text-[11px] font-semibold text-foreground whitespace-nowrap">{formatBRL(c.valor)}</span>
        )}
        {c.solicitante && (
          <span className="ml-auto">
            <AvatarUsuario nome={c.solicitante} size="sm" title={`Solicitante: ${c.solicitante}`} />
          </span>
        )}
      </div>

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
  const [menuColuna, setMenuColuna] = useState<ColunaCompra | null>(null);

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
    const mapa: Record<ColunaCompra, Cartao[]> = { montagem: [], aprovacao: [], entrega: [], conferencia: [], concluido: [] };
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
    // Atrasados no topo, depois os mais antigos na etapa; concluídos do mais recente.
    for (const coluna of Object.keys(mapa) as ColunaCompra[]) {
      mapa[coluna].sort((a, b) =>
        Number(b.atrasado) - Number(a.atrasado) ||
        a.desde.localeCompare(b.desde),
      );
    }
    mapa.concluido.sort((a, b) => (b.prazo ?? "").localeCompare(a.prazo ?? ""));
    return mapa;
  }, [data, soAtrasados, termo]);

  const colunas = concluidosDias === "0" ? COLUNAS.filter((c) => c.coluna !== "concluido") : COLUNAS;
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
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">Kanban de Compras</h1>
        <div className="flex flex-wrap items-center gap-2">
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
        // Dimensões do kanban de Projetos: lista de 272px e 12px entre listas.
        <div className="flex items-start gap-3 overflow-x-auto pb-1 h-[calc(100vh-126px)] min-h-[420px]">
          {colunas.map((col) => {
            const todos = porColuna[col.coluna];
            // Contagem por status (antes do filtro de status da coluna).
            const porStatus = new Map<string, number>();
            for (const c of todos) porStatus.set(c.status, (porStatus.get(c.status) ?? 0) + 1);
            const statusAtivo = filtroStatus[col.coluna] && porStatus.has(filtroStatus[col.coluna]!)
              ? filtroStatus[col.coluna]!
              : null;
            const cartoes = statusAtivo ? todos.filter((c) => c.status === statusAtivo) : todos;
            const ehConcluido = col.coluna === "concluido";
            const atrasados = cartoes.filter((c) => c.atrasado).length;
            const valor = cartoes.reduce((s, c) => s + (c.valor ?? 0), 0);
            const idades = cartoes.map((c) => diasDesde(c.desde));
            const acima30 = idades.filter((d) => d > 30).length;
            const tons = { bg: `${col.cor}1f`, text: col.cor };
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
                  "w-[272px] shrink-0 bg-muted/60 rounded-xl border flex flex-col max-h-full transition-colors",
                  colunaAlvo === col.coluna ? "border-primary ring-1 ring-primary" : "border-border",
                )}
              >
                {/* Cabeçalho da coluna */}
                <div className="relative flex items-center gap-2 px-3 py-2.5 shrink-0">
                  <span
                    className="font-semibold text-sm truncate rounded-md px-1.5 py-0.5 -my-0.5"
                    style={{ backgroundColor: tons.bg, color: tons.text }}
                  >
                    {col.label}
                  </span>
                  {ehConcluido && <Check className="w-3.5 h-3.5 text-success" />}
                  <span className="text-xs text-muted-foreground">{cartoes.length}</span>
                  {atrasados > 0 && (
                    <span className="text-[11px] font-semibold text-danger whitespace-nowrap" title="Com prazo vencido">
                      {atrasados} atras.
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setMenuColuna(menuColuna === col.coluna ? null : col.coluna)}
                    className={cn(
                      "ml-auto p-1 rounded-md hover:text-foreground hover:bg-muted",
                      statusAtivo ? "text-primary" : "text-muted-foreground",
                    )}
                    title="Resumo e filtro da coluna"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuColuna === col.coluna && (
                    <>
                      <div className="fixed inset-0 z-40" onMouseDown={() => setMenuColuna(null)} />
                      <div className="absolute right-2 top-full mt-1 z-50 w-64 bg-card border border-border rounded-xl shadow-xl text-sm overflow-hidden">
                        <div className="px-3 pt-2.5 pb-2 space-y-0.5 text-xs text-muted-foreground border-b border-border/60">
                          {col.dono && <p>Próxima ação: <span className="text-foreground">{col.dono}</span></p>}
                          {ehConcluido && <p>Concluídas nos últimos {concluidosDias} dias</p>}
                          {valor > 0 && <p>Valor: <span className="text-foreground font-medium">{formatBRL(valor)}</span></p>}
                          {!ehConcluido && cartoes.length > 0 && <p>Mediana na etapa: <span className="text-foreground">{medianaDias(idades)} d</span></p>}
                          {!ehConcluido && acima30 > 0 && <p className="text-warning font-semibold">{acima30} há mais de 30 dias</p>}
                        </div>
                        {porStatus.size > 0 && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Filtrar por status</div>
                            <div className="pb-1.5">
                              {Array.from(porStatus.entries()).map(([status, qtd]) => {
                                const ativo = statusAtivo === status;
                                return (
                                  <button
                                    key={status}
                                    type="button"
                                    onClick={() => {
                                      setFiltroStatus((f) => ({ ...f, [col.coluna]: ativo ? undefined : status }));
                                      setMenuColuna(null);
                                    }}
                                    className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted", ativo && "font-semibold")}
                                  >
                                    <span className={cn("w-2 h-2 rounded-full shrink-0", statusInfo(status).cor)} />
                                    <span className="flex-1 truncate">{statusInfo(status).label}</span>
                                    <span className="text-xs text-muted-foreground">{qtd}</span>
                                    {ativo && <Check className="w-3.5 h-3.5 text-primary" />}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Cartões */}
                <div className="px-2 pb-2 space-y-2 overflow-y-auto flex-1 min-h-[6px]">
                  {cartoes.length === 0 && (termo || soAtrasados || statusAtivo) ? (
                    <p className="text-xs text-muted-foreground/70 text-center py-4 px-3">Nada encontrado com os filtros atuais</p>
                  ) : (
                    cartoes.map((c) => (
                      <CartaoProcesso
                        key={c.id}
                        c={c}
                        onAbrir={setAberto}
                        arrastando={arrastadoId === c.id}
                        onArrastar={setArrastadoId}
                        onSoltar={encerrarArraste}
                      />
                    ))
                  )}
                </div>

                {col.coluna === "montagem" && (
                  <div className="px-2 pb-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setNovaAberta(true)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Adicionar um cartão
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AcompanhamentoDetalheDialog documento={aberto} onNavegar={setAberto} onClose={() => setAberto(null)} />

      <CreateDrawer open={novaAberta} onOpenChange={setNovaAberta} title="Nova compra" width="2xl" onCreated={load}>
        <SolicitacaoCreateForm modoCompra />
      </CreateDrawer>
    </div>
  );
}
