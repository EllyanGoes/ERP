"use client";

// Detalhe da OS no formato de CMMS (modelo Tractian): cabeçalho "nº + título" com
// Editar/imprimir/⋮, régua de status com 4 botões (Em aberto · Em espera · Em
// progresso · Concluída) e a barra de linha do tempo por status, e as abas Geral ·
// Atividades · Apontamentos · Itens · Custos · Histórico.
// Os 9 status internos continuam valendo — a régua só agrupa; quem decide a
// transição é o motor (src/lib/manutencao/ordem.ts) pela API /acao. Conclusão em
// duas etapas: o técnico ENCERRA, o PCM CONCLUI (ou devolve para execução).
// Atividades = linhas de ManutOrdemServico (checklist do plano + serviços); cada
// uma tem seus Itens (ManutOrdemMaterial PREVISTO com servicoId) — adicionar item
// na atividade já o considera material da OS.
// Usado em dois lugares: a página /pcm/os/[id] (modo "pagina", link direto) e o
// cartão aberto por cima do quadro de /pcm/os?os=<id> (modo "overlay").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Autoria } from "@/components/shared/Autoria";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarUsuario } from "@/components/projetos/comum";
import EnviarOsWhatsappDialog from "@/components/manutencao/EnviarOsWhatsappDialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CalendarClock, Check, CheckCircle2, ExternalLink, Info, Loader2, LockOpen, MessageCircle, MoreVertical, Package, Pause, PauseCircle,
  Pencil, Play, PlayCircle, Plus, Printer, RotateCcw, Square, Timer, Trash2, Undo2, Wrench, X, XCircle,
} from "lucide-react";
import {
  AtivoCombobox, DataHora, OPCOES_PRIORIDADE, PrioridadeBadge, StatusOSBadge, api, brl, fmtData, fmtDataHora, fmtHoras, useManutLookups,
} from "@/components/manutencao/comum";
import {
  COR_STATUS_BARRA, GRUPO_DO_STATUS, fmtDuracao, segmentosStatus, situacaoReserva,
  type GrupoStatusOS, type SituacaoReserva,
} from "@/components/manutencao/os-quadro";

type MaterialAtv = { id: string; itemId: string | null; descricao: string; quantidade: string; unidade: string | null; origem: string; item: { codigo: string } | null };
type Servico = {
  id: string; seq: number; descricao: string; servicoId: string | null; sintomaId: string | null; causaId: string | null;
  tipoResposta: string; faixaMin: string | null; faixaMax: string | null; resposta: string | null; conforme: boolean | null; executado: boolean; tempoHoras: string | null;
  servico: { descricao: string } | null; sintoma: { descricao: string } | null; causa: { descricao: string } | null;
  materiais: MaterialAtv[];
};
type Apont = { id: string; colaboradorId: string | null; nome: string; inicio: string; fim: string | null; custoHora: string | null; observacao: string | null };
type Requisicao = { id: string; numero: string; tipo: string; status: string; data: string; itens: { itemId: string; quantidade: string; item: { codigo: string; descricao: string } }[] };
type OSDet = {
  id: string; numero: string; status: string; prioridade: string; descricao: string; createdAt: string; updatedAt: string; criadoPor: string | null; atualizadoPor: string | null;
  programadaPara: string | null; prazo: string | null; horasEstimadas: string | null; exigeParada: boolean; iniciadaEm: string | null;
  encerradaEm: string | null; encerradaPor: string | null; concluidaEm: string | null; concluidaPor: string | null; canceladaEm: string | null; motivoCancelamento: string | null;
  paradaInicio: string | null; paradaFim: string | null; observacaoTecnica: string | null; leituraMedidor: string | null; localTexto: string | null;
  custoMaoObra: string; custoMaterial: string; custoTerceiros: string; codOrdLegado: number | null;
  tipoId: string; equipeId: string | null; responsavelId: string | null; planoId: string | null;
  ativo: { id: string; codApl: number; tag: string; nome: string; status: string; localizacao: string | null } | null;
  tipo: { sigla: string; nome: string; natureza: string; contaComoFalha: boolean };
  plano: { id: string; codigo: string; nome: string } | null;
  equipe: { nome: string } | null; responsavel: { nome: string } | null; centroCusto: { id: string; codigo: string; nome: string } | null;
  servicos: Servico[];
  materiais: { id: string; itemId: string | null; servicoId: string | null; descricao: string; quantidade: string; unidade: string | null; valorTotal: string; origem: string; item: { codigo: string } | null }[];
  apontamentos: Apont[];
  terceiros: { id: string; descricao: string; valor: string; pedidoCompraId: string | null; fornecedor: { razaoSocial: string; nomeFantasia: string | null } | null }[];
  eventos: { id: string; tipo: string; detalhe: string | null; usuario: string | null; createdAt: string }[];
  solicitacoes: { id: string; numero: string; solicitanteNome: string | null; createdAt: string; descricao: string }[];
  tarefa: { id: string; titulo: string; projetoId: string; projeto: { nome: string } } | null;
  requisicoes: Requisicao[];
  acoes: string[]; podeValidar: boolean; pendencias: string[];
};

const ACAO: Record<string, { label: string; motivo?: boolean; pcm?: boolean; variant?: "default" | "outline" | "destructive" }> = {
  iniciar: { label: "Iniciar" },
  planejar: { label: "Planejar", pcm: true, variant: "outline" },
  pausar: { label: "Pausa", motivo: true, variant: "outline" },
  aguardar_material: { label: "Aguardando material", motivo: true, variant: "outline" },
  aguardar_terceiro: { label: "Aguardando terceiro", motivo: true, variant: "outline" },
  retomar: { label: "Retomar" },
  encerrar: { label: "Encerrar execução" },
  concluir: { label: "Validar e concluir", pcm: true },
  devolver: { label: "Devolver p/ execução", motivo: true, pcm: true, variant: "outline" },
  reabrir: { label: "Reabrir", motivo: true, pcm: true, variant: "outline" },
  cancelar: { label: "Cancelar OS", motivo: true, pcm: true, variant: "destructive" },
};
const ACOES_ESPERA = ["pausar", "aguardar_material", "aguardar_terceiro"];

const EVENTO_LABEL: Record<string, string> = {
  CRIADA: "OS aberta", PLANEJAR: "Planejada", INICIAR: "Iniciada", PAUSAR: "Pausada", AGUARDAR_MATERIAL: "Aguardando material",
  AGUARDAR_TERCEIRO: "Aguardando terceiro", RETOMAR: "Retomada", ENCERRAR: "Execução encerrada", CONCLUIR: "Validada e concluída",
  DEVOLVER: "Devolvida para execução", REABRIR: "Reaberta", CANCELAR: "Cancelada", SS_ANEXADA: "Solicitação anexada",
  ENVIADA_WHATSAPP: "Enviada por WhatsApp", TAREFA_VINCULADA: "Ligada à tarefa", TAREFA_DESVINCULADA: "Desligada da tarefa",
};

const STATUS_LABEL_CURTO: Record<string, string> = {
  ABERTA: "Aberta", PLANEJADA: "Planejada", EM_EXECUCAO: "Em execução", PAUSADA: "Pausada", AGUARDANDO_MATERIAL: "Aguardando material",
  AGUARDANDO_TERCEIRO: "Aguardando terceiro", ENCERRADA: "Encerrada (a validar)", CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};

const horas = (a: { inicio: string; fim: string | null }, agora: number) => ((a.fim ? new Date(a.fim).getTime() : agora) - new Date(a.inicio).getTime()) / 3_600_000;

/** Título curto da OS (1ª linha da descrição). */
const tituloCurto = (d: string) => { const l = d.split("\n")[0].trim(); return l.length > 90 ? `${l.slice(0, 88)}…` : l; };

/** Estado de uma atividade: checklist respondido / serviço executado. */
type EstadoAtv = "pendente" | "feito" | "nok" | "na";
function estadoAtividade(s: Servico): EstadoAtv {
  if (s.tipoResposta === "NENHUMA") return s.executado ? "feito" : "pendente";
  if (!s.resposta) return "pendente";
  if (s.conforme === false) return "nok";
  return s.resposta === "N/A" ? "na" : "feito";
}
const ESTADO_ATV: Record<EstadoAtv, { label: string; cls: string; barra: string }> = {
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground border-border", barra: "bg-muted-foreground/30" },
  feito: { label: "Feito", cls: "bg-success/10 text-success border-success/30", barra: "bg-success" },
  nok: { label: "Não conforme", cls: "bg-danger/10 text-danger border-danger/30", barra: "bg-danger" },
  na: { label: "N/A", cls: "bg-muted text-foreground border-border", barra: "bg-muted-foreground/60" },
};

const SELO_RESERVA: Record<SituacaoReserva, { label: string; cls: string }> = {
  pendente: { label: "Reserva pendente", cls: "bg-warning/10 text-warning border-warning/30" },
  requisitado: { label: "Requisitado", cls: "bg-info/10 text-info border-info/30" },
  atendido: { label: "Atendido", cls: "bg-success/10 text-success border-success/30" },
};

/** Cor do selo de categoria (tipo de manutenção) pela natureza. */
function corCategoria(t: OSDet["tipo"]): string {
  if (t.contaComoFalha) return "bg-danger/10 text-danger border-danger/30";
  if (t.natureza.startsWith("PREVENTIVA")) return "bg-info/10 text-info border-info/30";
  if (t.natureza.startsWith("INSPECAO")) return "bg-purple-500/10 text-purple-600 border-purple-500/30";
  if (t.natureza.startsWith("PREDITIVA")) return "bg-success/10 text-success border-success/30";
  return "bg-muted text-foreground border-border";
}

type Props = {
  id: string;
  modo: "pagina" | "overlay";
  /** Overlay: fecha o cartão (X). */
  onFechar?: () => void;
  /** Chamado depois de qualquer alteração (o quadro de fora recarrega). */
  onMudou?: () => void;
};

type AbaId = "geral" | "atividades" | "apontamentos" | "itens" | "custos" | "historico";

export default function OrdemServicoDetalhe({ id, modo, onFechar, onMudou }: Props) {
  const lk = useManutLookups();
  const [o, setO] = useState<OSDet | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [aba, setAba] = useState<AbaId | "">("");
  // No overlay o título da aba continua o do quadro.
  useTabTitle(modo === "pagina" ? (o ? `${o.numero}` : "OS") : null);
  const carregar = useCallback(async () => {
    const res = await fetch(`/api/pcm/os/${id}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErroCarga(j?.error || "Erro ao carregar a OS."); return; }
    setErroCarga(""); setO(j.data);
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  // Recarrega a OS e avisa quem está por fora (quadro) que algo mudou.
  const onMudouRef = useRef(onMudou);
  useEffect(() => { onMudouRef.current = onMudou; }, [onMudou]);
  const load = useCallback(async () => { await carregar(); onMudouRef.current?.(); }, [carregar]);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const [msg, setMsg] = useState("");
  // Envio por WhatsApp (link público /os/<token> para os mecânicos)
  const [whats, setWhats] = useState(false);

  // ── ações de status ──────────────────────────────────────────────────────
  // dlg.acoes > 1 = escolha (Em espera: pausa / material / terceiro).
  const [dlg, setDlg] = useState<{ acoes: string[]; acao: string } | null>(null);
  const [motivo, setMotivo] = useState(""); const [fimParada, setFimParada] = useState(""); const [progr, setProgr] = useState("");
  const [executando, setExecutando] = useState(false); const [erroAcao, setErroAcao] = useState("");
  async function executar(acao: string) {
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}/acao`, "POST", { acao, motivo, fimParada: fimParada || null, programadaPara: progr || null });
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); if (!dlg) setMsg(r.error!); return; }
    setDlg(null); setMsg(""); load();
  }
  function clicarAcao(acoes: string[]) {
    if (!acoes.length) return;
    const acao = acoes[0];
    setMotivo(""); setErroAcao(""); setFimParada(""); setProgr(o?.programadaPara ?? "");
    const precisaDialog = acoes.length > 1 || ACAO[acao].motivo || acao === "planejar" || (acao === "encerrar" && o?.paradaInicio && !o.paradaFim);
    if (precisaDialog) setDlg({ acoes, acao }); else executar(acao);
  }

  // ── edição completa (dialog) e edição inline da aba Geral ────────────────
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  function abrirEdit() {
    if (!o) return;
    setF({ ativoId: o.ativo?.id ?? "", tipoId: o.tipoId, prioridade: o.prioridade, descricao: o.descricao, equipeId: o.equipeId ?? "", responsavelId: o.responsavelId ?? "",
      programadaPara: o.programadaPara ?? "", prazo: o.prazo ?? "", horasEstimadas: o.horasEstimadas ?? "", exigeParada: o.exigeParada,
      paradaInicio: o.paradaInicio ?? "", paradaFim: o.paradaFim ?? "", leituraMedidor: o.leituraMedidor ?? "", observacaoTecnica: o.observacaoTecnica ?? "" });
    setErroAcao(""); setEdit(true);
  }
  async function salvarEdit() {
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}`, "PATCH", f);
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setEdit(false); load();
  }
  async function patchOS(campos: Record<string, unknown>) {
    const r = await api(`/api/pcm/os/${id}`, "PATCH", campos);
    if (!r.ok) setMsg(r.error!); else load();
  }

  // ── atividades (serviços / checklist / falha) ────────────────────────────
  const [sv, setSv] = useState<Record<string, string | boolean> | null>(null);
  async function salvarServico() {
    if (!sv) return;
    setExecutando(true); setErroAcao("");
    // `checklist` é só da tela; no checklist o "executado" segue a resposta (não manda).
    const { checklist, ...body } = sv;
    if (checklist) delete body.executado;
    const r = sv.linhaId ? await api(`/api/pcm/os/${id}/servicos`, "PATCH", body) : await api(`/api/pcm/os/${id}/servicos`, "POST", body);
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setSv(null); load();
  }
  async function patchServico(linhaId: string, campos: Record<string, unknown>) {
    const r = await api(`/api/pcm/os/${id}/servicos`, "PATCH", { linhaId, ...campos });
    if (!r.ok) setMsg(r.error!); else load();
  }
  async function removerServico(linhaId: string) {
    const r = await api(`/api/pcm/os/${id}/servicos?linhaId=${linhaId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }
  function abrirServico(s?: Servico) {
    setErroAcao("");
    setSv(s
      ? { linhaId: s.id, descricao: s.descricao, servicoId: s.servicoId ?? "", sintomaId: s.sintomaId ?? "", causaId: s.causaId ?? "", executado: s.executado, tempoHoras: s.tempoHoras ?? "", checklist: s.tipoResposta !== "NENHUMA" }
      : { descricao: "", servicoId: "", sintomaId: "", causaId: "", executado: false, tempoHoras: "" });
  }

  // ── apontamentos ─────────────────────────────────────────────────────────
  const [quem, setQuem] = useState("");
  const [manual, setManual] = useState<{ colaboradorId: string; inicio: string; fim: string; observacao: string } | null>(null);
  async function apontar(body: Record<string, unknown>) {
    const r = await api(`/api/pcm/os/${id}/apontamentos`, "POST", body);
    if (!r.ok) { setMsg(r.error!); setErroAcao(r.error!); return false; }
    setMsg(""); load(); return true;
  }
  async function removerApont(apontamentoId: string) {
    const r = await api(`/api/pcm/os/${id}/apontamentos?apontamentoId=${apontamentoId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }

  // ── terceiros ────────────────────────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [terc, setTerc] = useState<{ fornecedorId: string; descricao: string; valor: string } | null>(null);
  async function abrirTerceiro() {
    setErroAcao(""); setTerc({ fornecedorId: "", descricao: "", valor: "" });
    if (fornecedores.length === 0) {
      const j = await fetch("/api/suprimentos/fornecedores?ativo=1").then((r) => r.json()).catch(() => ({}));
      const lista: { id: string; razaoSocial: string; nomeFantasia?: string | null }[] = Array.isArray(j) ? j : j.data ?? [];
      setFornecedores(lista.map((x) => ({ id: x.id, nome: x.nomeFantasia || x.razaoSocial })));
    }
  }
  async function salvarTerceiro() {
    if (!terc) return;
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}/terceiros`, "POST", { ...terc, valor: Number(terc.valor.replace(",", ".")) });
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setTerc(null); load();
  }
  async function removerTerceiro(terceiroId: string) {
    const r = await api(`/api/pcm/os/${id}/terceiros?terceiroId=${terceiroId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }

  // ── itens (material previsto, por atividade ou da OS geral) ──────────────
  // A baixa real continua pela requisição vinculada; aqui é o que vai ser usado.
  const [produtos, setProdutos] = useState<{ id: string; codigo: string; descricao: string }[]>([]);
  const carregandoProdutos = useRef(false);
  async function garantirProdutos() {
    if (produtos.length || carregandoProdutos.current) return;
    carregandoProdutos.current = true;
    const j = await fetch("/api/itens?limit=3000").then((r) => r.json()).catch(() => ({}));
    setProdutos((j.data ?? []).map((x: { id: string; codigo: string; descricao: string }) => ({ id: x.id, codigo: x.codigo, descricao: x.descricao })));
    carregandoProdutos.current = false;
  }
  /** Linha de inclusão aberta: `servicoId` null = item da OS (sem atividade); "aba-itens" = formulário da aba Itens. */
  const [novoItem, setNovoItem] = useState<{ onde: string; servicoId: string; itemId: string; quantidade: string } | null>(null);
  function abrirNovoItem(onde: string, servicoId: string | null) {
    setErroAcao(""); setNovoItem({ onde, servicoId: servicoId ?? "", itemId: "", quantidade: "1" }); garantirProdutos();
  }
  async function salvarNovoItem() {
    if (!novoItem?.itemId) return;
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}/materiais`, "POST", { itemId: novoItem.itemId, quantidade: novoItem.quantidade, servicoId: novoItem.servicoId || null });
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setNovoItem(null); load();
  }
  async function patchMaterial(materialId: string, campos: Record<string, unknown>) {
    const r = await api(`/api/pcm/os/${id}/materiais`, "PATCH", { materialId, ...campos });
    if (!r.ok) setMsg(r.error!); else load();
  }
  async function removerMaterial(materialId: string) {
    const r = await api(`/api/pcm/os/${id}/materiais?materialId=${materialId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }

  const fechada = !!o && ["CONCLUIDA", "CANCELADA"].includes(o.status);
  const checklist = useMemo(() => o?.servicos.filter((s) => s.tipoResposta !== "NENHUMA") ?? [], [o]);
  const servicosExec = useMemo(() => o?.servicos.filter((s) => s.tipoResposta === "NENHUMA") ?? [], [o]);
  const abertos = useMemo(() => o?.apontamentos.filter((a) => !a.fim) ?? [], [o]);
  const totalHoras = o?.apontamentos.reduce((s, a) => s + horas(a, agora), 0) ?? 0;
  const atvFeitas = o?.servicos.filter((s) => estadoAtividade(s) !== "pendente").length ?? 0;
  const faltaFalha = !!o && o.tipo.contaComoFalha && !o.servicos.some((x) => x.sintomaId && x.causaId) && !fechada;

  // Abre em Geral; cronômetro rodando → Apontamentos; em execução com checklist pendente → Atividades.
  useEffect(() => {
    if (!o || aba) return;
    setAba(abertos.length ? "apontamentos" : o.status === "EM_EXECUCAO" && checklist.some((c) => !c.resposta) ? "atividades" : "geral");
  }, [o, aba, abertos.length, checklist]);

  const botaoFechar = modo === "overlay" && onFechar && (
    <button onClick={onFechar} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Fechar (Esc)" aria-label="Fechar"><X className="w-4 h-4" /></button>
  );
  if (erroCarga) return <div className={cn("text-sm text-danger flex items-start gap-2", modo === "overlay" ? "px-6 py-10" : "p-8")}><span className="flex-1">{erroCarga}</span>{botaoFechar}</div>;
  if (!o) return <div className={cn("flex justify-center", modo === "overlay" ? "py-16" : "py-24")}><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Previstos com produto do ERP vão junto: a requisição já nasce com as linhas
  // (mesmo produto em atividades diferentes soma numa linha só).
  const kitMap = new Map<string, number>();
  for (const m of o.materiais) if (m.origem === "PREVISTO" && m.itemId) kitMap.set(m.itemId, (kitMap.get(m.itemId) ?? 0) + Number(m.quantidade));
  const kit = Array.from(kitMap).map(([itemId, q]) => `${itemId}:${q}`).join(",");
  const requisitarHref = `/suprimentos/requisicoes-materiais/nova?ordemServicoId=${o.id}&os=${encodeURIComponent(o.numero)}${o.centroCusto ? `&centroCustoId=${o.centroCusto.id}` : ""}${kit ? `&kit=${kit}` : ""}`;
  const custoTotal = Number(o.custoMaoObra) + Number(o.custoMaterial) + Number(o.custoTerceiros);
  const ativoLk = o.ativo ? lk.ativos.find((a) => a.id === o.ativo!.id) : undefined;
  const prazoAtrasado = !!o.prazo && !["ENCERRADA", "CONCLUIDA", "CANCELADA"].includes(o.status) && new Date(o.prazo) < new Date(new Date().toDateString());

  // ── régua de status: o que cada um dos 4 botões faz a partir do status atual ──
  const pode = (a: string) => o.acoes.includes(a) && (!ACAO[a]?.pcm || o.podeValidar);
  const existe = (a: string) => o.acoes.includes(a);
  const grupoAtual = GRUPO_DO_STATUS[o.status];
  const regua: { key: GrupoStatusOS; label: string; icon: typeof LockOpen; ativo: string; inativo: string; acoes: string[]; sub: string | null; bloqueio: string | null }[] = [
    {
      key: "aberto", label: "Em aberto", icon: LockOpen, ativo: "bg-muted-foreground/15 border-muted-foreground/50 text-foreground", inativo: "text-muted-foreground",
      acoes: grupoAtual !== "aberto" && pode("planejar") ? ["planejar"] : [],
      sub: grupoAtual === "aberto" ? (o.status === "PLANEJADA" ? `Planejada${o.programadaPara ? ` · ${fmtData(o.programadaPara)}` : ""}` : "Aguardando planejamento") : null,
      bloqueio: grupoAtual !== "aberto" && existe("planejar") && !o.podeValidar ? "Voltar para a fila (replanejar) é do PCM." : null,
    },
    {
      key: "espera", label: "Em espera", icon: PauseCircle, ativo: "bg-orange-500/15 border-orange-500/50 text-orange-600", inativo: "text-muted-foreground",
      acoes: ACOES_ESPERA.filter((a) => pode(a) && STATUS_DE_ESPERA[a] !== o.status),
      sub: grupoAtual === "espera" ? STATUS_LABEL_CURTO[o.status] : null,
      bloqueio: null,
    },
    {
      key: "progresso", label: "Em progresso", icon: PlayCircle, ativo: "bg-warning/15 border-warning/50 text-warning", inativo: "text-muted-foreground",
      acoes: grupoAtual === "progresso" ? [] : ["iniciar", "retomar", "devolver", "reabrir"].filter(pode).slice(0, 1),
      sub: grupoAtual === "progresso" ? (abertos.length ? `${abertos.length} cronômetro(s) rodando` : "Em execução") : null,
      bloqueio: ["devolver", "reabrir"].some(existe) && !o.podeValidar ? "Devolver/reabrir é do PCM." : null,
    },
    {
      key: "concluida", label: "Concluída", icon: CheckCircle2, ativo: o.status === "ENCERRADA" ? "bg-purple-500/15 border-purple-500/50 text-purple-600" : "bg-success/15 border-success/50 text-success", inativo: "text-muted-foreground",
      acoes: pode("encerrar") ? ["encerrar"] : pode("concluir") ? ["concluir"] : [],
      sub: o.status === "ENCERRADA" ? (o.podeValidar ? "Validar e concluir" : "Aguardando validação do PCM") : o.status === "CONCLUIDA" ? `Validada · ${fmtData(o.concluidaEm)}` : null,
      bloqueio: o.status === "ENCERRADA" && !o.podeValidar ? "O técnico já encerrou — falta a validação do PCM." : null,
    },
  ];

  const subtitulo = `${o.tipo.sigla} — ${o.tipo.nome}${o.plano ? ` · plano ${o.plano.codigo} ${o.plano.nome}` : ""}${o.codOrdLegado ? " · importada do Engeman" : ""}`;
  const menuAcoes = (["planejar", "devolver", "reabrir", "cancelar"] as const).filter(pode);
  const botoesCabecalho = (
    <div className="flex items-center gap-1.5">
      {!fechada && <Button size="sm" variant="outline" onClick={abrirEdit} className="gap-1"><Pencil className="w-3.5 h-3.5" /> Editar</Button>}
      <Button size="sm" variant="outline" onClick={() => setWhats(true)} className="gap-1" title="Enviar o link da OS por WhatsApp (abre sem login)">
        <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Enviar
      </Button>
      <button onClick={() => window.open(`/pcm/os/${o.id}/imprimir?auto=1`, "_blank")} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Imprimir (A4)" aria-label="Imprimir"><Printer className="w-4 h-4" /></button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Mais ações" aria-label="Mais ações" />}>
          <MoreVertical className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {menuAcoes.map((a) => (
            <DropdownMenuItem key={a} variant={a === "cancelar" ? "destructive" : "default"} onClick={() => clicarAcao([a])}>
              {a === "planejar" ? <CalendarClock className="w-4 h-4" /> : a === "devolver" ? <Undo2 className="w-4 h-4" /> : a === "reabrir" ? <RotateCcw className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {a === "planejar" ? "Planejar / reprogramar" : ACAO[a].label}
            </DropdownMenuItem>
          ))}
          {menuAcoes.length === 0 && <DropdownMenuItem disabled>Sem ações de PCM para este status</DropdownMenuItem>}
          <DropdownMenuSeparator />
          {modo === "overlay" && <DropdownMenuItem onClick={() => window.location.assign(`/pcm/os/${o.id}`)}><ExternalLink className="w-4 h-4" /> Abrir em página</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => window.open(`/pcm/os/${o.id}/imprimir?auto=1`, "_blank")}><Printer className="w-4 h-4" /> Imprimir (A4)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {modo === "overlay" && <Link href={`/pcm/os/${o.id}`} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Abrir em página"><ExternalLink className="w-4 h-4" /></Link>}
      {botaoFechar}
    </div>
  );

  const abas: { id: AbaId; label: string; n: number | null; alerta: boolean }[] = [
    { id: "geral", label: "Geral", n: null, alerta: false },
    { id: "atividades", label: "Atividades", n: o.servicos.length, alerta: !fechada && (checklist.some((c) => !c.resposta) || faltaFalha) },
    { id: "apontamentos", label: "Apontamentos", n: o.apontamentos.length, alerta: abertos.length > 0 },
    { id: "itens", label: "Itens", n: o.materiais.length + o.requisicoes.length, alerta: false },
    { id: "custos", label: "Custos", n: o.terceiros.length, alerta: false },
    { id: "historico", label: "Histórico", n: o.eventos.length, alerta: false },
  ];

  /** Linha de inclusão de item (produto + qtd). */
  const formNovoItem = (onde: string, comAtividade: boolean) => novoItem?.onde === onde && (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-info/30 bg-info/5 p-2">
      <div className="flex-1 min-w-[16rem]">
        <ComboboxWithCreate value={novoItem.itemId} onChange={(v) => setNovoItem({ ...novoItem, itemId: v })} options={produtos.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
          placeholder={produtos.length ? "Busque o produto pelo código ou descrição…" : "Carregando produtos…"} menuMinWidth={420} />
      </div>
      {comAtividade && (
        <SelectMenu value={novoItem.servicoId} onChange={(v) => setNovoItem({ ...novoItem, servicoId: v })} className="w-56" title="Atividade"
          options={[{ value: "", label: "OS (sem atividade)" }, ...o.servicos.map((s) => ({ value: s.id, label: `${numAtv(s.seq)} ${s.descricao}` }))]} />
      )}
      <Input inputMode="decimal" value={novoItem.quantidade} onChange={(e) => setNovoItem({ ...novoItem, quantidade: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") salvarNovoItem(); }} className="w-24 h-9 text-right" title="Quantidade" />
      <Button size="sm" onClick={salvarNovoItem} disabled={executando || !novoItem.itemId}>{executando ? "Salvando…" : "Adicionar"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setNovoItem(null)}>Cancelar</Button>
      {erroAcao && <p className="w-full text-xs text-danger">{erroAcao}</p>}
    </div>
  );

  return (
    <div>
      {modo === "pagina" ? (
        <PageHeader
          title={`${o.numero} · ${tituloCurto(o.descricao)}`}
          subtitle={subtitulo}
          breadcrumbs={[{ label: "Manutenção" }, { label: "Ordens de Serviço", href: "/pcm/os" }, { label: o.numero }]}
          action={botoesCabecalho} />
      ) : (
        <div className="px-6 pt-5 pb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground leading-snug"><span className="text-muted-foreground font-semibold">#{o.numero}</span> {tituloCurto(o.descricao)}</h2>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
          {botoesCabecalho}
        </div>
      )}

      <div className={cn("space-y-4", modo === "pagina" ? "px-8 pb-10" : "px-6 pb-6")}>
        {msg && <div className="text-sm text-danger bg-danger/5 border border-danger/30 rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1 whitespace-pre-line">{msg}</span><button onClick={() => setMsg("")}><X className="w-4 h-4" /></button></div>}

        {/* ── Status: régua com 4 botões + linha do tempo ───────────────────── */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Status</h3>
            {o.status === "CANCELADA" ? <StatusOSBadge s="CANCELADA" /> : <span className="text-xs text-muted-foreground">{STATUS_LABEL_CURTO[o.status]}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {regua.map((b) => {
              const atual = grupoAtual === b.key;
              const clicavel = !atual && b.acoes.length > 0 && !executando;
              // Concluída com OS encerrada e PCM logado: o botão valida.
              const validar = b.key === "concluida" && o.status === "ENCERRADA" && b.acoes.length > 0;
              return (
                <button
                  key={b.key}
                  type="button"
                  disabled={!clicavel && !validar}
                  onClick={() => clicarAcao(b.acoes)}
                  title={b.bloqueio ?? (b.acoes.length ? b.acoes.map((a) => ACAO[a].label).join(" / ") : undefined)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-sm font-medium transition-colors",
                    atual ? b.ativo : "border-border bg-card",
                    !atual && (clicavel ? "hover:bg-muted text-foreground" : "opacity-60 cursor-not-allowed " + b.inativo),
                    validar && "ring-2 ring-purple-500/40 hover:bg-purple-500/20 cursor-pointer opacity-100",
                  )}
                >
                  <b.icon className="w-5 h-5" />
                  <span>{b.label}</span>
                  {b.sub && <span className="text-[11px] font-normal opacity-80 text-center leading-tight">{b.sub}</span>}
                </button>
              );
            })}
          </div>
          <LinhaTempoStatus o={o} agora={agora} prazoAtrasado={prazoAtrasado} />

          {o.status === "ENCERRADA" && (
            <div className="text-sm bg-purple-500/5 border border-purple-500/30 rounded-lg px-3 py-2 text-foreground flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-[14rem]">Execução encerrada por <b>{o.encerradaPor ?? "—"}</b> em {fmtDataHora(o.encerradaEm)}. {o.podeValidar ? "Confira apontamentos, atividades e itens e valide." : "Aguardando validação do PCM."}</span>
              {o.podeValidar && <>
                <Button size="sm" variant="outline" onClick={() => clicarAcao(["devolver"])} className="gap-1"><Undo2 className="w-3.5 h-3.5" /> Devolver</Button>
                <Button size="sm" onClick={() => clicarAcao(["concluir"])} disabled={executando} className="gap-1"><Check className="w-3.5 h-3.5" /> Validar e concluir</Button>
              </>}
            </div>
          )}
          {!fechada && o.pendencias.length > 0 && (
            <div className="text-xs bg-warning/5 border border-warning/30 rounded-lg px-3 py-2 text-foreground">
              <b className="text-warning">Para concluir falta:</b>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">{o.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {o.status === "CANCELADA" && <div className="text-sm bg-danger/5 border border-danger/30 rounded-lg px-3 py-2">Cancelada em {fmtDataHora(o.canceladaEm)}{o.motivoCancelamento ? `: ${o.motivoCancelamento}` : ""}</div>}
        </div>

        {/* ── Abas ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} className={cn("text-sm px-3 py-2 -mb-px border-b-2 inline-flex items-center gap-1.5", aba === a.id ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {a.label}
              {a.n != null && <span className={cn("text-[11px] rounded-full px-1.5 tabular-nums", a.alerta ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{a.n}</span>}
            </button>
          ))}
        </div>

        {/* ── Geral ────────────────────────────────────────────────────────── */}
        {aba === "geral" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <dl className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-x-4 gap-y-3 text-sm items-start">
              <CampoG l="Ativo">
                {o.ativo ? (
                  <div>
                    {ativoLk?.caminho && <div className="text-[11px] text-muted-foreground">{ativoLk.caminho.split(" › ").join(" / ")}</div>}
                    <Link href={`/pcm/ativos?ativo=${o.ativo.codApl}`} className="font-medium text-info hover:underline inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />{o.ativo.tag} — {o.ativo.nome}</Link>
                    {o.ativo.status === "PARADO" && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">ativo parado</span>}
                    {o.ativo.localizacao && <div className="text-xs text-muted-foreground">{o.ativo.localizacao}</div>}
                  </div>
                ) : <span className="text-muted-foreground">{o.localTexto ?? "Sem ativo"}</span>}
              </CampoG>
              <CampoG l="Responsável">
                <div className="flex items-center gap-2">
                  {o.responsavel && <AvatarUsuario nome={o.responsavel.nome} />}
                  {fechada ? <span>{o.responsavel?.nome ?? "—"}</span> : (
                    <div className="w-64"><ComboboxWithCreate value={o.responsavelId ?? ""} onChange={(v) => patchOS({ responsavelId: v })} allowNone noneLabel="Sem responsável" options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="+ Adicionar" /></div>
                  )}
                </div>
              </CampoG>
              <CampoG l="Categoria">
                <span className={cn("inline-flex items-center text-xs px-2 py-0.5 rounded-md border", corCategoria(o.tipo))}>{o.tipo.sigla} · {o.tipo.nome}</span>
              </CampoG>
              <CampoG l="Prioridade">
                {fechada ? <PrioridadeBadge p={o.prioridade} /> : (
                  <SelectMenu value={o.prioridade} onChange={(v) => patchOS({ prioridade: v })} className="w-44" options={OPCOES_PRIORIDADE.map((p) => ({ ...p, render: () => <PrioridadeBadge p={p.value} /> }))} />
                )}
              </CampoG>
              <CampoG l="Planejamento">
                <div className="space-y-1.5">
                  <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border", o.programadaPara ? "bg-info/10 text-info border-info/30" : "bg-muted text-muted-foreground border-border")}>
                    <CalendarClock className="w-3.5 h-3.5" />{o.programadaPara ? `Planejada para ${fmtDataHora(o.programadaPara)}` : "Aguardando planejamento"}
                  </span>
                  {!fechada && <div className="max-w-sm"><DataHora value={o.programadaPara ?? ""} onChange={(v) => patchOS({ programadaPara: v || null })} /></div>}
                </div>
              </CampoG>
              <CampoG l="Data de vencimento">
                <div className="flex flex-wrap items-center gap-2">
                  {fechada ? <span>{fmtDataHora(o.prazo)}</span> : <div className="max-w-sm flex-1 min-w-[16rem]"><DataHora value={o.prazo ?? ""} onChange={(v) => patchOS({ prazo: v || null })} /></div>}
                  {prazoAtrasado && <span className="text-xs font-semibold text-danger">Atrasada</span>}
                </div>
              </CampoG>
              <CampoG l="Grupo executante">
                {fechada ? <span>{o.equipe?.nome ?? "—"}</span> : (
                  <SelectMenu value={o.equipeId ?? ""} onChange={(v) => patchOS({ equipeId: v })} className="w-64" options={[{ value: "", label: "Sem equipe" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} />
                )}
              </CampoG>
              <CampoG l="Horas estimadas"><span>{o.horasEstimadas ? `${Number(o.horasEstimadas)} h` : "—"}</span>{o.iniciadaEm && <span className="text-xs text-muted-foreground"> · iniciada {fmtDataHora(o.iniciadaEm)}</span>}</CampoG>
              <CampoG l="Parada do ativo">
                <div className={cn("text-xs rounded-lg px-3 py-2 border inline-block", o.paradaInicio && !o.paradaFim ? "bg-danger/5 border-danger/30" : "bg-muted/40 border-border")}>
                  {o.paradaInicio ? <>de {fmtDataHora(o.paradaInicio)} {o.paradaFim ? <>até {fmtDataHora(o.paradaFim)} ({fmtHoras(horas({ inicio: o.paradaInicio, fim: o.paradaFim }, agora))})</> : <span className="text-danger font-medium">— ainda parado</span>}</> : <span className="text-muted-foreground">sem parada registrada{o.exigeParada ? " (serviço exige parar o ativo)" : ""}</span>}
                </div>
              </CampoG>
              <CampoG l="Centro de custo"><span>{o.centroCusto ? `${o.centroCusto.codigo} ${o.centroCusto.nome}` : "—"}</span></CampoG>
              {o.leituraMedidor && <CampoG l="Leitura do medidor"><span>{Number(o.leituraMedidor)}</span></CampoG>}
              <CampoG l="Origem">
                <div className="text-xs space-y-0.5">
                  {o.solicitacoes.map((s) => <div key={s.id}>Solicitação <b>{s.numero}</b> · {s.solicitanteNome ?? "—"} · {fmtData(s.createdAt)}</div>)}
                  {o.tarefa && <div>Tarefa <Link href={`/projetos/${o.tarefa.projetoId}?tarefa=${o.tarefa.id}`} className="text-info hover:underline">{o.tarefa.titulo}</Link> do projeto <b>{o.tarefa.projeto.nome}</b></div>}
                  {o.plano && <div>Plano <Link href={`/pcm/planos/cadastro/${o.plano.id}`} className="text-info hover:underline">{o.plano.codigo} {o.plano.nome}</Link></div>}
                  {!o.solicitacoes.length && !o.tarefa && !o.plano && <span className="text-muted-foreground">{o.codOrdLegado ? "Histórico do Engeman" : "OS direta"}</span>}
                </div>
              </CampoG>
              <CampoG l="Descrição"><p className="whitespace-pre-wrap text-foreground">{o.descricao}</p></CampoG>
              {o.observacaoTecnica && <CampoG l="Observação técnica"><p className="whitespace-pre-wrap text-foreground text-xs">{o.observacaoTecnica}</p></CampoG>}
            </dl>
            <div className="mt-4 pt-3 border-t border-border/60"><Autoria criadoPor={o.criadoPor} atualizadoPor={o.atualizadoPor} criadoEm={o.createdAt} atualizadoEm={o.updatedAt} /></div>
          </div>
        )}

        {/* ── Atividades ───────────────────────────────────────────────────── */}
        {aba === "atividades" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[14rem]">
                <div className="text-sm font-semibold text-foreground">Atividades · {atvFeitas}/{o.servicos.length}</div>
                {o.servicos.length > 0 && <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-md"><div className="h-full bg-success transition-all" style={{ width: `${(atvFeitas / o.servicos.length) * 100}%` }} /></div>}
              </div>
              {!fechada && <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirServico()}><Plus className="w-3.5 h-3.5" /> Atividade</Button>}
            </div>
            {faltaFalha && <p className="text-xs text-warning bg-warning/5 border border-warning/30 rounded-lg px-3 py-2">OS corretiva: registre numa atividade o sintoma (defeito) e a causa — é isso que alimenta MTBF, MTTR e FMEA.</p>}
            {o.servicos.length === 0 && <Vazio t="Nenhuma atividade. OS de plano trazem o checklist; nas demais, registre aqui o que foi feito (e a falha, se for corretiva)." />}
            {o.servicos.map((s) => {
              const est = estadoAtividade(s);
              const cfg = ESTADO_ATV[est];
              const pendReserva = s.materiais.filter((m) => situacaoReserva(m.itemId, o.requisicoes) === "pendente").length;
              return (
                <div key={s.id} className="bg-card border border-border rounded-xl">
                  <div className="flex items-start gap-3 px-4 pt-3">
                    <span className="text-xs font-mono text-muted-foreground mt-0.5 tabular-nums">{numAtv(s.seq)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("font-medium text-sm text-foreground", est === "nok" && "text-danger")}>{s.descricao}</span>
                        <span className={cn("text-[11px] px-1.5 py-0.5 rounded border", cfg.cls)}>{cfg.label}</span>
                        <span className="text-[11px] text-muted-foreground">{s.tipoResposta === "NENHUMA" ? "serviço" : "checklist"}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full transition-all", cfg.barra)} style={{ width: est === "pendente" ? "0%" : "100%" }} /></div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                        {s.materiais.length > 0 && <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{s.materiais.length} {s.materiais.length === 1 ? "reserva" : "reservas"}{pendReserva ? ` · ${pendReserva} pendente(s)` : ""}</span>}
                        {s.tempoHoras && <span>{Number(s.tempoHoras)} h</span>}
                        {s.servico && s.servico.descricao !== s.descricao && <span>{s.servico.descricao}</span>}
                      </div>
                    </div>
                    {!fechada && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => setAba("apontamentos")} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Cronômetro / apontar horas"><Timer className="w-4 h-4" /></button>
                        <button onClick={() => abrirServico(s)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Editar atividade (sintoma, causa, tempo)"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => removerServico(s.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-muted" title="Excluir atividade"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Resposta: checklist (OK/NOK/N.A., número, texto) ou serviço feito/não feito */}
                    {s.tipoResposta === "OK_NOK" ? (
                      <div className="flex gap-1">
                        {["OK", "NOK", "N/A"].map((r) => <button key={r} disabled={fechada} onClick={() => patchServico(s.id, { resposta: s.resposta === r ? null : r })} className={cn("text-xs px-3 py-1 rounded-md border", s.resposta === r ? (r === "OK" ? "bg-success/15 border-success/40 text-success" : r === "NOK" ? "bg-danger/15 border-danger/40 text-danger" : "bg-muted border-border text-foreground") : "border-border text-muted-foreground hover:bg-muted")}>{r}</button>)}
                      </div>
                    ) : s.tipoResposta !== "NENHUMA" ? (
                      <div className="flex items-center gap-2">
                        <Input key={s.resposta ?? ""} defaultValue={s.resposta ?? ""} disabled={fechada} inputMode={s.tipoResposta === "NUMERO" ? "decimal" : undefined} placeholder={s.tipoResposta === "NUMERO" ? "Valor medido" : "Resposta"}
                          className={cn("h-8 w-56 text-sm", s.conforme === false && "border-danger")}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          onBlur={(e) => e.target.value !== (s.resposta ?? "") && patchServico(s.id, { resposta: e.target.value || null })} />
                        {s.tipoResposta === "NUMERO" && (s.faixaMin || s.faixaMax) && <span className="text-[11px] text-muted-foreground">faixa {s.faixaMin != null ? Number(s.faixaMin) : "—"} a {s.faixaMax != null ? Number(s.faixaMax) : "—"}</span>}
                      </div>
                    ) : (
                      <button disabled={fechada} onClick={() => patchServico(s.id, { executado: !s.executado })} className={cn("text-xs px-3 py-1 rounded-md border inline-flex items-center gap-1", s.executado ? "bg-success/15 border-success/40 text-success" : "border-border text-muted-foreground hover:bg-muted")}>
                        <Check className="w-3.5 h-3.5" />{s.executado ? "Executado" : "Marcar como executado"}
                      </button>
                    )}
                    {(s.sintoma || s.causa) && (
                      <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-1">
                        <div><span className="text-muted-foreground">Sintoma: </span>{s.sintoma?.descricao ?? "—"}</div>
                        <div><span className="text-muted-foreground">Causa: </span>{s.causa?.descricao ?? "—"}</div>
                      </div>
                    )}
                    {est === "nok" && !s.sintoma && !fechada && <p className="text-[11px] text-danger">Não conforme — registre o sintoma/causa (lápis) ou abra uma corretiva.</p>}

                    {/* Itens da atividade = material previsto da OS com servicoId */}
                    <div className="rounded-lg border border-border/70">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/70 bg-muted/30 rounded-t-lg">
                        <span className="text-xs font-semibold text-foreground">Itens</span>
                        {!fechada && novoItem?.onde !== s.id && <button onClick={() => abrirNovoItem(s.id, s.id)} className="text-xs text-info hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar item</button>}
                      </div>
                      <div className="p-2 space-y-1">
                        {s.materiais.length === 0 && novoItem?.onde !== s.id && <p className="text-[11px] text-muted-foreground px-1">Nenhum item nesta atividade.</p>}
                        {s.materiais.map((m) => (
                          <LinhaItem key={m.id} m={m} editavel={!fechada && m.origem === "PREVISTO"} situacao={situacaoReserva(m.itemId, o.requisicoes)}
                            onQtd={(q) => patchMaterial(m.id, { quantidade: q })} onRemover={() => removerMaterial(m.id)} />
                        ))}
                        {formNovoItem(s.id, false)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Apontamentos (mão de obra) ───────────────────────────────────── */}
        {aba === "apontamentos" && (
          <Secao titulo={`Apontamentos · ${fmtHoras(totalHoras)}`} acao={!fechada && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56"><ComboboxWithCreate value={quem} onChange={setQuem} options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Quem vai executar…" /></div>
              <Button size="sm" disabled={!quem} onClick={async () => { if (await apontar({ acao: "iniciar", colaboradorId: quem })) setQuem(""); }} className="gap-1"><Play className="w-3.5 h-3.5" /> Iniciar</Button>
              <Button size="sm" variant="outline" onClick={() => { setErroAcao(""); setManual({ colaboradorId: quem, inicio: "", fim: "", observacao: "" }); }}>Lançar horas</Button>
            </div>
          )}>
            {o.apontamentos.length === 0 ? <Vazio t="Nenhum apontamento." /> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Executante</th><th className="text-left py-1">Início</th><th className="text-left py-1">Fim</th><th className="text-right py-1">Horas</th><th /></tr></thead>
                <tbody>{o.apontamentos.map((a) => (
                  <tr key={a.id} className="border-t border-border/60">
                    <td className="py-1.5"><span className="inline-flex items-center gap-2"><AvatarUsuario nome={a.nome} size="sm" />{a.nome}</span>{!a.colaboradorId && <span className="ml-1 text-[10px] text-muted-foreground">(Engeman)</span>}{a.observacao && <div className="text-[11px] text-muted-foreground">{a.observacao}</div>}</td>
                    <td className="py-1.5 text-xs">{fmtDataHora(a.inicio)}</td>
                    <td className="py-1.5 text-xs">{a.fim ? fmtDataHora(a.fim) : <span className="text-warning font-medium">em andamento</span>}</td>
                    <td className="py-1.5 text-right text-xs">{fmtHoras(horas(a, agora))}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {!fechada && !a.fim && <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => apontar({ acao: "parar", apontamentoId: a.id })}><Square className="w-3 h-3" /> Parar</Button>}
                      {!fechada && <button className="ml-2 text-muted-foreground hover:text-danger" onClick={() => removerApont(a.id)} title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {abertos.length > 0 && <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Pause className="w-3 h-3" /> Pare os cronômetros antes de encerrar a OS.</p>}
          </Secao>
        )}

        {/* ── Itens: todos os materiais da OS ───────────────────────────────── */}
        {aba === "itens" && (
          <Secao titulo="Itens da OS" acao={!fechada && (
            <div className="flex flex-wrap items-center gap-2">
              {novoItem?.onde !== "aba-itens" && <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirNovoItem("aba-itens", null)}><Plus className="w-3.5 h-3.5" /> Adicionar item</Button>}
              <Link href={requisitarHref}><Button size="sm" className="gap-1"><Package className="w-3.5 h-3.5" /> Requisitar itens</Button></Link>
            </div>
          )}>
            <div className="space-y-3">
              {formNovoItem("aba-itens", true)}
              {o.materiais.length === 0 && o.requisicoes.length === 0 && novoItem?.onde !== "aba-itens" && (
                <Vazio t="Nenhum item. Adicione o que vai ser usado (na OS ou dentro de cada atividade) e use “Requisitar itens” — a requisição sai do almoxarifado vinculada a esta OS, já com estas linhas." />
              )}
              {o.materiais.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr>
                    <th className="text-left py-1">Item</th><th className="text-left py-1">Atividade</th><th className="text-right py-1">Qtd</th><th className="text-left py-1 pl-3">Situação</th><th className="text-right py-1">Valor</th><th className="w-8" />
                  </tr></thead>
                  <tbody>{o.materiais.map((m) => {
                    const editavel = !fechada && m.origem === "PREVISTO";
                    const atv = m.servicoId ? o.servicos.find((s) => s.id === m.servicoId) : null;
                    const sit = m.origem === "PREVISTO" ? situacaoReserva(m.itemId, o.requisicoes) : null;
                    return (
                      <tr key={m.id} className="border-t border-border/60 align-middle">
                        <td className="py-1.5">{m.item?.codigo && <span className="text-xs text-muted-foreground mr-1">{m.item.codigo}</span>}{m.descricao}</td>
                        <td className="py-1.5 text-xs">
                          {editavel ? (
                            <SelectMenu value={m.servicoId ?? ""} onChange={(v) => patchMaterial(m.id, { servicoId: v || null })} className="w-48" triggerClassName="h-7 text-xs"
                              options={[{ value: "", label: "OS (sem atividade)" }, ...o.servicos.map((s) => ({ value: s.id, label: `${numAtv(s.seq)} ${s.descricao}` }))]} />
                          ) : atv ? `${numAtv(atv.seq)} ${atv.descricao}` : <span className="text-muted-foreground">{m.origem === "LEGADO" ? "histórico Engeman" : "OS"}</span>}
                        </td>
                        <td className="py-1.5 text-right">
                          {editavel ? (
                            <Input key={m.quantidade} defaultValue={String(Number(m.quantidade))} inputMode="decimal" className="h-7 w-20 text-xs text-right ml-auto" title="Quantidade prevista — Enter ou sair do campo salva"
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v && Number(v.replace(",", ".")) !== Number(m.quantidade)) patchMaterial(m.id, { quantidade: v }); }} />
                          ) : <span className="text-xs">{Number(m.quantidade)}{m.unidade ? ` ${m.unidade}` : ""}</span>}
                        </td>
                        <td className="py-1.5 pl-3">{sit ? <SeloReserva s={sit} /> : <span className="text-[11px] text-muted-foreground">—</span>}</td>
                        <td className="py-1.5 text-right text-xs">{m.origem === "LEGADO" ? brl(m.valorTotal) : "—"}</td>
                        <td className="py-1.5 text-right">{editavel && <button className="text-muted-foreground hover:text-danger" title="Remover item" onClick={() => removerMaterial(m.id)}><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
              {o.requisicoes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requisições vinculadas</div>
                  {o.requisicoes.map((r) => (
                    <div key={r.id} className="border border-border/60 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 text-xs"><Link href={`/suprimentos/requisicoes-materiais/${r.id}`} className="font-medium text-info hover:underline">{r.numero}</Link><span className="text-muted-foreground">{r.tipo === "DEVOLUCAO" ? "devolução" : "requisição"} · {fmtData(r.data)} · {r.status.toLowerCase()}</span></div>
                      <ul className="mt-1 text-xs text-muted-foreground">{r.itens.map((i, k) => <li key={k}>{Number(i.quantidade)} × {i.item.codigo} {i.item.descricao}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Reserva pendente = item previsto ainda sem requisição. Requisitado = há requisição em aberto com o item. Atendido = o almoxarifado já entregou (entra no custo de material).</p>
            </div>
          </Secao>
        )}

        {/* ── Custos ───────────────────────────────────────────────────────── */}
        {aba === "custos" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile l="Mão de obra" v={brl(o.custoMaoObra)} sub={fmtHoras(totalHoras)} />
              <Tile l="Material" v={brl(o.custoMaterial)} sub={`${o.requisicoes.filter((r) => r.status === "ATENDIDA").length} requisição(ões) atendida(s)`} />
              <Tile l="Terceiros" v={brl(o.custoTerceiros)} sub={`${o.terceiros.length} serviço(s)`} />
              <Tile l="Total" v={brl(custoTotal)} forte />
            </div>
            <p className="text-[11px] text-muted-foreground">Mão de obra = horas apontadas × custo-hora da equipe. Material = requisições atendidas vinculadas (CMPM). Recalculado ao concluir.</p>
            <Secao titulo="Serviços de terceiros" acao={!fechada && <Button size="sm" variant="outline" className="gap-1" onClick={abrirTerceiro}><Plus className="w-3.5 h-3.5" /> Lançar terceiro</Button>}>
              {o.terceiros.length === 0 ? <Vazio t="Nenhum serviço externo." /> : (
                <table className="w-full text-sm"><tbody>{o.terceiros.map((t) => (
                  <tr key={t.id} className="border-t border-border/60 first:border-t-0">
                    <td className="py-1.5">{t.descricao}<div className="text-[11px] text-muted-foreground">{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "fornecedor não informado"}</div></td>
                    <td className="py-1.5 text-right text-xs">{brl(t.valor)}</td>
                    <td className="py-1.5 w-8 text-right">{!fechada && <button className="text-muted-foreground hover:text-danger" onClick={() => removerTerceiro(t.id)}><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}</tbody></table>
              )}
            </Secao>
            {o.concluidaEm && <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Concluída por {o.concluidaPor ?? "—"} em {fmtDataHora(o.concluidaEm)}</p>}
          </div>
        )}

        {/* ── Histórico: eventos + falha registrada ─────────────────────────── */}
        {aba === "historico" && (
          <div className="space-y-3">
            {servicosExec.some((s) => s.sintoma || s.causa) && (
              <Secao titulo="Falha registrada">
                <ul className="text-xs space-y-1">
                  {o.servicos.filter((s) => s.sintoma || s.causa).map((s) => (
                    <li key={s.id}><b>{s.descricao}</b> — sintoma: {s.sintoma?.descricao ?? "—"} · causa: {s.causa?.descricao ?? "—"}</li>
                  ))}
                </ul>
              </Secao>
            )}
            <Secao titulo="Linha do tempo">
              <ol className="relative border-l border-border ml-2 space-y-3">
                {o.eventos.map((e) => (
                  <li key={e.id} className="ml-4">
                    <span className={cn("absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full", COR_STATUS_BARRA[STATUS_EVENTO_TELA[e.tipo] ?? ""] ?? "bg-muted-foreground/50")} />
                    <div className="text-xs"><b className="text-foreground">{EVENTO_LABEL[e.tipo] ?? e.tipo}</b>{e.usuario && <span className="text-muted-foreground"> · {e.usuario}</span>}<span className="text-muted-foreground"> · {fmtDataHora(e.createdAt)}</span></div>
                    {e.detalhe && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{e.detalhe}</div>}
                  </li>
                ))}
                {o.eventos.length === 0 && <li className="ml-4 text-xs text-muted-foreground">Sem eventos (OS do histórico do Engeman).</li>}
              </ol>
            </Secao>
          </div>
        )}
      </div>

      <EnviarOsWhatsappDialog osId={whats ? o.id : null} onFechar={() => setWhats(false)} colaboradores={lk.colaboradores} onEnviado={carregar} />

      {/* Dialog: ação de status (motivo / escolha da espera / fim da parada / programação) */}
      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{dlg ? (dlg.acoes.length > 1 ? "Colocar em espera" : ACAO[dlg.acao].label) : ""}</DialogTitle></DialogHeader>
          {dlg && <div className="space-y-3">
            {dlg.acoes.length > 1 && (
              <div>
                <Label>Por quê?</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {dlg.acoes.map((a) => (
                    <button key={a} type="button" onClick={() => setDlg({ ...dlg, acao: a })}
                      className={cn("text-xs px-2.5 py-1 rounded-full border", dlg.acao === a ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-border text-muted-foreground hover:bg-muted")}>
                      {ACAO[a].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {dlg.acao === "planejar" && <div><Label>Programar para</Label><DataHora value={progr} onChange={setProgr} /></div>}
            {dlg.acao === "encerrar" && o.paradaInicio && !o.paradaFim && <div><Label>O ativo voltou a funcionar em</Label><DataHora value={fimParada} onChange={setFimParada} /><p className="text-[11px] text-muted-foreground mt-1">Parado desde {fmtDataHora(o.paradaInicio)}.</p></div>}
            {ACAO[dlg.acao].motivo && <div><Label>Motivo</Label><Textarea rows={3} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>}
            {erroAcao && <p className="text-sm text-danger whitespace-pre-line">{erroAcao}</p>}
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Voltar</Button>
            <Button onClick={() => dlg && executar(dlg.acao)} disabled={executando || (!!dlg && !!ACAO[dlg.acao].motivo && !motivo.trim())} variant={dlg && ACAO[dlg.acao].variant === "destructive" ? "destructive" : "default"}>{executando ? "Salvando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar OS */}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar {o.numero}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ativo</Label><AtivoCombobox ativos={lk.ativos} value={String(f.ativoId ?? "")} onChange={(v) => setF({ ...f, ativoId: v })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Categoria (tipo)</Label><SelectMenu value={String(f.tipoId ?? "")} onChange={(v) => setF({ ...f, tipoId: v })} options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
              <div><Label>Prioridade</Label><SelectMenu value={String(f.prioridade ?? "")} onChange={(v) => setF({ ...f, prioridade: v })} options={OPCOES_PRIORIDADE} /></div>
            </div>
            <div><Label>Descrição</Label><Textarea rows={3} value={String(f.descricao ?? "")} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Grupo executante</Label><SelectMenu value={String(f.equipeId ?? "")} onChange={(v) => setF({ ...f, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
              <div><Label>Responsável</Label><ComboboxWithCreate value={String(f.responsavelId ?? "")} onChange={(v) => setF({ ...f, responsavelId: v })} allowNone options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="—" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Programada para</Label><DataHora value={String(f.programadaPara ?? "")} onChange={(v) => setF({ ...f, programadaPara: v })} /></div>
              <div><Label>Data de vencimento</Label><DataHora value={String(f.prazo ?? "")} onChange={(v) => setF({ ...f, prazo: v })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Parada — início</Label><DataHora value={String(f.paradaInicio ?? "")} onChange={(v) => setF({ ...f, paradaInicio: v })} /></div>
              <div><Label>Parada — fim (voltou a funcionar)</Label><DataHora value={String(f.paradaFim ?? "")} onChange={(v) => setF({ ...f, paradaFim: v })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Horas estimadas</Label><Input inputMode="decimal" value={String(f.horasEstimadas ?? "")} onChange={(e) => setF({ ...f, horasEstimadas: e.target.value })} /></div>
              <div><Label>Leitura do medidor na execução</Label><Input inputMode="decimal" value={String(f.leituraMedidor ?? "")} onChange={(e) => setF({ ...f, leituraMedidor: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={!!f.exigeParada} onChange={(e) => setF({ ...f, exigeParada: e.target.checked })} /> Serviço exige parar o ativo</label>
            <div><Label>Observação técnica</Label><Textarea rows={2} value={String(f.observacaoTecnica ?? "")} onChange={(e) => setF({ ...f, observacaoTecnica: e.target.value })} /></div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(false)}>Cancelar</Button><Button onClick={salvarEdit} disabled={executando}>{executando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: atividade (serviço / falha) */}
      <Dialog open={!!sv} onOpenChange={(v) => !v && setSv(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{sv?.linhaId ? "Editar atividade" : "Nova atividade"}</DialogTitle></DialogHeader>
          {sv && <div className="space-y-3">
            {!sv.checklist && <div><Label>Serviço (catálogo)</Label><ComboboxWithCreate value={String(sv.servicoId)} onChange={(v) => { const d = lk.servicos.find((x) => x.id === v)?.descricao; setSv({ ...sv, servicoId: v, descricao: sv.descricao || d || "" }); }} allowNone options={lk.servicos.map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" /></div>}
            <div><Label>{sv.checklist ? "Item do checklist" : "O que fazer / o que foi feito"}</Label><Textarea rows={2} value={String(sv.descricao)} onChange={(e) => setSv({ ...sv, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Sintoma (defeito)</Label><ComboboxWithCreate value={String(sv.sintomaId)} onChange={(v) => setSv({ ...sv, sintomaId: v })} allowNone options={lk.sintomas.map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" /></div>
              <div><Label>Causa</Label><ComboboxWithCreate value={String(sv.causaId)} onChange={(v) => setSv({ ...sv, causaId: v })} allowNone options={lk.causas.map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><Label>Tempo (h)</Label><Input inputMode="decimal" value={String(sv.tempoHoras)} onChange={(e) => setSv({ ...sv, tempoHoras: e.target.value })} /></div>
              {!sv.checklist && <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="rounded" checked={!!sv.executado} onChange={(e) => setSv({ ...sv, executado: e.target.checked })} /> Executado</label>}
            </div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSv(null)}>Cancelar</Button><Button onClick={salvarServico} disabled={executando}>{executando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: lançar horas */}
      <Dialog open={!!manual} onOpenChange={(v) => !v && setManual(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Lançar horas</DialogTitle></DialogHeader>
          {manual && <div className="space-y-3">
            <div><Label>Executante</Label><ComboboxWithCreate value={manual.colaboradorId} onChange={(v) => setManual({ ...manual, colaboradorId: v })} options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Escolha…" /></div>
            <div><Label>Início</Label><DataHora value={manual.inicio} onChange={(v) => setManual({ ...manual, inicio: v })} /></div>
            <div><Label>Fim</Label><DataHora value={manual.fim} onChange={(v) => setManual({ ...manual, fim: v })} /></div>
            <div><Label>Observação</Label><Input value={manual.observacao} onChange={(e) => setManual({ ...manual, observacao: e.target.value })} /></div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setManual(null)}>Cancelar</Button><Button onClick={async () => { if (manual && await apontar({ acao: "manual", ...manual })) setManual(null); }}>Lançar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: terceiro */}
      <Dialog open={!!terc} onOpenChange={(v) => !v && setTerc(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Serviço de terceiro</DialogTitle></DialogHeader>
          {terc && <div className="space-y-3">
            <div><Label>Fornecedor</Label><ComboboxWithCreate value={terc.fornecedorId} onChange={(v) => setTerc({ ...terc, fornecedorId: v })} allowNone options={fornecedores.map((x) => ({ value: x.id, label: x.nome }))} placeholder="—" /></div>
            <div><Label>Serviço</Label><Input value={terc.descricao} onChange={(e) => setTerc({ ...terc, descricao: e.target.value })} placeholder="Rebobinagem do motor, usinagem do eixo…" /></div>
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={terc.valor} onChange={(e) => setTerc({ ...terc, valor: e.target.value })} /></div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setTerc(null)}>Cancelar</Button><Button onClick={salvarTerceiro} disabled={executando}>{executando ? "Salvando…" : "Adicionar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Status de espera de cada ação (não oferece a espera em que a OS já está). */
const STATUS_DE_ESPERA: Record<string, string> = { pausar: "PAUSADA", aguardar_material: "AGUARDANDO_MATERIAL", aguardar_terceiro: "AGUARDANDO_TERCEIRO" };
/** Evento → status (cor do marcador na linha do tempo). */
const STATUS_EVENTO_TELA: Record<string, string> = {
  CRIADA: "ABERTA", PLANEJAR: "PLANEJADA", INICIAR: "EM_EXECUCAO", PAUSAR: "PAUSADA", AGUARDAR_MATERIAL: "AGUARDANDO_MATERIAL", AGUARDAR_TERCEIRO: "AGUARDANDO_TERCEIRO",
  RETOMAR: "EM_EXECUCAO", ENCERRAR: "ENCERRADA", CONCLUIR: "CONCLUIDA", DEVOLVER: "EM_EXECUCAO", REABRIR: "EM_EXECUCAO", CANCELAR: "CANCELADA",
};
/** Número da atividade no padrão "010, 020…". */
const numAtv = (seq: number) => String(seq * 10).padStart(3, "0");

/**
 * Barra de linha do tempo: quanto a OS passou em cada status (proporcional),
 * com o vencimento marcado (vermelho se atrasada) e a legenda no (i).
 */
function LinhaTempoStatus({ o, agora, prazoAtrasado }: { o: OSDet; agora: number; prazoAtrasado: boolean }) {
  const [legenda, setLegenda] = useState(false);
  const segs = segmentosStatus(o.eventos, o.createdAt, o.status, !!o.planoId, agora);
  if (!segs.length) return null;
  const ini = segs[0].inicio;
  const fimReal = segs[segs.length - 1].fim;
  const prazo = o.prazo ? new Date(o.prazo).getTime() : null;
  const fimEscala = Math.max(fimReal, prazo ?? 0, ini + 60_000);
  const total = fimEscala - ini;
  const pct = (t: number) => ((t - ini) / total) * 100;
  // tempo acumulado por status (legenda)
  const porStatus = new Map<string, number>();
  for (const s of segs) porStatus.set(s.status, (porStatus.get(s.status) ?? 0) + (s.fim - s.inicio));
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 h-3 rounded-full bg-muted">
          {segs.map((s, i) => {
            const largura = Math.max(pct(s.fim) - pct(s.inicio), 0.6);
            return (
              <div key={i} className={cn("absolute top-0 h-full first:rounded-l-full", COR_STATUS_BARRA[s.status] ?? "bg-muted-foreground/40", i === segs.length - 1 && fimReal >= fimEscala && "rounded-r-full")}
                style={{ left: `${pct(s.inicio)}%`, width: `${largura}%` }}
                title={`${STATUS_LABEL_CURTO[s.status] ?? s.status}: ${fmtDuracao(s.fim - s.inicio)}\n${fmtDataHora(new Date(s.inicio).toISOString())} → ${["CONCLUIDA", "CANCELADA"].includes(s.status) ? "fim" : fmtDataHora(new Date(s.fim).toISOString())}`} />
            );
          })}
          {prazo != null && (
            <div className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `calc(${pct(prazo)}% - 1px)` }} title={`Vencimento: ${fmtDataHora(o.prazo)}${prazoAtrasado ? " (atrasada)" : ""}`}>
              <div className={cn("w-full h-full rounded", prazoAtrasado ? "bg-danger" : "bg-foreground/60")} />
            </div>
          )}
        </div>
        <button type="button" onClick={() => setLegenda((v) => !v)} className={cn("p-1 rounded-md hover:bg-muted", legenda ? "text-info" : "text-muted-foreground")} title="Legenda" aria-label="Legenda da linha do tempo"><Info className="w-4 h-4" /></button>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
        <span>{fmtDataHora(new Date(ini).toISOString())}</span>
        {prazo != null && <span className={cn(prazoAtrasado && "text-danger font-medium")}>vencimento {fmtData(o.prazo)}{prazoAtrasado && " · atrasada"}</span>}
        <span>{["CONCLUIDA", "CANCELADA"].includes(o.status) ? fmtDataHora(new Date(fimReal).toISOString()) : "agora"}</span>
      </div>
      {legenda && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border border-border rounded-lg px-3 py-2">
          {Array.from(porStatus).map(([st, ms]) => (
            <span key={st} className="inline-flex items-center gap-1.5"><span className={cn("w-2.5 h-2.5 rounded-sm", COR_STATUS_BARRA[st])} />{STATUS_LABEL_CURTO[st] ?? st}{!["CONCLUIDA", "CANCELADA"].includes(st) && `: ${fmtDuracao(ms)}`}</span>
          ))}
          {prazo != null && <span className="inline-flex items-center gap-1.5"><span className={cn("w-0.5 h-3", prazoAtrasado ? "bg-danger" : "bg-foreground/60")} />Data de vencimento</span>}
        </div>
      )}
    </div>
  );
}

function SeloReserva({ s }: { s: SituacaoReserva }) {
  const v = SELO_RESERVA[s];
  return <span className={cn("inline-flex items-center text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap", v.cls)}>{v.label}</span>;
}

/** Linha de item dentro do cartão da atividade. */
function LinhaItem({ m, editavel, situacao, onQtd, onRemover }: {
  m: MaterialAtv; editavel: boolean; situacao: SituacaoReserva | null; onQtd: (q: string) => void; onRemover: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm px-1 py-0.5">
      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 min-w-0 truncate" title={m.descricao}>{m.item?.codigo && <span className="text-xs text-muted-foreground mr-1">{m.item.codigo}</span>}{m.descricao}</span>
      {editavel ? (
        <Input key={m.quantidade} defaultValue={String(Number(m.quantidade))} inputMode="decimal" className="h-7 w-20 text-xs text-right" title="Quantidade — Enter ou sair do campo salva"
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && Number(v.replace(",", ".")) !== Number(m.quantidade)) onQtd(v); }} />
      ) : <span className="text-xs tabular-nums">{Number(m.quantidade)}</span>}
      <span className="text-[11px] text-muted-foreground w-8">{m.unidade ?? ""}</span>
      {situacao && <SeloReserva s={situacao} />}
      {editavel && <button className="text-muted-foreground hover:text-danger" title="Remover item" onClick={onRemover}><Trash2 className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

function CampoG({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground text-xs sm:pt-1.5">{l}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
function Tile({ l, v, sub, forte }: { l: string; v: string; sub?: string; forte?: boolean }) {
  return (
    <div className={cn("bg-card border rounded-xl p-3", forte ? "border-info/40" : "border-border")}>
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className={cn("text-lg tabular-nums", forte ? "font-bold text-foreground" : "font-semibold text-foreground")}>{v}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h3 className="text-sm font-semibold text-foreground">{titulo}</h3>{acao}</div>
      {children}
    </div>
  );
}
function Vazio({ t }: { t: string }) {
  return <p className="text-xs text-muted-foreground">{t}</p>;
}
