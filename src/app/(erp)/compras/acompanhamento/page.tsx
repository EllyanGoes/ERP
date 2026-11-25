"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Kanban, LayoutList, Loader2, MoreHorizontal, Plus, RefreshCw, Search, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import EmpresaTag from "@/components/shared/EmpresaTag";
import SelectMenu from "@/components/shared/SelectMenu";
import CreateDrawer from "@/components/shared/CreateDrawer";
import SolicitacaoCreateForm from "@/components/compras/SolicitacaoCreateForm";
import type { DocumentoRef } from "@/components/compras/AcompanhamentoDetalheDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarUsuario } from "@/components/projetos/comum";
import { destinoDoArraste, type ColunaCompra } from "@/lib/compras-processo";
import { usePersistedState, useSessionState } from "@/lib/use-persisted-state";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import CompraDetalhe from "@/components/compras/CompraDetalhe";
import ModalPortal from "@/components/shared/ModalPortal";
import EscClose from "@/components/shared/EscClose";

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

type CompraAberta = { numero: string; empresa: string; aba: string | null; doc: string | null };

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


// Parado há mais que isto na mesma etapa → contador em destaque.
const DIAS_ALERTA = 7;

function diasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Cartão ─────────────────────────────────────────────────────────────────────
// Enxuto de propósito: a coluna já diz a etapa e o status, e os documentos
// SC·CT·PC·DE ficam na página da compra. No cartão: o que se compra, de quem,
// quanto, até quando e quem pediu.

// ── Situação da compra (filtro das colunas) ────────────────────────────────────
// Em vez do status cru de cada documento (a coluna Solicitação misturava 7
// status de SC e de cotação), o que a compra está esperando, em linguagem de
// processo.
type Situacao =
  | "rascunho" | "a_cotar" | "cotando" | "saldo" | "revisar"
  | "aguardando_aprovacao"
  | "emitido" | "em_transito" | "pedido_rascunho"
  | "aguardando_conferencia" | "em_conferencia" | "divergencia"
  | "concluida";

const SITUACOES: Record<Situacao, { label: string; cor: string }> = {
  rascunho:               { label: "Rascunho",               cor: "bg-gray-400" },
  a_cotar:                { label: "A cotar",                cor: "bg-amber-500" },
  cotando:                { label: "Cotando",                cor: "bg-orange-500" },
  saldo:                  { label: "Saldo a comprar",        cor: "bg-orange-600" },
  revisar:                { label: "Revisar (sem cotação/pedido)", cor: "bg-red-500" },
  aguardando_aprovacao:   { label: "Aguardando aprovação",   cor: "bg-amber-500" },
  emitido:                { label: "Emitido",                cor: "bg-blue-500" },
  em_transito:            { label: "Em trânsito",            cor: "bg-indigo-500" },
  pedido_rascunho:        { label: "Pedido em rascunho",     cor: "bg-gray-400" },
  aguardando_conferencia: { label: "Aguardando conferência", cor: "bg-violet-400" },
  em_conferencia:         { label: "Em conferência",         cor: "bg-violet-600" },
  divergencia:            { label: "Divergência",            cor: "bg-red-500" },
  concluida:              { label: "Concluída",              cor: "bg-green-500" },
};

function situacaoDe(c: { etapa: Etapa; status: string; concluido: boolean; coluna: ColunaCompra }): Situacao {
  if (c.concluido) return "concluida";
  if (c.coluna === "aprovacao") return "aguardando_aprovacao";
  switch (c.etapa) {
    case "solicitacao":
      if (c.status === "RASCUNHO") return "rascunho";
      if (c.status === "PARCIALMENTE_ATENDIDA") return "saldo";
      if (c.status === "EM_COTACAO" || c.status === "EM_PEDIDO") return "revisar";
      return "a_cotar";
    case "cotacao":
      return "cotando";
    case "pedido":
      if (c.status === "EM_TRANSITO") return "em_transito";
      if (c.status === "RASCUNHO" || c.status === "ENVIADO") return "pedido_rascunho";
      return "emitido";
    case "entrada":
      if (c.status === "DIVERGENCIA") return "divergencia";
      if (c.status === "EM_CONFERENCIA") return "em_conferencia";
      return "aguardando_conferencia";
  }
}

const ORDEM_VISUAL: ColunaCompra[] = ["montagem", "aprovacao", "entrega", "conferencia", "concluido"];

// Status que fogem do normal da coluna e merecem aparecer no cartão.
const STATUS_DE_ALERTA: Record<string, string> = {
  RASCUNHO: "Rascunho",
  DIVERGENCIA: "Divergência",
  PARCIALMENTE_ATENDIDA: "Parcial",
  EM_TRANSITO: "Em trânsito",
  REJEITADA: "Reprovada",
};

function CartaoProcesso({ c, mostrarEmpresa, onAbrir, arrastando, onArrastar, onSoltar }: {
  c: Cartao;
  mostrarEmpresa: boolean;
  onAbrir: () => void;
  arrastando: boolean;
  onArrastar: (id: string) => void;
  onSoltar: () => void;
}) {
  const dias = diasDesde(c.desde);
  const arrastavel = !c.concluido;
  // Na SC o "título" da API é o solicitante; nas demais etapas é o fornecedor/cotação.
  const contraparte = c.etapa === "solicitacao" || c.titulo === c.assunto ? null : c.titulo;
  const alerta = !c.concluido ? STATUS_DE_ALERTA[c.status] : undefined;
  const urgente = c.prioridade != null && c.prioridade >= 4;
  const tempo = `Nesta etapa há ${dias} d${c.prazo ? ` · ${c.prazoLabel ?? "Prazo"} ${formatDate(c.prazo)}` : ""}`;

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
      onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
      className={cn(
        "bg-card rounded-lg border border-border px-3 py-2.5 shadow-sm cursor-pointer transition-colors hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        arrastando && "opacity-40",
      )}
    >
      {(urgente || c.setor || alerta) && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {urgente && (
            <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-danger/15 text-danger">
              {c.prioridade! >= 5 ? "Crítica" : "Urgente"}
            </span>
          )}
          {c.setor && (
            <span className="rounded px-1.5 py-px text-[10px] font-medium bg-muted text-muted-foreground capitalize">
              {c.setor.toLowerCase()}
            </span>
          )}
          {alerta && (
            <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-warning/15 text-warning">{alerta}</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {c.concluido && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />}
        <p
          className={cn("text-sm leading-snug flex-1 line-clamp-2", c.concluido ? "text-muted-foreground" : "text-foreground")}
          title={c.assunto}
        >
          {c.assunto}
        </p>
      </div>
      {contraparte && <p className="mt-0.5 text-xs text-muted-foreground truncate" title={contraparte}>{contraparte}</p>}

      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{c.numero}</span>
        {mostrarEmpresa && <EmpresaTag empresaId={c.empresaId} />}
        {c.concluido ? (
          c.prazo && <span title={tempo}>{formatDate(c.prazo)}</span>
        ) : c.atrasado && c.prazo ? (
          <span className="flex items-center gap-0.5 font-semibold text-danger" title={tempo}>
            <Clock className="w-3 h-3" />{formatDate(c.prazo)}
          </span>
        ) : (
          <span className={cn(dias >= DIAS_ALERTA && "text-warning")} title={tempo}>{dias === 0 ? "hoje" : `${dias} d`}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {c.valor != null && c.valor > 0 && <span className="font-semibold text-foreground">{formatBRL(c.valor)}</span>}
          {c.solicitante && <AvatarUsuario nome={c.solicitante} size="sm" title={`Solicitante: ${c.solicitante}`} />}
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AcompanhamentoComprasPage() {
  const [busca, setBusca] = useSessionState<string>("compras:acompanhamento:busca", "");
  const [concluidosDias, setConcluidosDias] = usePersistedState<string>("compras:acompanhamento:concluidos-dias", "7");
  const [visao, setVisao] = usePersistedState<"quadro" | "lista">("compras:acompanhamento:visao", "quadro");

  // Filtro de status por coluna (clique nos contadores do cabeçalho).
  const [filtroStatus, setFiltroStatus] = usePersistedState<Partial<Record<ColunaCompra, string>>>("compras:acompanhamento:status-coluna", {});
  const [menuColuna, setMenuColuna] = useState<ColunaCompra | null>(null);
  const [menuNova, setMenuNova] = useState(false);

  // Arrastar leva ao formulário do próximo documento (nada é criado aqui).
  const router = useRouter();
  const [arrastadoId, setArrastadoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<ColunaCompra | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [compraAberta, setCompraAberta] = useState<CompraAberta | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; href?: string; acao?: string } | null>(null);

  // Volta para a tela sem spinner: mostra o último quadro e atualiza em 2º plano.
  const { data, loading, refreshing, erro, recarregar: load } =
    useRelatorioCache<Resposta>(`/api/compras/acompanhamento?concluidosDias=${concluidosDias}`);

  const termo = normalizar(busca.trim());
  const porColuna = useMemo(() => {
    const mapa: Record<ColunaCompra, Cartao[]> = { montagem: [], aprovacao: [], entrega: [], conferencia: [], concluido: [] };
    for (const c of data?.cartoes ?? []) {
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
  }, [data, termo]);

  const colunas = concluidosDias === "0" ? COLUNAS.filter((c) => c.coluna !== "concluido") : COLUNAS;
  // Visão em lista: os mesmos cartões (com a busca aplicada), na ordem das etapas.
  const linhasLista = colunas.flatMap((col) => porColuna[col.coluna]);

  // Sigla da empresa no cartão só quando o quadro mistura empresas (modo grupo).
  const variasEmpresas = new Set((data?.cartoes ?? []).map((c) => c.empresaId)).size > 1;

  const colunasLista: ColumnDef<Cartao>[] = [
    {
      id: "numero", header: "Compra", accessorKey: "numero",
      cell: ({ row: { original: c } }) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {c.concluido && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
          <span className="font-mono text-xs font-semibold text-foreground">{c.numero}</span>
          {variasEmpresas && <EmpresaTag empresaId={c.empresaId} />}
        </span>
      ),
    },
    {
      id: "assunto", header: "O que", accessorKey: "assunto",
      cell: ({ row: { original: c } }) => (
        <span className="flex items-center gap-1.5 min-w-0">
          {c.prioridade != null && c.prioridade >= 4 && (
            <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold bg-danger/15 text-danger">
              {c.prioridade >= 5 ? "Crítica" : "Urgente"}
            </span>
          )}
          <span className="truncate max-w-[340px] text-foreground" title={c.assunto}>{c.assunto}</span>
        </span>
      ),
    },
    {
      id: "etapa", header: "Etapa",
      accessorFn: (c) => ORDEM_VISUAL.indexOf(c.coluna),
      cell: ({ row: { original: c } }) => {
        const col = COLUNAS.find((x) => x.coluna === c.coluna)!;
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${col.cor}1f`, color: col.cor }}>
              {col.label}
            </span>
            {!c.concluido && STATUS_DE_ALERTA[c.status] && (
              <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-warning/15 text-warning">{STATUS_DE_ALERTA[c.status]}</span>
            )}
          </span>
        );
      },
    },
    {
      id: "fornecedor", header: "Fornecedor",
      accessorFn: (c) => (c.etapa === "solicitacao" ? "" : c.titulo),
      cell: ({ getValue }) => <span className="truncate max-w-[220px] block text-muted-foreground">{String(getValue() || "—")}</span>,
    },
    {
      id: "setor", header: "Setor", accessorFn: (c) => c.setor ?? "",
      cell: ({ getValue }) => <span className="text-muted-foreground capitalize">{String(getValue() || "—").toLowerCase()}</span>,
    },
    {
      id: "solicitante", header: "Solicitante", accessorFn: (c) => c.solicitante ?? "",
      cell: ({ row: { original: c } }) => c.solicitante ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <AvatarUsuario nome={c.solicitante} size="sm" />
          <span className="text-muted-foreground">{c.solicitante}</span>
        </span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "prazo", header: "Prazo", accessorKey: "prazo", meta: { sortTipo: "data" },
      cell: ({ row: { original: c } }) => c.prazo ? (
        <span
          title={c.prazoLabel ?? undefined}
          className={cn("whitespace-nowrap", c.atrasado && !c.concluido ? "font-semibold text-danger" : "text-muted-foreground")}
        >
          {formatDate(c.prazo)}
        </span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "dias", header: "Na etapa", accessorFn: (c) => (c.concluido ? null : diasDesde(c.desde)), meta: { sortTipo: "numero" },
      cell: ({ getValue }) => {
        const d = getValue() as number | null;
        return d == null
          ? <span className="text-muted-foreground">—</span>
          : <span className={cn("whitespace-nowrap", d >= DIAS_ALERTA ? "text-warning" : "text-muted-foreground")}>{d === 0 ? "hoje" : `${d} d`}</span>;
      },
    },
    {
      id: "valor", header: "Valor", accessorFn: (c) => c.valor ?? 0, meta: { sortTipo: "numero" },
      cell: ({ row: { original: c } }) => (
        <span className="block text-right font-semibold text-foreground whitespace-nowrap">
          {c.valor != null && c.valor > 0 ? formatBRL(c.valor) : "—"}
        </span>
      ),
    },
  ];

  // Cartão abre a página única da compra, na aba do documento clicado.
  // Cartão abre a compra num popup; "Abrir em aba" leva à página própria.
  function abrirCompra(c: Cartao, d: DocumentoRef) {
    setCompraAberta({ numero: c.numero, empresa: c.empresaId, aba: d.etapa, doc: d.id });
  }
  function fecharCompra() {
    setCompraAberta(null);
    load(); // o que foi feito no popup aparece no quadro
  }
  function abrirEmAba(a: CompraAberta) {
    const qs = new URLSearchParams({ empresa: a.empresa, ...(a.aba ? { aba: a.aba } : {}), ...(a.doc ? { doc: a.doc } : {}) });
    setCompraAberta(null);
    router.push(`/compras/compra/${encodeURIComponent(a.numero)}?${qs.toString()}`);
  }

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
        <h1 className="text-lg font-semibold text-foreground">Fluxo de Compras</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex">
            <Button onClick={() => setNovaAberta(true)} className="h-9 rounded-r-none">
              <Plus className="w-4 h-4 mr-1" />Nova compra
            </Button>
            <Button
              onClick={() => setMenuNova((v) => !v)}
              className="h-9 px-2 rounded-l-none border-l border-primary-foreground/20"
              title="Outros lançamentos"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
            {menuNova && (
              <>
                <div className="fixed inset-0 z-40" onMouseDown={() => setMenuNova(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-card border border-border rounded-xl shadow-xl text-sm overflow-hidden py-1">
                  {/* Pedido avulso saiu: pulava a aprovação. Compra com fornecedor já
                      definido = Nova compra com uma proposta só. */}
                  <Link href="/suprimentos/conferencias/novo" className="block px-3 py-2 hover:bg-muted">
                    <span className="font-medium text-foreground">Lançar nota sem pedido</span>
                    <span className="block text-xs text-muted-foreground">Compra já feita (balcão, urgência)</span>
                  </Link>
                </div>
              </>
            )}
          </div>
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
          <div className="flex items-center gap-0.5 h-9 p-0.5 border border-border rounded-lg bg-card">
            {([
              { v: "quadro", label: "Quadro", Icon: Kanban },
              { v: "lista",  label: "Lista",  Icon: LayoutList },
            ] as const).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisao(v)}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 h-full px-2.5 rounded-md text-sm transition-colors",
                  visao === v ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
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
            <RefreshCw className={cn("w-4 h-4", (loading || refreshing) && "animate-spin")} />
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
      ) : visao === "lista" ? (
        <DataTable
          data={linhasLista}
          columns={colunasLista}
          hideSearch
          columnConfig
          itemLabel="compra"
          getRowId={(c) => c.id}
          onRowClick={(c) => abrirCompra(c, c.atual)}
        />
      ) : (
        // Dimensões do kanban de Projetos: lista de 272px e 12px entre listas.
        <div className="flex items-start gap-3 overflow-x-auto pb-1 h-[calc(100vh-126px)] min-h-[420px]">
          {colunas.map((col) => {
            const todos = porColuna[col.coluna];
            // Contagem por status (antes do filtro de status da coluna).
            const porStatus = new Map<string, number>();
            for (const c of todos) { const k = situacaoDe(c); porStatus.set(k, (porStatus.get(k) ?? 0) + 1); }
            const statusAtivo = filtroStatus[col.coluna] && porStatus.has(filtroStatus[col.coluna]!)
              ? filtroStatus[col.coluna]!
              : null;
            const cartoes = statusAtivo ? todos.filter((c) => situacaoDe(c) === statusAtivo) : todos;
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
                  "flex-1 min-w-[272px] max-w-[380px] bg-muted/60 rounded-xl border flex flex-col max-h-full transition-colors",
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
                    <span className="flex items-center gap-1 text-[11px] text-danger whitespace-nowrap" title={`${atrasados} com prazo vencido`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-danger" />{atrasados}
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
                            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Filtrar por situação</div>
                            <div className="pb-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setFiltroStatus((f) => ({ ...f, [col.coluna]: undefined }));
                                  setMenuColuna(null);
                                }}
                                className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted", !statusAtivo && "font-semibold")}
                              >
                                <span className="w-2 h-2 shrink-0" />
                                <span className="flex-1 truncate">Todos</span>
                                <span className="text-xs text-muted-foreground">{todos.length}</span>
                                {!statusAtivo && <Check className="w-3.5 h-3.5 text-primary" />}
                              </button>
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
                                    <span className={cn("w-2 h-2 rounded-full shrink-0", SITUACOES[status as Situacao]?.cor ?? "bg-gray-400")} />
                                    <span className="flex-1 truncate">{SITUACOES[status as Situacao]?.label ?? status}</span>
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
                  {cartoes.length === 0 && (termo || statusAtivo) ? (
                    <p className="text-xs text-muted-foreground/70 text-center py-4 px-3">Nada encontrado com os filtros atuais</p>
                  ) : (
                    cartoes.map((c) => (
                      <CartaoProcesso
                        key={c.id}
                        c={c}
                        mostrarEmpresa={variasEmpresas}
                        onAbrir={() => abrirCompra(c, c.atual)}
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


      {/* Popup da compra. Sem Dialog/transform de propósito: um ancestral com
          transform vira a referência dos "fixed" internos e o escurecido dos
          modais das abas (ex.: Editar cotação) ficava cortado no popup. */}
      {compraAberta && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 p-[2.5vh]"
            onMouseDown={(e) => { if (e.target === e.currentTarget) fecharCompra(); }}
          >
            <EscClose onClose={fecharCompra} />
            <div
              role="dialog"
              aria-label={`Compra ${compraAberta.numero}`}
              className="relative w-[min(1280px,95vw)] h-[95vh] overflow-y-auto rounded-xl bg-background shadow-2xl ring-1 ring-foreground/10"
            >
              <button
                type="button"
                onClick={fecharCompra}
                title="Fechar (Esc)"
                className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
              <CompraDetalhe
                numeroCompra={compraAberta.numero}
                empresa={compraAberta.empresa}
                abaParam={compraAberta.aba}
                docParam={compraAberta.doc}
                onNavegar={({ aba, doc }) => setCompraAberta((a) => (a ? { ...a, aba: aba ?? a.aba, doc: doc ?? null } : a))}
                onAbrirEmAba={() => abrirEmAba(compraAberta)}
              />
            </div>
          </div>
        </ModalPortal>
      )}

      <CreateDrawer open={novaAberta} onOpenChange={setNovaAberta} title="Nova compra" width="2xl" onCreated={load}>
        <SolicitacaoCreateForm modoCompra />
      </CreateDrawer>
    </div>
  );
}
