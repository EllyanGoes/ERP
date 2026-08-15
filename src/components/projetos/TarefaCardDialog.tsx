"use client";

// Cartão da tarefa — popup central estilo Trello. Carrega o cartão completo,
// edita inline (título/descrição/campos), checklist, comentários, anexos e
// mostra o feed de atividade.
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AnexosSection from "@/components/shared/AnexosSection";
import {
  Loader2, X, Trash2, Archive, CheckSquare, Square, Plus, Send,
  Circle, CheckCircle2, Copy, Link as LinkIcon, Check,
  MoreHorizontal, AlignLeft, Paperclip, MessageSquare,
} from "lucide-react";
import { AvatarUsuario, EtiquetaChip } from "./comum";
import SelectMenu from "@/components/shared/SelectMenu";
import { MembrosPopover, DatasPopover, EtiquetasPopover } from "./popovers";
import { ProjetoBoardDTO, PRIORIDADES } from "./tipos";

type CardDTO = {
  id: string;
  projetoId: string;
  colunaId: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  dataInicio: string | null;
  prazo: string | null;
  concluidaEm: string | null;
  arquivada: boolean;
  criadoPor: string | null;
  createdAt: string;
  membros: { id: string; nome: string }[];
  coluna: { id: string; nome: string; concluiTarefa: boolean };
  etiquetas: { id: string; nome: string; cor: string }[];
  checklist: { id: string; texto: string; feito: boolean; ordem: number }[];
  comentarios: { id: string; texto: string; createdAt: string; editadoEm: string | null; autor: { id: string; nome: string } }[];
  anexos: { id: string; nome: string; url: string; tamanho: number; tipo: string; createdAt: string }[];
  atividades: { id: string; tipo: string; detalhe: unknown; createdAt: string; autor: { id: string; nome: string } }[];
  meuNivel: string;
};

// URLs em texto livre viram links clicáveis (descrição, checklist e comentários).
// split com grupo de captura: índices ímpares são as URLs.
const URL_SPLIT_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

function Linkify({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(URL_SPLIT_RE).map((parte, i) => {
        if (i % 2 === 0) return parte;
        // Pontuação colada no fim ("...link.", "...link)") fica fora do link.
        const m = parte.match(/[).,;:!?\]}'"»]+$/);
        const url = m ? parte.slice(0, -m[0].length) : parte;
        return (
          <span key={i}>
            <a
              href={url.startsWith("www.") ? `https://${url}` : url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-info underline underline-offset-2 hover:opacity-80 break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {url}
            </a>
            {m ? m[0] : ""}
          </span>
        );
      })}
    </>
  );
}

// Render da descrição: linhas "- ..." viram lista de marcadores; agrupa as
// consecutivas num <ul>; o resto sai como parágrafo (quebras preservadas).
function DescricaoRender({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const blocos: ({ tipo: "ul"; itens: string[] } | { tipo: "p"; linhas: string[] })[] = [];
  for (const l of linhas) {
    const m = l.match(/^\s*-\s+(.*)$/);
    const ultimo = blocos[blocos.length - 1];
    if (m) {
      if (ultimo?.tipo === "ul") ultimo.itens.push(m[1]);
      else blocos.push({ tipo: "ul", itens: [m[1]] });
    } else {
      if (ultimo?.tipo === "p") ultimo.linhas.push(l);
      else blocos.push({ tipo: "p", linhas: [l] });
    }
  }
  return (
    <div className="text-sm text-foreground pl-6 space-y-1.5">
      {blocos.map((b, i) =>
        b.tipo === "ul" ? (
          <ul key={i} className="list-disc pl-5 space-y-0.5">
            {b.itens.map((it, j) => <li key={j}><Linkify texto={it} /></li>)}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap"><Linkify texto={b.linhas.join("\n")} /></p>
        ),
      )}
    </div>
  );
}

const ATIVIDADE_LABEL: Record<string, string> = {
  CRIOU: "criou a tarefa", MOVEU: "moveu", CONCLUIU: "concluiu", REABRIU: "reabriu",
  ATRIBUIU: "alterou o responsável", COMENTOU: "comentou", PRAZO: "alterou o prazo",
  ARQUIVOU: "arquivou", DESARQUIVOU: "desarquivou", EXCLUIU: "excluiu",
};

export default function TarefaCardDialog({
  tarefaId, board, podeEditar, usuarioId, onFechar, onMudou,
}: {
  tarefaId: string;
  board: ProjetoBoardDTO;
  podeEditar: boolean;
  usuarioId: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [card, setCard] = useState<CardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [editTitulo, setEditTitulo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [novoItem, setNovoItem] = useState("");
  const [novoComentario, setNovoComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [showEtiquetas, setShowEtiquetas] = useState(false);
  const [showMembros, setShowMembros] = useState(false);
  const [showDatas, setShowDatas] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const comentarioRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projetos/tarefas/${tarefaId}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao carregar"); return; }
      setCard(json.data);
      setTitulo(json.data.titulo);
      setDescricao(json.data.descricao ?? "");
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [tarefaId]);
  useEffect(() => { load(); }, [load]);

  async function patch(data: Record<string, unknown>) {
    const res = await fetch(`/api/projetos/tarefas/${tarefaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => null);
    if (res?.ok) { await load(); onMudou(); }
  }

  async function mover(colunaId: string) {
    await fetch(`/api/projetos/tarefas/${tarefaId}/mover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colunaId }),
    }).catch(() => {});
    await load();
    onMudou();
  }

  // ── Checklist ───────────────────────────────────────────────────────────
  async function addChecklist() {
    const texto = novoItem.trim();
    if (!texto) return;
    setNovoItem("");
    await fetch(`/api/projetos/tarefas/${tarefaId}/checklist`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }),
    }).catch(() => {});
    await load(); onMudou();
  }
  async function toggleChecklist(id: string, feito: boolean) {
    setCard((c) => c ? { ...c, checklist: c.checklist.map((i) => (i.id === id ? { ...i, feito } : i)) } : c);
    await fetch(`/api/projetos/tarefas/${tarefaId}/checklist`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, feito }),
    }).catch(() => {});
    onMudou();
  }
  async function removerChecklist(id: string) {
    setCard((c) => c ? { ...c, checklist: c.checklist.filter((i) => i.id !== id) } : c);
    await fetch(`/api/projetos/tarefas/${tarefaId}/checklist?id=${id}`, { method: "DELETE" }).catch(() => {});
    onMudou();
  }

  // ── Comentários ─────────────────────────────────────────────────────────
  async function comentar() {
    const texto = novoComentario.trim();
    if (!texto || enviandoComentario) return;
    setEnviandoComentario(true);
    await fetch(`/api/projetos/tarefas/${tarefaId}/comentarios`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }),
    }).catch(() => {});
    setNovoComentario("");
    setEnviandoComentario(false);
    await load(); onMudou();
  }
  async function excluirComentario(id: string) {
    await fetch(`/api/projetos/tarefas/${tarefaId}/comentarios?id=${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  // ── Etiquetas ───────────────────────────────────────────────────────────
  async function toggleEtiqueta(etiquetaId: string) {
    if (!card) return;
    const atuais = card.etiquetas.map((e) => e.id);
    const novas = atuais.includes(etiquetaId) ? atuais.filter((i) => i !== etiquetaId) : [...atuais, etiquetaId];
    await patch({ etiquetaIds: novas });
  }
  async function toggleMembro(usuarioId: string) {
    if (!card) return;
    const atuais = card.membros.map((m) => m.id);
    const novos = atuais.includes(usuarioId) ? atuais.filter((i) => i !== usuarioId) : [...atuais, usuarioId];
    await patch({ membroIds: novos });
  }

  // Convidado (sem usuário no sistema): cria, vira membro do projeto e já
  // entra como responsável do cartão.
  async function criarConvidado(nome: string) {
    if (!card) return;
    const res = await fetch("/api/projetos/usuarios", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }),
    }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok || !j?.data?.id) return;
    await fetch(`/api/projetos/${card.projetoId}/membros`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuarioIds: [j.data.id] }),
    }).catch(() => {});
    await patch({ membroIds: [...card.membros.map((m) => m.id), j.data.id] });
  }

  async function editarEtiqueta(etiquetaId: string, nome: string, cor: string) {
    if (!card) return;
    await fetch(`/api/projetos/${card.projetoId}/etiquetas/${etiquetaId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, cor }),
    }).catch(() => {});
    await load(); onMudou();
  }

  async function excluirEtiqueta(etiquetaId: string) {
    if (!card) return;
    await fetch(`/api/projetos/${card.projetoId}/etiquetas/${etiquetaId}`, { method: "DELETE" }).catch(() => {});
    await load(); onMudou();
  }

  async function criarEtiquetaCor(nome: string, cor: string) {
    if (!card) return;
    const res = await fetch(`/api/projetos/${card.projetoId}/etiquetas`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, cor }),
    }).catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      await patch({ etiquetaIds: [...card.etiquetas.map((e) => e.id), json.data.id] });
      onMudou();
    }
  }


  // Concluir/reabrir pelo círculo do título: move p/ a primeira coluna de
  // conclusão (ou de volta p/ a primeira coluna normal).
  async function toggleConcluir() {
    if (!card) return;
    const destino = card.concluidaEm
      ? board.colunas.find((c) => !c.concluiTarefa)
      : board.colunas.find((c) => c.concluiTarefa);
    if (!destino) return;
    await mover(destino.id);
  }

  async function copiarCartao() {
    const res = await fetch(`/api/projetos/tarefas/${tarefaId}/copiar`, { method: "POST" }).catch(() => null);
    if (res?.ok) onMudou();
  }

  async function copiarLink() {
    if (!card) return;
    const url = `${window.location.origin}/projetos/${card.projetoId}?tarefa=${card.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 1500);
    } catch {}
  }

  async function excluirTarefa() {
    if (!window.confirm("Excluir a tarefa definitivamente?")) return;
    const res = await fetch(`/api/projetos/tarefas/${tarefaId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) { onMudou(); onFechar(); }
    else {
      const json = await res?.json().catch(() => ({}));
      alert(json?.error || "Não foi possível excluir.");
    }
  }

  if (loading) {
    // Abertura IMEDIATA: enquanto o cartão completo carrega, mostra o resumo
    // que o board já tem (título/etiquetas) em vez de um popup vazio.
    const resumo = board.tarefas.find((t) => t.id === tarefaId);
    return (
      <div className="px-6 py-6 space-y-4">
        {resumo ? (
          <>
            {resumo.etiquetas.length > 0 && (
              <div className="flex flex-wrap gap-1">{resumo.etiquetas.map((e) => <EtiquetaChip key={e.id} etiqueta={e} small />)}</div>
            )}
            <h2 className="text-xl font-bold text-foreground">{resumo.titulo}</h2>
          </>
        ) : null}
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando cartão…
        </div>
      </div>
    );
  }
  if (!card) return (
    <div className="p-8 text-center">
      <p className="text-danger text-sm">{erro || "Tarefa não encontrada"}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onFechar}>Fechar</Button>
    </div>
  );

  const podeGerenciar = card.meuNivel === "DONO" || card.meuNivel === "ADMIN";
  const feitos = card.checklist.filter((i) => i.feito).length;
  const progresso = card.checklist.length > 0 ? Math.round((feitos / card.checklist.length) * 100) : 0;
  const prazoVencido = card.prazo && !card.concluidaEm && new Date(card.prazo) < new Date();

  // Feed unificado (estilo Trello): comentários + atividade, mais recente no topo
  const feed = [
    ...card.comentarios.map((c) => ({ tipo: "comentario" as const, quando: c.createdAt, c })),
    ...card.atividades.filter((a) => a.tipo !== "COMENTOU").map((a) => ({ tipo: "atividade" as const, quando: a.createdAt, a })),
  ].sort((x, y) => new Date(y.quando).getTime() - new Date(x.quando).getTime());

  return (
    <div className="flex flex-col">
      {/* ── Barra do topo: coluna à esquerda, ações à direita ─────────────── */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
        <SelectMenu
          value={card.colunaId}
          onChange={(v) => mover(v)}
          disabled={!podeEditar}
          title="Mover para outra coluna"
          triggerClassName="h-8 bg-muted font-medium w-auto"
          options={board.colunas.map((c) => ({ value: c.id, label: `${c.nome}${c.concluiTarefa ? " ✓" : ""}` }))}
        />
        <div className="flex items-center gap-1 relative">
          {podeEditar && (
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Mais ações"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-5 h-5" /></button>
          {showMenu && podeEditar && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-20 overflow-hidden text-sm">
              <button onClick={() => { setShowMenu(false); copiarCartao(); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-muted">
                <Copy className="w-3.5 h-3.5" /> Copiar cartão
              </button>
              <button onClick={() => { setShowMenu(false); copiarLink(); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-muted">
                {linkCopiado ? <Check className="w-3.5 h-3.5 text-success" /> : <LinkIcon className="w-3.5 h-3.5" />} {linkCopiado ? "Link copiado!" : "Copiar link"}
              </button>
              <button onClick={() => { setShowMenu(false); patch({ arquivada: !card.arquivada }); onFechar(); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-muted">
                <Archive className="w-3.5 h-3.5" /> {card.arquivada ? "Desarquivar" : "Arquivar"}
              </button>
              {podeGerenciar && (
                <button onClick={() => { setShowMenu(false); excluirTarefa(); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-danger hover:bg-danger/10 border-t border-border">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px]">
        {/* ── Coluna principal ─────────────────────────────────────────────── */}
        <div className="px-5 pb-5 space-y-5 min-w-0">
          {/* Título com círculo de concluir */}
          <div className="flex items-start gap-2.5">
            {podeEditar && board.colunas.some((c) => c.concluiTarefa) && (
              <button
                onClick={toggleConcluir}
                className={cn("mt-1 shrink-0 transition-colors", card.concluidaEm ? "text-success" : "text-muted-foreground/50 hover:text-success")}
                title={card.concluidaEm ? "Reabrir tarefa" : "Concluir tarefa"}
              >
                {card.concluidaEm ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
              </button>
            )}
            {editTitulo && podeEditar ? (
              <input
                autoFocus
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => { setEditTitulo(false); if (titulo.trim() && titulo !== card.titulo) patch({ titulo }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="flex-1 font-bold text-2xl text-foreground bg-transparent border-b border-info/50 focus:outline-none"
              />
            ) : (
              <h2
                className={cn("flex-1 font-bold text-2xl text-foreground leading-snug", podeEditar && "cursor-text", card.concluidaEm && "line-through text-muted-foreground")}
                onClick={() => podeEditar && setEditTitulo(true)}
              >
                {card.titulo}
              </h2>
            )}
          </div>

          {/* Linha Membro / Etiquetas / Data / Prioridade (estilo Trello) */}
          <div className="flex items-start gap-6 flex-wrap">
            <div className="relative">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Membros</p>
              <div className="flex items-center gap-1">
                {card.membros.map((m) => <AvatarUsuario key={m.id} nome={m.nome} />)}
                {podeEditar && (
                  <button
                    onClick={() => setShowMembros(true)}
                    className="w-7 h-7 rounded-full border border-border bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                    title="Alterar membros"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {showMembros && podeEditar && (
                <MembrosPopover board={board} membros={card.membros} onToggle={toggleMembro} onFechar={() => setShowMembros(false)} onCriarConvidado={criarConvidado} />
              )}
            </div>

            <div className="relative">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Etiquetas</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {card.etiquetas.map((e) => (
                  <span key={e.id} onClick={() => podeEditar && setShowEtiquetas(true)} className={podeEditar ? "cursor-pointer" : ""}>
                    <EtiquetaChip etiqueta={e} />
                  </span>
                ))}
                {podeEditar && (
                  <button
                    onClick={() => setShowEtiquetas(true)}
                    className="w-7 h-7 rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                    title="Editar etiquetas"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {showEtiquetas && podeEditar && (
                <EtiquetasPopover
                  board={board}
                  aplicadas={card.etiquetas.map((e) => e.id)}
                  podeGerenciar={podeGerenciar}
                  onToggle={toggleEtiqueta}
                  onCriar={criarEtiquetaCor}
                  onEditar={editarEtiqueta}
                  onExcluir={excluirEtiqueta}
                  onFechar={() => setShowEtiquetas(false)}
                />
              )}
            </div>

            <div className="relative">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Datas</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => podeEditar && setShowDatas(true)}
                  className="text-sm border border-border rounded-lg bg-card px-2.5 py-1.5 text-foreground hover:bg-muted text-left"
                >
                  {card.dataInicio || card.prazo
                    ? [
                        card.dataInicio ? new Date(card.dataInicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null,
                        card.prazo ? new Date(card.prazo).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : null,
                      ].filter(Boolean).join(" → ")
                    : "Adicionar datas"}
                </button>
                {prazoVencido && (
                  <span className="text-[11px] font-semibold text-danger bg-danger/15 px-2 py-0.5 rounded-md whitespace-nowrap">Em Atraso</span>
                )}
                {card.concluidaEm && (
                  <span className="text-[11px] font-semibold text-success bg-success/15 px-2 py-0.5 rounded-md whitespace-nowrap">Concluída</span>
                )}
              </div>
              {showDatas && podeEditar && (
                <DatasPopover
                  dataInicio={card.dataInicio}
                  prazo={card.prazo}
                  onSalvar={(v) => { setShowDatas(false); patch({ dataInicio: v.dataInicio, prazo: v.prazo }); }}
                  onFechar={() => setShowDatas(false)}
                />
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Prioridade</p>
              <SelectMenu
                value={card.prioridade}
                onChange={(v) => patch({ prioridade: v })}
                disabled={!podeEditar}
                triggerClassName="h-8 w-auto"
                options={Object.entries(PRIORIDADES).map(([k, v]) => ({ value: k, label: v.label }))}
              />
            </div>

          </div>

          {/* Descrição */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><AlignLeft className="w-4 h-4 text-muted-foreground" /> Descrição</p>
              {podeEditar && !editDesc && card.descricao && (
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setEditDesc(true)}>Editar</Button>
              )}
            </div>
            {editDesc && podeEditar ? (
              <div>
                <textarea
                  autoFocus
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  onKeyDown={(e) => {
                    // Lista de marcadores: Enter numa linha "- ..." continua a
                    // lista; Enter numa linha "- " vazia encerra (remove o marcador).
                    if (e.key !== "Enter" || e.shiftKey) return;
                    const ta = e.currentTarget;
                    const pos = ta.selectionStart;
                    const antes = descricao.slice(0, pos);
                    const linha = antes.slice(antes.lastIndexOf("\n") + 1);
                    if (/^\s*-\s/.test(linha)) {
                      e.preventDefault();
                      const depois = descricao.slice(pos);
                      if (linha.trim() === "-") {
                        // linha só com o marcador → encerra a lista
                        const inicioLinha = antes.lastIndexOf("\n") + 1;
                        const novo = descricao.slice(0, inicioLinha) + depois;
                        setDescricao(novo);
                        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = inicioLinha; });
                      } else {
                        const novo = antes + "\n- " + depois;
                        setDescricao(novo);
                        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos + 3; });
                      }
                    }
                  }}
                  rows={4}
                  className="w-full text-sm border border-border rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Detalhe a tarefa...  (dica: comece a linha com “- ” para uma lista)"
                />
                <div className="flex gap-2 mt-1.5">
                  <Button size="sm" className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => { setEditDesc(false); patch({ descricao }); }}>Salvar</Button>
                  <button className="text-xs text-muted-foreground" onClick={() => { setEditDesc(false); setDescricao(card.descricao ?? ""); }}>Cancelar</button>
                </div>
              </div>
            ) : card.descricao ? (
              <DescricaoRender texto={card.descricao} />
            ) : podeEditar ? (
              <button onClick={() => setEditDesc(true)} className="w-full text-left text-sm text-muted-foreground bg-muted hover:bg-muted/70 rounded-lg px-3 py-2.5">
                Adicionar uma descrição mais detalhada...
              </button>
            ) : (
              <p className="text-sm text-muted-foreground/60 pl-6">—</p>
            )}
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><CheckSquare className="w-4 h-4 text-muted-foreground" /> Checklist</p>
              {card.checklist.length > 0 && <span className="text-xs text-muted-foreground">{progresso}%</span>}
            </div>
            {card.checklist.length > 0 && (
              <div className="h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", progresso === 100 ? "bg-success" : "bg-blue-500")} style={{ width: `${progresso}%` }} />
              </div>
            )}
            <div className="space-y-1">
              {card.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <button onClick={() => podeEditar && toggleChecklist(item.id, !item.feito)} className={cn("shrink-0", item.feito ? "text-success" : "text-muted-foreground")}>
                    {item.feito ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <span className={cn("text-sm flex-1", item.feito ? "line-through text-muted-foreground" : "text-foreground")}><Linkify texto={item.texto} /></span>
                  {podeEditar && (
                    <button onClick={() => removerChecklist(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {podeEditar && (
              <div className="flex items-center gap-2 mt-2">
                <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  value={novoItem}
                  onChange={(e) => setNovoItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChecklist()}
                  placeholder="Adicionar item..."
                  className="flex-1 text-sm bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>

          {/* Anexos */}
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1.5"><Paperclip className="w-4 h-4 text-muted-foreground" /> Anexos</p>
            <AnexosSection apiBase={`/api/projetos/tarefas/${tarefaId}/anexos`} disabled={!podeEditar} />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Criada {card.criadoPor ? `por ${card.criadoPor} ` : ""}em {new Date(card.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>

        {/* ── Painel lateral: Comentários e atividade ──────────────────────── */}
        <div className="border-t md:border-t-0 md:border-l border-border bg-muted/30 rounded-b-2xl md:rounded-bl-none md:rounded-r-2xl flex flex-col">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Comentários e atividade</p>
          </div>

          {podeEditar && (
            <div className="px-4 pb-3">
              <textarea
                ref={comentarioRef}
                value={novoComentario}
                onChange={(e) => setNovoComentario(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) comentar(); }}
                rows={novoComentario ? 3 : 1}
                placeholder="Escrever um comentário..."
                className="w-full text-sm border border-border rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {novoComentario.trim() && (
                <Button size="sm" onClick={comentar} disabled={enviandoComentario} className="mt-1.5 bg-blue-600 hover:bg-blue-700 h-7 px-3 text-xs">
                  {enviandoComentario ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3 h-3 mr-1.5" /> Enviar</>}
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">@nome menciona · Ctrl+Enter envia</p>
            </div>
          )}

          <div className="px-4 pb-4 space-y-3 overflow-y-auto max-h-[55vh]">
            {feed.length === 0 && <p className="text-xs text-muted-foreground/70 italic">Nenhuma atividade ainda.</p>}
            {feed.map((f) =>
              f.tipo === "comentario" ? (
                <div key={`c-${f.c.id}`} className="flex gap-2.5 group">
                  <AvatarUsuario nome={f.c.autor.nome} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">{f.c.autor.nome}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(f.c.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {f.c.editadoEm && " (editado)"}
                      </span>
                      {(f.c.autor.id === usuarioId || podeGerenciar) && podeEditar && (
                        <button onClick={() => excluirComentario(f.c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="bg-card border border-border rounded-lg px-2.5 py-1.5 mt-0.5">
                      <p className="text-sm text-foreground whitespace-pre-wrap"><Linkify texto={f.c.texto} /></p>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={`a-${f.a.id}`} className="flex gap-2.5">
                  <AvatarUsuario nome={f.a.autor.nome} size="sm" />
                  <p className="text-xs text-muted-foreground flex-1 min-w-0 pt-1">
                    <span className="font-semibold text-foreground">{f.a.autor.nome}</span>{" "}
                    {ATIVIDADE_LABEL[f.a.tipo] ?? f.a.tipo.toLowerCase()}
                    {(() => {
                      const d = f.a.detalhe as { de?: string; para?: string } | null;
                      return d?.de && d?.para ? ` de "${d.de}" para "${d.para}"` : "";
                    })()}
                    <span className="block text-[10px]">
                      {new Date(f.a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
