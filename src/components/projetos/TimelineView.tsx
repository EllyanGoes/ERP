"use client";

// Cronograma (Gantt leve, estilo Notion): tabela de propriedades à esquerda
// (opcional) + barras dataInicio→prazo. Edição direta: arrastar a barra move
// as duas datas; arrastar as bordas muda início/entrega; clicar num dia da
// linha de uma tarefa sem datas cria o prazo. Dependências: setas entre
// barras, criadas arrastando o conector da predecessora até a sucessora.
import { useEffect, useRef, useState } from "react";
import { Settings2, X, Eye, EyeOff, GripVertical, ArrowLeft, Search, Link2, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";
import EscClose from "@/components/shared/EscClose";
import { AvatarUsuario, EtiquetaChip, PrioridadeBadge } from "./comum";
import { TarefaResumoDTO, ColunaDTO, ProjetoBoardDTO, diaPrazo, instantePrazo } from "./tipos";

// ── Propriedades ────────────────────────────────────────────────────────────
// "nome" é fixa em ambos os lugares; as demais ligam/desligam e reordenam no
// painel de visibilidade (tabela à esquerda e/ou dentro da barra), por usuário.
type Prop = "responsavel" | "status" | "inicio" | "entrega" | "duracao" | "prioridade" | "etiquetas" | "progresso";
const PROPS: { key: Prop; label: string; largura: number }[] = [
  { key: "responsavel", label: "Responsável", largura: 160 },
  { key: "status",      label: "Status", largura: 120 },
  { key: "inicio",      label: "Data de início", largura: 96 },
  { key: "entrega",     label: "Data de entrega", largura: 110 },
  { key: "duracao",     label: "Duração", largura: 80 },
  { key: "prioridade",  label: "Prioridade", largura: 90 },
  { key: "etiquetas",   label: "Etiquetas", largura: 160 },
  { key: "progresso",   label: "Progresso (checklist)", largura: 110 },
];
type ItemProp = { key: Prop; visivel: boolean };
type ConfigProps = { tabela: { mostrar: boolean; props: ItemProp[] }; barra: { props: ItemProp[] } };
const CONFIG_PADRAO: ConfigProps = {
  tabela: { mostrar: true, props: PROPS.map((p) => ({ key: p.key, visivel: p.key === "responsavel" })) },
  barra: { props: PROPS.map((p) => ({ key: p.key, visivel: false })) },
};
// Completa a lista salva com propriedades novas (entram no fim, ocultas).
function normalizar(lista: ItemProp[] | undefined): ItemProp[] {
  const salva = (lista ?? []).filter((c) => PROPS.some((p) => p.key === c.key));
  return [...salva, ...PROPS.filter((p) => !salva.some((c) => c.key === p.key)).map((p) => ({ key: p.key, visivel: false }))];
}
const fmtDia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtCurto = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// Escalas (estilo Notion): px por dia e quanto "< >" avança (em dias).
type Escala = "dia" | "semana" | "quinzena" | "mes" | "trimestre" | "ano" | "5anos";
const ESCALAS: { key: Escala; label: string; diaPx: number; passo: number }[] = [
  { key: "dia",       label: "Dia",       diaPx: 60,  passo: 1 },
  { key: "semana",    label: "Semana",    diaPx: 36,  passo: 7 },
  { key: "quinzena",  label: "Quinzena",  diaPx: 24,  passo: 14 },
  { key: "mes",       label: "Mês",       diaPx: 14,  passo: 30 },
  { key: "trimestre", label: "Trimestre", diaPx: 6,   passo: 91 },
  { key: "ano",       label: "Ano",       diaPx: 2,   passo: 365 },
  { key: "5anos",     label: "5 anos",    diaPx: 0.6, passo: 365 },
];

const DIA_MS = 86_400_000;
const ALTURA_LINHA = 29;     // 28 + borda
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function somaDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function difDias(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DIA_MS);
}

type Modo = "mover" | "inicio" | "fim";
type Arraste = { id: string; modo: Modo; x0: number; delta: number; moveu: boolean };
type Ligacao = { deId: string; x: number; y: number };

export default function TimelineView({
  tarefas, colunas = [], board, podeEditar = false, podeGerenciar = false, onAbrirTarefa, onRecarregar,
}: {
  tarefas: TarefaResumoDTO[];
  colunas?: ColunaDTO[];
  board?: ProjetoBoardDTO;
  podeEditar?: boolean;
  podeGerenciar?: boolean;
  onAbrirTarefa: (id: string) => void;
  onRecarregar?: () => void;
}) {
  const [escalaKey, setEscalaKey] = usePersistedState<Escala>("projetos:timeline:escala", "mes");
  const escala = ESCALAS.find((e) => e.key === escalaKey) ?? ESCALAS[3];
  const diaPx = escala.diaPx;
  const [showEscalas, setShowEscalas] = useState(false);
  // Barra sob o mouse: a régua do cabeçalho mostra o intervalo dela (Notion).
  const [hoverId, setHoverId] = useState<string | null>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const [arraste, setArraste] = useState<Arraste | null>(null);
  // Datas já soltas e ainda não devolvidas pelo servidor (evita a barra "pular"
  // de volta enquanto o quadro recarrega).
  const [pendentes, setPendentes] = useState<Record<string, { inicio: string; fim: string }>>({});
  useEffect(() => { setPendentes({}); }, [tarefas]);
  const arrasteRef = useRef<Arraste | null>(null);

  // Largura da coluna de nomes: a divisória é arrastável e a medida fica salva
  // por usuário.
  const [larguraNomes, setLarguraNomes] = usePersistedState<number>("projetos:timeline:largura-nomes", 224);
  const divisoriaRef = useRef<{ x0: number; w0: number } | null>(null);
  function arrastarDivisoria(e: React.PointerEvent) {
    const d = divisoriaRef.current;
    if (!d) return;
    setLarguraNomes(Math.max(140, Math.min(640, d.w0 + (e.clientX - d.x0))));
  }

  // Visibilidade das propriedades (tabela e barra), por usuário.
  const [configSalva, setConfig] = usePersistedState<ConfigProps>("projetos:timeline:props-v1", CONFIG_PADRAO);
  const config: ConfigProps = {
    tabela: { mostrar: configSalva.tabela?.mostrar !== false, props: normalizar(configSalva.tabela?.props) },
    barra: { props: normalizar(configSalva.barra?.props) },
  };
  const [painel, setPainel] = useState<null | "props" | "dependencias">(null);
  const [abaProps, setAbaProps] = useState<"barra" | "tabela">("tabela");
  const [buscaProp, setBuscaProp] = useState("");
  const [dragProp, setDragProp] = useState<Prop | null>(null);
  const colunasTabela = config.tabela.mostrar ? config.tabela.props.filter((c) => c.visivel).map((c) => PROPS.find((p) => p.key === c.key)!) : [];
  const propsBarra = config.barra.props.filter((c) => c.visivel).map((c) => c.key);
  const larguraPainel = config.tabela.mostrar ? larguraNomes + colunasTabela.reduce((acc, c) => acc + c.largura, 0) : 0;
  const nomeColuna = (id: string) => colunas.find((c) => c.id === id)?.nome ?? "—";

  function setLista(aba: "barra" | "tabela", props: ItemProp[]) {
    setConfig({ ...config, [aba]: { ...config[aba], props } });
  }
  function alternarProp(aba: "barra" | "tabela", key: Prop) {
    setLista(aba, config[aba].props.map((c) => (c.key === key ? { ...c, visivel: !c.visivel } : c)));
  }
  function soltarProp(aba: "barra" | "tabela", sobre: Prop) {
    if (!dragProp || dragProp === sobre) return;
    const lista = config[aba].props.filter((c) => c.key !== dragProp);
    lista.splice(lista.findIndex((c) => c.key === sobre), 0, config[aba].props.find((c) => c.key === dragProp)!);
    setLista(aba, lista);
    setDragProp(null);
  }

  // Dependências (projeto): config + lista
  const cfgDep = board?.cronograma ?? { dependencias: false, modoDatas: "MARGEM" as const, evitarFds: true };
  const dependencias = board?.dependencias ?? [];
  const [ligacao, setLigacao] = useState<Ligacao | null>(null);
  const linhaHoverRef = useRef<string | null>(null);
  const gradeRef = useRef<HTMLDivElement>(null);
  const [depSelecionada, setDepSelecionada] = useState<{ tarefaId: string; dependeDeId: string } | null>(null);
  const [salvandoCfg, setSalvandoCfg] = useState(false);

  async function salvarCfgDep(parcial: Partial<typeof cfgDep>) {
    if (!board) return;
    setSalvandoCfg(true);
    await fetch(`/api/projetos/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronograma: { ...cfgDep, ...parcial } }),
    }).catch(() => {});
    setSalvandoCfg(false);
    onRecarregar?.();
  }
  async function criarDependencia(tarefaId: string, dependeDeId: string) {
    const res = await fetch(`/api/projetos/tarefas/${tarefaId}/dependencias`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dependeDeId }),
    }).catch(() => null);
    if (res && !res.ok) {
      const j = await res.json().catch(() => ({}));
      window.alert(j.error || "Não foi possível criar a dependência.");
    }
    onRecarregar?.();
  }
  async function removerDependencia(d: { tarefaId: string; dependeDeId: string }) {
    setDepSelecionada(null);
    await fetch(`/api/projetos/tarefas/${d.tarefaId}/dependencias?dependeDeId=${d.dependeDeId}`, { method: "DELETE" }).catch(() => {});
    onRecarregar?.();
  }
  // Soltar a ligação em qualquer lugar: se estiver sobre outra linha, cria.
  useEffect(() => {
    if (!ligacao) return;
    function mover(e: PointerEvent) {
      const g = gradeRef.current?.getBoundingClientRect();
      if (!g) return;
      setLigacao((l) => (l ? { ...l, x: e.clientX - g.left, y: e.clientY - g.top } : l));
    }
    function soltar() {
      const alvo = linhaHoverRef.current;
      const de = ligacao!.deId;
      setLigacao(null);
      if (alvo && alvo !== de) criarDependencia(alvo, de);
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligacao?.deId]);

  const hoje = diaPrazo(iso(new Date()));

  // Com data: barra. Sem data (e ainda aberta): linha vazia, clicável para
  // marcar o prazo. Sem dataInicio assume o próprio prazo (1 dia).
  const linhas = tarefas
    .filter((t) => t.prazo || t.dataInicio || (podeEditar && !t.concluidaEm))
    .map((t) => {
      const p = pendentes[t.id];
      if (p) return { ...t, inicio: diaPrazo(p.inicio), fim: diaPrazo(p.fim), temData: true };
      if (!t.prazo && !t.dataInicio) return { ...t, inicio: hoje, fim: hoje, temData: false };
      const fim = diaPrazo(t.prazo ?? t.dataInicio!);
      const inicio = diaPrazo(t.dataInicio ?? t.prazo!);
      return { ...t, inicio: inicio < fim ? inicio : fim, fim: fim > inicio ? fim : inicio, temData: true };
    });
  type Linha = (typeof linhas)[number];
  const comData = linhas.filter((t) => t.temData);

  // Janela: cobre as tarefas e sempre o entorno de hoje (espaço p/ arrastar).
  const tempos = [...comData.flatMap((t) => [t.inicio.getTime(), t.fim.getTime()]), hoje.getTime()];
  // Margem proporcional à escala (quanto menor o px/dia, mais dias cabem).
  const folga = Math.max(45, Math.round(1200 / diaPx));
  const minData = somaDias(new Date(Math.min(...tempos)), -Math.max(7, Math.round(folga / 3)));
  const maxData = somaDias(new Date(Math.max(...tempos)), folga);
  const totalDias = difDias(maxData, minData) + 1;
  const offHoje = difDias(hoje, minData);

  // Posição da barra considerando o arraste em andamento.
  function intervalo(t: Linha): { inicio: Date; fim: Date } {
    if (!arraste || arraste.id !== t.id) return { inicio: t.inicio, fim: t.fim };
    const d = arraste.delta;
    if (arraste.modo === "mover") return { inicio: somaDias(t.inicio, d), fim: somaDias(t.fim, d) };
    if (arraste.modo === "inicio") {
      const ini = somaDias(t.inicio, d);
      return { inicio: ini > t.fim ? t.fim : ini, fim: t.fim };
    }
    const fim = somaDias(t.fim, d);
    return { inicio: t.inicio, fim: fim < t.inicio ? t.inicio : fim };
  }

  async function gravar(t: Linha, inicio: Date, fim: Date) {
    const umDiaSemInicio = !t.dataInicio && inicio.getTime() === fim.getTime();
    const body = umDiaSemInicio ? { prazo: iso(fim) } : { dataInicio: iso(inicio), prazo: iso(fim) };
    setPendentes((p) => ({ ...p, [t.id]: { inicio: iso(inicio), fim: iso(fim) } }));
    await fetch(`/api/projetos/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    onRecarregar?.();
  }

  function iniciarArraste(e: React.PointerEvent, t: Linha, modo: Modo) {
    if (!podeEditar || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const a = { id: t.id, modo, x0: e.clientX, delta: 0, moveu: false };
    arrasteRef.current = a;
    setArraste(a);
  }
  function moverArraste(e: React.PointerEvent) {
    const a = arrasteRef.current;
    if (!a) return;
    const dx = e.clientX - a.x0;
    const novo = { ...a, delta: Math.round(dx / diaPx), moveu: a.moveu || Math.abs(dx) > 3 };
    arrasteRef.current = novo;
    setArraste(novo);
  }
  function soltarArraste(t: Linha) {
    const a = arrasteRef.current;
    arrasteRef.current = null;
    if (!a) return;
    const { inicio, fim } = intervalo(t);
    setArraste(null);
    if (!a.moveu) { onAbrirTarefa(t.id); return; }
    if (a.delta !== 0 && (inicio.getTime() !== t.inicio.getTime() || fim.getTime() !== t.fim.getTime())) gravar(t, inicio, fim);
  }

  // Tarefa sem datas: o clique num dia da linha marca o prazo ali.
  function marcarDia(e: React.MouseEvent, t: Linha) {
    if (!podeEditar || t.temData) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const dia = somaDias(minData, Math.max(0, Math.min(totalDias - 1, Math.floor(x / diaPx))));
    gravar(t, dia, dia);
  }

  // Lista plana: com datas primeiro (por início), depois as sem datas.
  const ordenadas = [...linhas].sort((a, b) => Number(b.temData) - Number(a.temData) || a.inicio.getTime() - b.inicio.getTime());
  const indice = new Map(ordenadas.map((t, i) => [t.id, i]));

  // Geometria das barras (p/ setas de dependência e conector)
  function geometria(t: Linha) {
    const { inicio, fim } = intervalo(t);
    const off = difDias(inicio, minData);
    const dur = Math.max(1, difDias(fim, inicio) + 1);
    const x0 = off * diaPx;
    const x1 = x0 + Math.max(diaPx, dur * diaPx);
    const y = (indice.get(t.id) ?? 0) * ALTURA_LINHA + 14;
    return { inicio, fim, off, dur, x0, x1, y };
  }
  const porId = new Map(ordenadas.map((t) => [t.id, t]));
  const setas = cfgDep.dependencias
    ? dependencias
        .map((d) => {
          const de = porId.get(d.dependeDeId), para = porId.get(d.tarefaId);
          if (!de || !para || !de.temData || !para.temData) return null;
          const g1 = geometria(de), g2 = geometria(para);
          return { ...d, x1: g1.x1, y1: g1.y, x2: g2.x0, y2: g2.y };
        })
        .filter((s): s is NonNullable<typeof s> => !!s)
    : [];
  function caminhoSeta(x1: number, y1: number, x2: number, y2: number): string {
    // Sai pela direita da predecessora, contorna se a sucessora começa antes.
    const saida = x1 + 8;
    if (x2 >= saida + 8) {
      const meio = (saida + x2) / 2;
      return `M ${x1} ${y1} H ${saida} C ${meio} ${y1}, ${meio} ${y2}, ${x2 - 2} ${y2}`;
    }
    const yMeio = y1 + (y2 > y1 ? ALTURA_LINHA / 2 : -ALTURA_LINHA / 2);
    return `M ${x1} ${y1} H ${saida} Q ${saida + 8} ${y1}, ${saida + 8} ${yMeio} H ${x2 - 16} Q ${x2 - 2} ${yMeio}, ${x2 - 2} ${y2 > yMeio ? yMeio + 2 : yMeio - 2} V ${y2}`;
  }

  // Marcas de mês no cabeçalho
  const meses: { label: string; off: number; dias: number }[] = [];
  const cursor = new Date(minData.getFullYear(), minData.getMonth(), 1);
  while (cursor <= maxData) {
    const inicioMes = cursor < minData ? minData : new Date(cursor);
    const fimMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const fim = fimMes > maxData ? maxData : fimMes;
    meses.push({
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      off: difDias(inicioMes, minData),
      dias: difDias(fim, inicioMes) + 1,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const dias = Array.from({ length: totalDias }, (_, i) => somaDias(minData, i));
  // Anos (cabeçalho das escalas muito pequenas, onde o mês não cabe)
  const anos: { label: string; off: number; dias: number }[] = [];
  if (diaPx < 2) {
    for (let a = minData.getFullYear(); a <= maxData.getFullYear(); a++) {
      const ini = new Date(a, 0, 1) < minData ? minData : new Date(a, 0, 1);
      const fim = new Date(a, 11, 31) > maxData ? maxData : new Date(a, 11, 31);
      anos.push({ label: String(a), off: difDias(ini, minData), dias: difDias(fim, ini) + 1 });
    }
  }

  // "< Hoje >": rola a grade até uma data / um passo da escala.
  function rolarPara(dia: Date) {
    const el = rolagemRef.current;
    if (!el) return;
    const x = larguraPainel + difDias(dia, minData) * diaPx;
    el.scrollTo({ left: Math.max(0, x - larguraPainel - (el.clientWidth - larguraPainel) / 3), behavior: "smooth" });
  }
  function rolarPasso(dir: 1 | -1) {
    rolagemRef.current?.scrollBy({ left: dir * escala.passo * diaPx, behavior: "smooth" });
  }

  // Valor de uma propriedade (célula da tabela ou rótulo na barra).
  function valorProp(t: Linha, key: Prop, modo: "tabela" | "barra"): React.ReactNode {
    const vazio = <span className={modo === "tabela" ? "text-muted-foreground/60" : "opacity-60"}>—</span>;
    switch (key) {
      case "responsavel":
        if (t.membros.length === 0) return modo === "tabela" ? vazio : null;
        return (
          <>
            <span className="flex -space-x-1 shrink-0">{t.membros.slice(0, 3).map((m) => <AvatarUsuario key={m.id} nome={m.nome} size="sm" />)}</span>
            {modo === "tabela" && <span className="truncate" title={t.membros.map((m) => m.nome).join(", ")}>{t.membros.map((m) => m.nome).join(", ")}</span>}
          </>
        );
      case "status": return <span className="truncate">{nomeColuna(t.colunaId)}</span>;
      case "inicio": return t.dataInicio ? <span>{(modo === "tabela" ? fmtDia : fmtCurto)(diaPrazo(t.dataInicio))}</span> : vazio;
      case "entrega": {
        if (!t.prazo) return vazio;
        const atrasada = !t.concluidaEm && instantePrazo(t.prazo, t.prazoHora) < (t.prazoHora ? new Date() : hoje);
        return <span className={cn(atrasada && modo === "tabela" && "text-danger font-semibold")}>{(modo === "tabela" ? fmtDia : fmtCurto)(diaPrazo(t.prazo))}{t.prazoHora ? ` ${t.prazoHora}` : ""}</span>;
      }
      case "duracao": {
        if (!t.temData) return vazio;
        const d = difDias(t.fim, t.inicio) + 1;
        return <span>{d} dia{d !== 1 ? "s" : ""}</span>;
      }
      case "prioridade": return <PrioridadeBadge prioridade={t.prioridade} small />;
      case "etiquetas":
        if (t.etiquetas.length === 0) return modo === "tabela" ? vazio : null;
        return <span className="flex gap-1 overflow-hidden">{t.etiquetas.map((e) => <EtiquetaChip key={e.id} etiqueta={e} small />)}</span>;
      case "progresso": {
        if (t.checklistTotal === 0) return modo === "tabela" ? vazio : null;
        const pct = Math.round((t.checklistFeitos / t.checklistTotal) * 100);
        return (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={cn("h-1.5 w-10 rounded-full overflow-hidden shrink-0", modo === "tabela" ? "bg-muted" : "bg-white/30")}>
              <span className={cn("block h-full", modo === "tabela" ? "bg-success" : "bg-white")} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-[10px]">{pct}%</span>
          </span>
        );
      }
    }
  }

  // ── Painel de propriedades (Notion: Visibilidade da propriedade) ───────────
  function PainelProps() {
    const aba = abaProps;
    const lista = config[aba].props;
    const termo = buscaProp.trim().toLowerCase();
    const filtra = (c: ItemProp) => !termo || PROPS.find((p) => p.key === c.key)!.label.toLowerCase().includes(termo);
    const mostradas = lista.filter((c) => c.visivel && filtra(c));
    const ocultas = lista.filter((c) => !c.visivel && filtra(c));
    const onde = aba === "barra" ? "no cronograma" : "na tabela";
    const Item = ({ c }: { c: ItemProp }) => (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragProp(c.key); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); soltarProp(aba, c.key); }}
        onDragEnd={() => setDragProp(null)}
        className={cn("flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-sm", dragProp === c.key ? "opacity-40" : "hover:bg-muted", !c.visivel && "text-muted-foreground")}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab shrink-0" />
        <span className="flex-1 truncate">{PROPS.find((p) => p.key === c.key)!.label}</span>
        <button
          onClick={() => alternarProp(aba, c.key)}
          className={cn("p-1 rounded-md shrink-0", c.visivel ? "text-foreground hover:bg-muted" : "text-muted-foreground/60 hover:text-foreground hover:bg-muted")}
          title={c.visivel ? "Ocultar" : "Mostrar"}
        >
          {c.visivel ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>
    );
    return (
      <div className="absolute right-0 top-full mt-1.5 z-50 w-80 bg-card border border-border rounded-xl shadow-xl p-2">
        <EscClose onClose={() => setPainel(null)} />
        <div className="flex items-center gap-2 px-1 pt-1 pb-2">
          <button onClick={() => setPainel(null)} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-foreground flex-1">Visibilidade da propriedade</span>
          <button onClick={() => setPainel(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={buscaProp}
            onChange={(e) => setBuscaProp(e.target.value)}
            placeholder="Procurar uma propriedade..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-muted/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 border-b border-border mb-2">
          {(["barra", "tabela"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAbaProps(a)}
              className={cn("px-3 py-1.5 text-sm -mb-px border-b-2", abaProps === a ? "border-foreground text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {a === "barra" ? "Cronograma" : "Tabela"}
            </button>
          ))}
        </div>
        {aba === "tabela" && (
          <label className="flex items-center justify-between px-1.5 py-1.5 text-sm text-foreground cursor-pointer">
            Mostrar tabela
            <button
              role="switch"
              aria-checked={config.tabela.mostrar}
              onClick={() => setConfig({ ...config, tabela: { ...config.tabela, mostrar: !config.tabela.mostrar } })}
              className={cn("w-9 h-5 rounded-full transition-colors relative", config.tabela.mostrar ? "bg-blue-600" : "bg-muted-foreground/30")}
            >
              <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", config.tabela.mostrar ? "left-[18px]" : "left-0.5")} />
            </button>
          </label>
        )}
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between px-1.5 pt-1 pb-1">
            <span className="text-xs font-semibold text-muted-foreground">Mostradas {onde}</span>
            {mostradas.length > 0 && (
              <button onClick={() => setLista(aba, lista.map((c) => ({ ...c, visivel: false })))} className="text-xs text-info hover:underline">Ocultar tudo</button>
            )}
          </div>
          <div className="flex items-center gap-2 px-1.5 py-1.5 text-sm text-muted-foreground">
            <span className="w-3.5 shrink-0" />
            <span className="flex-1">Nome da tarefa</span>
            <span className="p-1 shrink-0 text-muted-foreground/40"><Eye className="w-4 h-4" /></span>
          </div>
          {mostradas.map((c) => <Item key={c.key} c={c} />)}
          <div className="flex items-center justify-between px-1.5 pt-3 pb-1">
            <span className="text-xs font-semibold text-muted-foreground">Ocultas {onde}</span>
            {ocultas.length > 0 && (
              <button onClick={() => setLista(aba, lista.map((c) => ({ ...c, visivel: true })))} className="text-xs text-info hover:underline">Mostrar tudo</button>
            )}
          </div>
          {ocultas.map((c) => <Item key={c.key} c={c} />)}
          {ocultas.length === 0 && <p className="text-xs text-muted-foreground px-1.5 py-1">Nenhuma.</p>}
        </div>
      </div>
    );
  }

  // ── Painel de dependências (Notion) ──────────────────────────────────────
  function PainelDependencias() {
    const modos: { key: typeof cfgDep.modoDatas; label: string }[] = [
      { key: "MARGEM", label: "Margem de consumo" },
      { key: "MANTER", label: "Alterar e manter o espaço de tempo entre os itens" },
      { key: "NAO", label: "Não alterar" },
    ];
    const bloqueado = !podeGerenciar || salvandoCfg;
    return (
      <div className="absolute right-0 top-full mt-1.5 z-50 w-80 bg-card border border-border rounded-xl shadow-xl p-3">
        <EscClose onClose={() => setPainel(null)} />
        <div className="flex items-center gap-2 pb-2">
          <button onClick={() => setPainel(null)} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-foreground flex-1">Dependências</span>
          <button onClick={() => setPainel(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Use as dependências para mostrar as tarefas que estão bloqueando ou sendo bloqueadas por outras. Arraste o conector no fim de uma barra até outra tarefa para ligar.
        </p>
        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Mudança automática de data</p>
        <div className="space-y-1.5 mb-3">
          {modos.map((m) => (
            <button
              key={m.key}
              disabled={bloqueado}
              onClick={() => salvarCfgDep({ modoDatas: m.key })}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-60",
                cfgDep.modoDatas === m.key ? "border-blue-500 ring-1 ring-blue-500/40 text-info font-medium" : "border-border text-foreground hover:bg-muted"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-start justify-between gap-3 mb-3">
          <span>
            <span className="block text-sm text-foreground">Evitar finais de semana</span>
            <span className="block text-xs text-muted-foreground">Tarefas empurradas não começam nem terminam em fim de semana</span>
          </span>
          <button
            role="switch"
            aria-checked={cfgDep.evitarFds}
            disabled={bloqueado}
            onClick={() => salvarCfgDep({ evitarFds: !cfgDep.evitarFds })}
            className={cn("mt-0.5 w-9 h-5 shrink-0 rounded-full transition-colors relative disabled:opacity-60", cfgDep.evitarFds ? "bg-blue-600" : "bg-muted-foreground/30")}
          >
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", cfgDep.evitarFds ? "left-[18px]" : "left-0.5")} />
          </button>
        </label>
        <button
          disabled={bloqueado}
          onClick={() => salvarCfgDep({ dependencias: !cfgDep.dependencias })}
          className={cn("w-full h-9 rounded-lg text-sm font-medium disabled:opacity-60", cfgDep.dependencias ? "border border-border text-foreground hover:bg-muted" : "bg-blue-600 text-white hover:bg-blue-700")}
        >
          {cfgDep.dependencias ? "Desativar dependências" : "Ativar dependências"}
        </button>
        {!podeGerenciar && <p className="text-[11px] text-muted-foreground mt-2">Só dono e administradores do projeto alteram esta configuração.</p>}
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Escala (droplist) + navegação "< Hoje >" */}
        <div className="relative">
          <button
            onClick={() => setShowEscalas((v) => !v)}
            className={cn("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs", showEscalas ? "bg-muted text-foreground" : "text-foreground hover:bg-muted")}
          >
            {escala.label} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {showEscalas && (
            <>
              <div className="fixed inset-0 z-40" onMouseDown={() => setShowEscalas(false)} />
              <div className="absolute left-0 top-full mt-1.5 z-50 w-40 bg-card border border-border rounded-xl shadow-xl p-1.5">
                <EscClose onClose={() => setShowEscalas(false)} />
                {ESCALAS.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => { setEscalaKey(e.key); setShowEscalas(false); }}
                    className={cn("w-full text-left px-2.5 py-1.5 rounded-lg text-sm", escalaKey === e.key ? "bg-muted text-foreground font-medium" : "text-foreground hover:bg-muted")}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="inline-flex items-center rounded-lg border border-border text-xs overflow-hidden">
          <button onClick={() => rolarPasso(-1)} className="px-1.5 py-1.5 text-muted-foreground hover:bg-muted" title={`Voltar 1 ${escala.label.toLowerCase()}`}><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={() => rolarPara(hoje)} className="px-2 py-1.5 text-foreground hover:bg-muted font-medium">Hoje</button>
          <button onClick={() => rolarPasso(1)} className="px-1.5 py-1.5 text-muted-foreground hover:bg-muted" title={`Avançar 1 ${escala.label.toLowerCase()}`}><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
        <span className="text-xs text-muted-foreground">{comData.length} tarefa{comData.length !== 1 ? "s" : ""} com datas</span>
        {podeEditar && (
          <span className="text-xs text-muted-foreground ml-auto hidden xl:inline">
            Arraste a barra para mover · as bordas para mudar início/entrega · clique num dia para datar uma tarefa sem datas
          </span>
        )}
        <div className={cn("relative flex items-center gap-1.5", !podeEditar && "ml-auto")}>
          {painel && <div className="fixed inset-0 z-40" onMouseDown={() => setPainel(null)} />}
          <button
            onClick={() => setPainel(painel === "dependencias" ? null : "dependencias")}
            className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs", painel === "dependencias" ? "bg-muted text-foreground" : cfgDep.dependencias ? "text-info border-info/40 hover:bg-info/10" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            title="Dependências"
          >
            <Link2 className="w-3.5 h-3.5" /> Dependências{cfgDep.dependencias && <Check className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setPainel(painel === "props" ? null : "props")}
            className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs", painel === "props" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            title="Visibilidade da propriedade"
          >
            <Settings2 className="w-3.5 h-3.5" /> Propriedades
          </button>
          {painel === "props" && <PainelProps />}
          {painel === "dependencias" && <PainelDependencias />}
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-16">Nenhuma tarefa com datas — defina início/prazo nos cartões.</p>
      ) : (
      <div ref={rolagemRef} className="border border-border rounded-xl bg-card overflow-x-auto gantt-scroll">
        <div className="relative" style={{ minWidth: larguraPainel + totalDias * diaPx }}>
          {/* Divisória nomes × grade: arraste para alargar a coluna de nomes. */}
          {config.tabela.mostrar && (
            <div
              onPointerDown={(e) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); divisoriaRef.current = { x0: e.clientX, w0: larguraNomes }; }}
              onPointerMove={arrastarDivisoria}
              onPointerUp={() => { divisoriaRef.current = null; }}
              onPointerCancel={() => { divisoriaRef.current = null; }}
              onDoubleClick={() => setLarguraNomes(224)}
              className="absolute top-0 bottom-0 z-20 w-2 -ml-1 cursor-col-resize hover:bg-info/30 active:bg-info/40 touch-none"
              style={{ left: larguraPainel }}
              title="Arraste para ajustar a largura da coluna Tarefa (duplo clique restaura)"
            />
          )}
          {/* Cabeçalho: meses + régua de dias */}
          <div className="flex border-b border-border bg-muted sticky top-0">
            {config.tabela.mostrar && (
              <>
                <div className="shrink-0 px-3 py-1.5 text-xs font-semibold text-muted-foreground border-r border-border/60" style={{ width: larguraNomes }}>Tarefa</div>
                {colunasTabela.map((c, i) => (
                  <div key={c.key} className={cn("shrink-0 px-2 py-1.5 text-xs font-semibold text-muted-foreground truncate", i === colunasTabela.length - 1 ? "border-r border-border" : "border-r border-border/60")} style={{ width: c.largura }}>
                    {c.label}
                  </div>
                ))}
              </>
            )}
            <div className="relative flex-1 overflow-visible" style={{ height: 44 }}>
              {(diaPx < 2 ? anos : meses).map((m, i) => (
                <span
                  key={i}
                  className="absolute top-0 flex items-center px-2 text-xs font-medium text-muted-foreground border-r border-border/60 capitalize overflow-hidden whitespace-nowrap"
                  style={{ left: m.off * diaPx, width: m.dias * diaPx, height: 24 }}
                >
                  {diaPx < 2 || m.dias * diaPx > 40 ? m.label : ""}
                </span>
              ))}
              {/* Pílula com o intervalo da barra sob o mouse (ou arrastada) */}
              {(() => {
                const id = arraste?.id ?? hoverId;
                const t = id ? porId.get(id) : null;
                if (!t || !t.temData) return null;
                const g = geometria(t);
                const w = Math.max(diaPx, g.dur * diaPx);
                const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
                const umDia = g.inicio.getTime() === g.fim.getTime();
                return (
                  <span
                    className="absolute flex items-center justify-between gap-5 rounded-full bg-muted-foreground/15 text-xs text-foreground px-3 whitespace-nowrap pointer-events-none z-20"
                    style={{ left: g.x0 - 6, minWidth: w + 12, height: 24, top: 20 }}
                  >
                    <span>{fmt(g.inicio)}</span>
                    {!umDia && <span>{fmt(g.fim)}</span>}
                  </span>
                );
              })()}
              {/* Hoje: dia em círculo vermelho no topo da linha (Notion) */}
              {offHoje >= 0 && offHoje <= totalDias && (
                <span
                  className="absolute z-10 w-6 h-6 -ml-3 rounded-full bg-danger text-white text-[11px] font-semibold inline-flex items-center justify-center"
                  style={{ left: offHoje * diaPx + diaPx / 2, top: 20 }}
                >
                  {hoje.getDate()}
                </span>
              )}
              {offHoje >= 0 && offHoje <= totalDias && (
                <span className="absolute z-10 w-2.5 h-2.5 -ml-[5px] rounded-full bg-danger" style={{ left: offHoje * diaPx + diaPx / 2, bottom: -5 }} />
              )}
              {dias.map((d, i) => {
                // Régua de dias: todos os dias nas escalas largas, só as segundas
                // nas médias, nada nas pequenas (não cabe).
                const ehHoje = i === offHoje;
                // Hoje já aparece no círculo vermelho.
                const mostra = !ehHoje && (diaPx >= 24 || (diaPx >= 6 && d.getDay() === 1));
                if (!mostra) return null;
                return (
                  <span
                    key={i}
                    className={cn(
                      "absolute text-[10px] text-center",
                      ehHoje ? "text-danger font-semibold" : d.getDay() === 0 || d.getDay() === 6 ? "text-muted-foreground/50" : "text-muted-foreground"
                    )}
                    style={{ left: i * diaPx, width: diaPx >= 24 ? diaPx : Math.max(diaPx * 2, 16), top: 26 }}
                  >
                    {d.getDate()}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Linhas + camada das setas (SVG por cima da grade) */}
          <div className="relative">
            <div ref={gradeRef} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: larguraPainel, right: 0 }}>
              <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ zIndex: 5 }}>
                <defs>
                  <marker id="seta-dep" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 8 4 L 0 8 z" className="fill-amber-500" />
                  </marker>
                </defs>
                {setas.map((s) => {
                  const sel = depSelecionada?.tarefaId === s.tarefaId && depSelecionada?.dependeDeId === s.dependeDeId;
                  return (
                    <g key={`${s.dependeDeId}>${s.tarefaId}`}>
                      <path d={caminhoSeta(s.x1, s.y1, s.x2, s.y2)} fill="none" strokeWidth={12} stroke="transparent" className={cn("pointer-events-auto", podeEditar && "cursor-pointer")} onClick={() => podeEditar && setDepSelecionada(sel ? null : { tarefaId: s.tarefaId, dependeDeId: s.dependeDeId })} />
                      <path d={caminhoSeta(s.x1, s.y1, s.x2, s.y2)} fill="none" strokeWidth={sel ? 3 : 2} strokeLinecap="round" className={sel ? "stroke-amber-600" : "stroke-amber-500"} markerEnd="url(#seta-dep)" />
                    </g>
                  );
                })}
                {ligacao && (() => {
                  const de = porId.get(ligacao.deId);
                  if (!de) return null;
                  const g = geometria(de);
                  return <path d={`M ${g.x1} ${g.y} L ${ligacao.x} ${ligacao.y}`} fill="none" strokeWidth={1.5} strokeDasharray="4 3" className="stroke-amber-500" />;
                })()}
              </svg>
              {depSelecionada && (() => {
                const s = setas.find((x) => x.tarefaId === depSelecionada.tarefaId && x.dependeDeId === depSelecionada.dependeDeId);
                if (!s) return null;
                return (
                  <button
                    onClick={() => removerDependencia(depSelecionada)}
                    className="absolute z-10 pointer-events-auto px-2 py-1 rounded-md bg-foreground text-background text-[11px] shadow whitespace-nowrap"
                    style={{ left: (s.x1 + s.x2) / 2, top: (s.y1 + s.y2) / 2 - 24 }}
                  >
                    Remover dependência ×
                  </button>
                );
              })()}
            </div>

            {ordenadas.map((t) => {
              const { inicio, fim, off, dur } = geometria(t);
              // Atrasada: prazo (com hora, se houver) já passou e não concluiu.
              const atrasada = !t.concluidaEm && (t.prazoHora ? instantePrazo(iso(fim), t.prazoHora) < new Date() : fim < hoje);
              const arrastando = arraste?.id === t.id && arraste.moveu;
              const larguraBarra = Math.max(diaPx, dur * diaPx);
              // Rótulo (Notion): começa dentro da barra e continua para fora em
              // cinza — a camada de trás é o rótulo inteiro em cinza, a barra
              // (opaca) cobre o trecho inicial e mostra o mesmo texto escuro.
              const Rotulo = ({ apagado }: { apagado?: boolean }) => (
                <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", apagado ? "text-muted-foreground" : t.concluidaEm ? "text-muted-foreground" : atrasada ? "text-danger" : "text-foreground")}>
                  <span className={cn(t.concluidaEm && "line-through")}>{t.titulo}</span>
                  {propsBarra.map((k) => <span key={k} className="inline-flex items-center gap-1">{valorProp(t, k, "barra")}</span>)}
                </span>
              );
              return (
                <div
                  key={t.id}
                  className={cn("flex border-b border-border/40 hover:bg-muted/40", ligacao && ligacao.deId !== t.id && "hover:bg-amber-500/10")}
                  onPointerEnter={() => { linhaHoverRef.current = t.id; }}
                  onPointerLeave={() => { if (linhaHoverRef.current === t.id) linhaHoverRef.current = null; }}
                >
                  {config.tabela.mostrar && (
                    <>
                      <div className={cn("shrink-0 px-3 py-1.5 text-xs truncate border-r border-border/60 cursor-pointer", t.concluidaEm ? "text-muted-foreground line-through" : "text-foreground")} style={{ width: larguraNomes }} onClick={() => onAbrirTarefa(t.id)} title={t.titulo}>
                        {t.titulo}
                      </div>
                      {colunasTabela.map((c, i) => (
                        <div
                          key={c.key}
                          className={cn("shrink-0 px-2 flex items-center gap-1.5 text-xs text-foreground overflow-hidden cursor-pointer", i === colunasTabela.length - 1 ? "border-r border-border" : "border-r border-border/60")}
                          style={{ width: c.largura, height: 28 }}
                          onClick={() => onAbrirTarefa(t.id)}
                        >
                          {valorProp(t, c.key, "tabela")}
                        </div>
                      ))}
                    </>
                  )}
                  <div
                    className={cn("relative flex-1", podeEditar && !t.temData && "cursor-copy")}
                    // Linhas verticais dos dias (Notion); nas escalas pequenas, por semana.
                    style={{
                      height: 28,
                      backgroundImage: diaPx >= 6
                        ? `repeating-linear-gradient(to right, hsl(var(--border) / 0.5) 0, hsl(var(--border) / 0.5) 1px, transparent 1px, transparent ${diaPx}px)`
                        : `repeating-linear-gradient(to right, hsl(var(--border) / 0.5) 0, hsl(var(--border) / 0.5) 1px, transparent 1px, transparent ${diaPx * 7}px)`,
                      backgroundPosition: diaPx >= 6 ? "0 0" : `${((1 - minData.getDay() + 7) % 7) * diaPx}px 0`,
                    }}
                    onClick={(e) => marcarDia(e, t)}
                    title={podeEditar && !t.temData ? "Clique no dia para definir o prazo" : undefined}
                  >
                    {/* linha de hoje */}
                    {offHoje >= 0 && offHoje <= totalDias && (
                      <span className="absolute top-0 bottom-0 w-px bg-danger/50" style={{ left: offHoje * diaPx + diaPx / 2 }} />
                    )}
                    {t.temData && (
                      <>
                        {/* Camada de trás: rótulo inteiro em cinza (a parte fora da barra) */}
                        {!arrastando && (
                          <span className="absolute top-1 h-5 leading-5 text-[11px] pl-2 pointer-events-none" style={{ left: off * diaPx }}>
                            <Rotulo apagado />
                          </span>
                        )}
                        <div
                          onPointerDown={(e) => iniciarArraste(e, t, "mover")}
                          onPointerMove={moverArraste}
                          onPointerUp={() => soltarArraste(t)}
                          onPointerCancel={() => { arrasteRef.current = null; setArraste(null); }}
                          onClick={() => { if (!podeEditar) onAbrirTarefa(t.id); }}
                          onMouseEnter={() => setHoverId(t.id)}
                          onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
                          className={cn(
                            "group absolute top-1 h-5 rounded-md border text-[11px] pl-2 text-left select-none touch-none leading-5 overflow-hidden shadow-sm transition-colors",
                            podeEditar ? (arrastando ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer",
                            arrastando && "ring-2 ring-info/60 shadow-md",
                            t.concluidaEm ? "bg-success/10 border-success/30 hover:bg-success/20" :
                            atrasada ? "bg-danger/10 border-danger/40 hover:bg-danger/20" :
                            "bg-card border-border hover:bg-muted"
                          )}
                          style={{ left: off * diaPx, width: larguraBarra }}
                          title={`${t.titulo} — ${inicio.toLocaleDateString("pt-BR")} → ${fim.toLocaleDateString("pt-BR")}`}
                        >
                          <Rotulo />
                          {podeEditar && (
                            <>
                              {/* Bordas: início (esquerda) e entrega (direita) */}
                              <span
                                onPointerDown={(e) => iniciarArraste(e, t, "inicio")}
                                onPointerMove={moverArraste}
                                onPointerUp={(e) => { e.stopPropagation(); soltarArraste(t); }}
                                className="absolute left-0 top-0 h-full w-1.5 rounded-l-md cursor-ew-resize bg-transparent group-hover:bg-foreground/15"
                              />
                              <span
                                onPointerDown={(e) => iniciarArraste(e, t, "fim")}
                                onPointerMove={moverArraste}
                                onPointerUp={(e) => { e.stopPropagation(); soltarArraste(t); }}
                                className="absolute right-0 top-0 h-full w-1.5 rounded-r-md cursor-ew-resize bg-transparent group-hover:bg-foreground/15"
                              />
                            </>
                          )}
                        </div>
                        {/* Conector de dependência: arraste até outra tarefa */}
                        {podeEditar && cfgDep.dependencias && !arrastando && (
                          <span
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              const g = gradeRef.current?.getBoundingClientRect();
                              setLigacao({ deId: t.id, x: g ? e.clientX - g.left : 0, y: g ? e.clientY - g.top : 0 });
                            }}
                            className={cn(
                              "absolute top-[9px] w-2.5 h-2.5 rounded-full border-2 border-amber-500 bg-card cursor-crosshair z-10",
                              ligacao?.deId === t.id ? "opacity-100" : "opacity-0 hover:opacity-100 hover:scale-125"
                            )}
                            style={{ left: off * diaPx + larguraBarra + 2 }}
                            title="Arraste até outra tarefa para criar uma dependência"
                          />
                        )}
                      </>
                    )}
                    {arrastando && (
                      <span
                        className="absolute -top-0.5 z-10 px-1.5 py-0.5 rounded bg-foreground text-background text-[10px] whitespace-nowrap pointer-events-none"
                        style={{ left: off * diaPx + larguraBarra + 6 }}
                      >
                        {inicio.getTime() === fim.getTime()
                          ? fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                          : `${inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} → ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
