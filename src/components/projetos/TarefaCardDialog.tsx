"use client";

// Cartão da tarefa — popup central estilo Trello. Carrega o cartão completo,
// edita inline (título/descrição/campos), checklist, comentários, anexos e
// mostra o feed de atividade.
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import AnexosSection from "@/components/shared/AnexosSection";
import {
  Loader2, X, Trash2, Archive, CheckSquare, Square, Plus, Send,
  Tag, User as UserIcon, Flag, CalendarDays, Activity as ActivityIcon,
} from "lucide-react";
import { AvatarUsuario, EtiquetaChip } from "./comum";
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
  responsavel: { id: string; nome: string } | null;
  coluna: { id: string; nome: string; concluiTarefa: boolean };
  etiquetas: { id: string; nome: string; cor: string }[];
  checklist: { id: string; texto: string; feito: boolean; ordem: number }[];
  comentarios: { id: string; texto: string; createdAt: string; editadoEm: string | null; autor: { id: string; nome: string } }[];
  anexos: { id: string; nome: string; url: string; tamanho: number; tipo: string; createdAt: string }[];
  atividades: { id: string; tipo: string; detalhe: unknown; createdAt: string; autor: { id: string; nome: string } }[];
  meuNivel: string;
};

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
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
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
  async function criarEtiqueta() {
    const nome = novaEtiqueta.trim();
    if (!nome || !card) return;
    setNovaEtiqueta("");
    const cores = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488"];
    const res = await fetch(`/api/projetos/${card.projetoId}/etiquetas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, cor: cores[Math.floor(nome.length % cores.length)] }),
    }).catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      await patch({ etiquetaIds: [...card.etiquetas.map((e) => e.id), json.data.id] });
      onMudou(); // etiqueta nova aparece no board
    }
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

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!card) return (
    <div className="p-8 text-center">
      <p className="text-danger text-sm">{erro || "Tarefa não encontrada"}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onFechar}>Fechar</Button>
    </div>
  );

  const podeGerenciar = card.meuNivel === "DONO" || card.meuNivel === "ADMIN";
  const feitos = card.checklist.filter((i) => i.feito).length;
  const progresso = card.checklist.length > 0 ? Math.round((feitos / card.checklist.length) * 100) : 0;

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-border">
        <div className="flex-1 min-w-0">
          {editTitulo && podeEditar ? (
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={() => { setEditTitulo(false); if (titulo.trim() && titulo !== card.titulo) patch({ titulo }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full font-bold text-lg text-foreground bg-transparent border-b border-info/50 focus:outline-none"
            />
          ) : (
            <h2
              className={cn("font-bold text-lg text-foreground leading-snug", podeEditar && "cursor-text hover:bg-muted rounded px-1 -mx-1", card.concluidaEm && "line-through text-muted-foreground")}
              onClick={() => podeEditar && setEditTitulo(true)}
            >
              {card.titulo}
            </h2>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            em <span className="font-medium">{card.coluna.nome}</span>
            {card.concluidaEm && <span className="text-success font-medium"> · concluída</span>}
            {card.arquivada && <span> · arquivada</span>}
          </p>
        </div>
        <button onClick={onFechar} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-5 h-5" /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-0">
        {/* ── Corpo principal ──────────────────────────────────────────── */}
        <div className="px-6 py-4 space-y-5 min-w-0">
          {/* Etiquetas */}
          {(card.etiquetas.length > 0 || showEtiquetas) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {card.etiquetas.map((e) => (
                <span key={e.id} onClick={() => podeEditar && toggleEtiqueta(e.id)} className={podeEditar ? "cursor-pointer" : ""}>
                  <EtiquetaChip etiqueta={e} />
                </span>
              ))}
            </div>
          )}

          {/* Descrição */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Descrição</p>
            {editDesc && podeEditar ? (
              <div>
                <textarea
                  autoFocus
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={4}
                  className="w-full text-sm border border-border rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Detalhe a tarefa..."
                />
                <div className="flex gap-2 mt-1.5">
                  <Button size="sm" className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => { setEditDesc(false); patch({ descricao }); }}>Salvar</Button>
                  <button className="text-xs text-muted-foreground" onClick={() => { setEditDesc(false); setDescricao(card.descricao ?? ""); }}>Cancelar</button>
                </div>
              </div>
            ) : card.descricao ? (
              <p
                className={cn("text-sm text-foreground whitespace-pre-wrap rounded-lg", podeEditar && "cursor-text hover:bg-muted px-2 py-1 -mx-2")}
                onClick={() => podeEditar && setEditDesc(true)}
              >
                {card.descricao}
              </p>
            ) : podeEditar ? (
              <button onClick={() => setEditDesc(true)} className="w-full text-left text-sm text-muted-foreground bg-muted hover:bg-muted/70 rounded-lg px-3 py-2.5">
                Adicionar uma descrição...
              </button>
            ) : (
              <p className="text-sm text-muted-foreground/60">—</p>
            )}
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Checklist</p>
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
                  <span className={cn("text-sm flex-1", item.feito ? "line-through text-muted-foreground" : "text-foreground")}>{item.texto}</span>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Anexos</p>
            <AnexosSection apiBase={`/api/projetos/tarefas/${tarefaId}/anexos`} disabled={!podeEditar} />
          </div>

          {/* Comentários */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Comentários</p>
            <div className="space-y-3">
              {card.comentarios.map((c) => (
                <div key={c.id} className="flex gap-2.5 group">
                  <AvatarUsuario nome={c.autor.nome} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">{c.autor.nome}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {c.editadoEm && " (editado)"}
                      </span>
                      {(c.autor.id === usuarioId || podeGerenciar) && (
                        <button onClick={() => excluirComentario(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.texto}</p>
                  </div>
                </div>
              ))}
              {card.comentarios.length === 0 && <p className="text-xs text-muted-foreground/70 italic">Nenhum comentário ainda.</p>}
            </div>
            {podeEditar && (
              <div className="flex gap-2 mt-3">
                <textarea
                  ref={comentarioRef}
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) comentar(); }}
                  rows={2}
                  placeholder="Escreva um comentário... (@nome menciona; Ctrl+Enter envia)"
                  className="flex-1 text-sm border border-border rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button size="sm" onClick={comentar} disabled={enviandoComentario || !novoComentario.trim()} className="self-end bg-blue-600 hover:bg-blue-700 h-8 px-3">
                  {enviandoComentario ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}
          </div>

          {/* Atividade */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ActivityIcon className="w-3.5 h-3.5" /> Atividade
            </p>
            <div className="space-y-1.5">
              {card.atividades.filter((a) => a.tipo !== "COMENTOU").slice(0, 10).map((a) => (
                <p key={a.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{a.autor.nome}</span>{" "}
                  {ATIVIDADE_LABEL[a.tipo] ?? a.tipo.toLowerCase()}
                  {(() => {
                    const d = a.detalhe as { de?: string; para?: string } | null;
                    return d?.de && d?.para ? ` de "${d.de}" para "${d.para}"` : "";
                  })()}
                  {" · "}
                  {new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* ── Lateral: campos ──────────────────────────────────────────── */}
        <div className="border-t md:border-t-0 md:border-l border-border px-4 py-4 space-y-4 bg-muted/30 rounded-b-2xl md:rounded-bl-none md:rounded-r-2xl">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><UserIcon className="w-3 h-3" /> Responsável</p>
            <select
              value={card.responsavel?.id ?? ""}
              onChange={(e) => patch({ responsavelId: e.target.value || null })}
              disabled={!podeEditar}
              className="w-full text-sm border border-border rounded-lg bg-card px-2 py-1.5 text-foreground"
            >
              <option value="">— Ninguém —</option>
              {board.membros.map((m) => <option key={m.usuarioId} value={m.usuarioId}>{m.usuario.nome}</option>)}
            </select>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><Flag className="w-3 h-3" /> Prioridade</p>
            <select
              value={card.prioridade}
              onChange={(e) => patch({ prioridade: e.target.value })}
              disabled={!podeEditar}
              className="w-full text-sm border border-border rounded-lg bg-card px-2 py-1.5 text-foreground"
            >
              {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Início</p>
            <DatePicker value={card.dataInicio ? card.dataInicio.slice(0, 10) : ""} onChange={(v) => podeEditar && patch({ dataInicio: v || null })} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Prazo</p>
            <DatePicker value={card.prazo ? card.prazo.slice(0, 10) : ""} onChange={(v) => podeEditar && patch({ prazo: v || null })} />
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Coluna</p>
            <select
              value={card.colunaId}
              onChange={(e) => mover(e.target.value)}
              disabled={!podeEditar}
              className="w-full text-sm border border-border rounded-lg bg-card px-2 py-1.5 text-foreground"
            >
              {board.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.concluiTarefa ? " ✓" : ""}</option>)}
            </select>
          </div>

          {/* Etiquetas */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Etiquetas</p>
            {podeEditar && (
              <button onClick={() => setShowEtiquetas(!showEtiquetas)} className="w-full text-left text-sm text-muted-foreground bg-card border border-border rounded-lg px-2 py-1.5 hover:bg-muted">
                {card.etiquetas.length > 0 ? `${card.etiquetas.length} aplicada${card.etiquetas.length > 1 ? "s" : ""}` : "Adicionar..."}
              </button>
            )}
            {showEtiquetas && podeEditar && (
              <div className="mt-1.5 bg-card border border-border rounded-lg p-2 space-y-1">
                {board.etiquetas.map((e) => {
                  const aplicada = card.etiquetas.some((x) => x.id === e.id);
                  return (
                    <button key={e.id} onClick={() => toggleEtiqueta(e.id)} className="w-full flex items-center gap-2 text-left rounded-md px-1.5 py-1 hover:bg-muted">
                      <span className="w-6 h-3.5 rounded" style={{ backgroundColor: e.cor }} />
                      <span className="text-xs text-foreground flex-1 truncate">{e.nome}</span>
                      {aplicada && <CheckSquare className="w-3.5 h-3.5 text-info" />}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1 pt-1 border-t border-border">
                  <input
                    value={novaEtiqueta}
                    onChange={(e) => setNovaEtiqueta(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && criarEtiqueta()}
                    placeholder="Nova etiqueta..."
                    className="flex-1 text-xs bg-transparent focus:outline-none text-foreground px-1 py-1"
                  />
                  <button onClick={criarEtiqueta} className="text-info"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>

          {/* Ações */}
          {podeEditar && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <button
                onClick={() => { patch({ arquivada: !card.arquivada }); onFechar(); }}
                className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted"
              >
                <Archive className="w-3.5 h-3.5" /> {card.arquivada ? "Desarquivar" : "Arquivar"}
              </button>
              {podeGerenciar && (
                <button onClick={excluirTarefa} className="w-full flex items-center gap-2 text-sm text-danger hover:bg-danger/10 px-2 py-1.5 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground pt-1">
            Criada {card.criadoPor ? `por ${card.criadoPor} ` : ""}em {new Date(card.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>
    </div>
  );
}
