"use client";

// Popovers do cartão no estilo Trello: Membros, Datas e Etiquetas.
// Cada um renderiza um backdrop transparente (clique fora fecha) + painel
// ancorado no elemento pai (que deve ser position:relative).
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import EscClose from "@/components/shared/EscClose";
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, Trash2 } from "lucide-react";
import { AvatarUsuario } from "./comum";
import { ProjetoBoardDTO, EtiquetaDTO } from "./tipos";

function Shell({ titulo, onFechar, children, largura = "w-80" }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: string }) {
  return (
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onFechar} />
      <div className={cn("absolute left-0 top-full mt-1.5 z-[70] bg-card border border-border rounded-xl shadow-xl", largura)}>
        <EscClose onClose={onFechar} />
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="w-4" />
          <span className="text-sm font-semibold text-foreground">{titulo}</span>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Membros ─────────────────────────────────────────────────────────────────
export function MembrosPopover({
  board, membros, onToggle, onFechar,
}: {
  board: ProjetoBoardDTO;
  membros: { id: string; nome: string }[];
  onToggle: (usuarioId: string) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const noCartao = new Set(membros.map((m) => m.id));
  const doQuadro = board.membros
    .filter((m) => !noCartao.has(m.usuarioId))
    .filter((m) => !busca || m.usuario.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <Shell titulo="Membros" onFechar={onFechar}>
      <div className="px-3 pb-3 space-y-3">
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar membros"
          className="w-full text-sm border-2 border-info/60 rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none"
        />
        {membros.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Membros do Cartão</p>
            <div className="space-y-0.5">
              {membros.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 bg-muted rounded-lg px-2.5 py-1.5">
                  <AvatarUsuario nome={m.nome} size="sm" />
                  <span className="text-sm text-foreground flex-1 truncate">{m.nome}</span>
                  <button onClick={() => onToggle(m.id)} className="text-muted-foreground hover:text-danger" title="Remover">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Membros do Quadro</p>
          <div className="space-y-0.5 max-h-56 overflow-y-auto">
            {doQuadro.map((m) => (
              <button
                key={m.usuarioId}
                onClick={() => onToggle(m.usuarioId)}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted"
              >
                <AvatarUsuario nome={m.usuario.nome} size="sm" />
                <span className="text-sm text-foreground truncate">{m.usuario.nome}</span>
              </button>
            ))}
            {doQuadro.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Nenhum membro encontrado.</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── Datas ───────────────────────────────────────────────────────────────────
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function DatasPopover({
  dataInicio, prazo, onSalvar, onFechar,
}: {
  dataInicio: string | null;
  prazo: string | null;
  onSalvar: (v: { dataInicio: string | null; prazo: string | null }) => void;
  onFechar: () => void;
}) {
  const [inicio, setInicio] = useState<string>(dataInicio ? dataInicio.slice(0, 10) : "");
  const [entrega, setEntrega] = useState<string>(prazo ? prazo.slice(0, 10) : "");
  const [campoAtivo, setCampoAtivo] = useState<"inicio" | "entrega">("entrega");
  const base = entrega || inicio || iso(new Date());
  const [ano, setAno] = useState(parseInt(base.slice(0, 4)));
  const [mes, setMes] = useState(parseInt(base.slice(5, 7)) - 1);

  const primeiro = new Date(ano, mes, 1);
  const inicioGrade = new Date(primeiro);
  inicioGrade.setDate(1 - primeiro.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setDate(inicioGrade.getDate() + i);
    return d;
  });
  const hoje = iso(new Date());

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  function escolherDia(d: Date) {
    const v = iso(d);
    if (campoAtivo === "inicio") setInicio(v);
    else setEntrega(v);
  }

  return (
    <Shell titulo="Datas" onFechar={onFechar} largura="w-80">
      <div className="px-4 pb-4 space-y-3">
        {/* Calendário */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-0.5">
              <button onClick={() => navegar(-12)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronsLeft className="w-4 h-4" /></button>
              <button onClick={() => navegar(-1)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
            </div>
            <span className="text-sm font-semibold text-foreground capitalize">
              {new Date(ano, mes).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => navegar(1)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => navegar(12)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronsRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center">
            {DIAS.map((d) => <span key={d} className="text-[11px] font-semibold text-muted-foreground py-1">{d}</span>)}
            {dias.map((d) => {
              const v = iso(d);
              const doMes = d.getMonth() === mes;
              const selecionado = v === (campoAtivo === "inicio" ? inicio : entrega);
              const outroCampo = v === (campoAtivo === "inicio" ? entrega : inicio);
              return (
                <button
                  key={v}
                  onClick={() => escolherDia(d)}
                  className={cn(
                    "text-sm py-1.5 rounded-md transition-colors",
                    selecionado ? "bg-blue-600 text-white font-semibold" :
                    outroCampo ? "bg-info/15 text-info" :
                    v === hoje ? "text-info font-semibold hover:bg-muted" :
                    doMes ? "text-foreground hover:bg-muted" : "text-muted-foreground/40 hover:bg-muted"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campos */}
        <div className="space-y-2.5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Data de início</p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded"
                checked={!!inicio}
                onChange={(e) => { if (!e.target.checked) setInicio(""); else { setInicio(hoje); setCampoAtivo("inicio"); } }}
              />
              <button
                onClick={() => inicio && setCampoAtivo("inicio")}
                className={cn(
                  "text-sm border rounded-lg px-2.5 py-1.5 min-w-32 text-left",
                  !inicio ? "bg-muted text-muted-foreground/60 border-border" :
                  campoAtivo === "inicio" ? "border-info ring-1 ring-info/40 text-foreground bg-card" : "border-border text-foreground bg-card"
                )}
              >
                {inicio ? new Date(inicio + "T12:00:00").toLocaleDateString("pt-BR") : "D/M/AAAA"}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Data de entrega</p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded"
                checked={!!entrega}
                onChange={(e) => { if (!e.target.checked) setEntrega(""); else { setEntrega(hoje); setCampoAtivo("entrega"); } }}
              />
              <button
                onClick={() => entrega && setCampoAtivo("entrega")}
                className={cn(
                  "text-sm border rounded-lg px-2.5 py-1.5 min-w-32 text-left",
                  !entrega ? "bg-muted text-muted-foreground/60 border-border" :
                  campoAtivo === "entrega" ? "border-info ring-1 ring-info/40 text-foreground bg-card" : "border-border text-foreground bg-card"
                )}
              >
                {entrega ? new Date(entrega + "T12:00:00").toLocaleDateString("pt-BR") : "D/M/AAAA"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 h-9" onClick={() => onSalvar({ dataInicio: inicio || null, prazo: entrega || null })}>
            Salvar
          </Button>
          <Button variant="outline" className="w-full h-9" onClick={() => onSalvar({ dataInicio: null, prazo: null })}>
            Remover
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// ── Etiquetas ───────────────────────────────────────────────────────────────
const CORES_ETIQUETA = ["#4ade80", "#facc15", "#fb923c", "#f87171", "#c084fc", "#60a5fa", "#2dd4bf", "#f472b6", "#94a3b8", "#16a34a", "#ca8a04", "#dc2626"];

export function EtiquetasPopover({
  board, aplicadas, podeGerenciar, onToggle, onCriar, onEditar, onExcluir, onFechar,
}: {
  board: ProjetoBoardDTO;
  aplicadas: string[];
  podeGerenciar: boolean;
  onToggle: (etiquetaId: string) => void;
  onCriar: (nome: string, cor: string) => void;
  onEditar: (etiquetaId: string, nome: string, cor: string) => void;
  onExcluir: (etiquetaId: string) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"lista" | "criar" | "editar">("lista");
  const [alvo, setAlvo] = useState<EtiquetaDTO | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES_ETIQUETA[5]);

  useEffect(() => {
    if (modo === "editar" && alvo) { setNome(alvo.nome); setCor(alvo.cor); }
    if (modo === "criar") { setNome(""); setCor(CORES_ETIQUETA[5]); }
  }, [modo, alvo]);

  const lista = board.etiquetas.filter((e) => !busca || e.nome.toLowerCase().includes(busca.toLowerCase()));

  if (modo !== "lista") {
    return (
      <Shell titulo={modo === "criar" ? "Criar etiqueta" : "Editar etiqueta"} onFechar={() => setModo("lista")}>
        <div className="px-4 pb-4 space-y-3">
          <div className="flex justify-center py-2 bg-muted rounded-lg">
            <span className="px-4 py-1.5 rounded-md text-sm font-medium text-white min-w-40 text-center" style={{ backgroundColor: cor }}>
              {nome || "…"}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Título</p>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full text-sm border-2 border-info/60 rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Cor</p>
            <div className="grid grid-cols-6 gap-1.5">
              {CORES_ETIQUETA.map((c) => (
                <button
                  key={c}
                  onClick={() => setCor(c)}
                  className={cn("h-8 rounded-md transition-transform", cor === c && "ring-2 ring-offset-1 ring-info scale-105")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700 h-9"
              disabled={!nome.trim()}
              onClick={() => {
                if (modo === "criar") onCriar(nome.trim(), cor);
                else if (alvo) onEditar(alvo.id, nome.trim(), cor);
                setModo("lista");
              }}
            >
              {modo === "criar" ? "Criar" : "Salvar"}
            </Button>
            {modo === "editar" && alvo && (
              <Button variant="outline" className="h-9 text-danger border-danger/30 hover:bg-danger/10" onClick={() => { onExcluir(alvo.id); setModo("lista"); }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell titulo="Etiquetas" onFechar={onFechar}>
      <div className="px-3 pb-3 space-y-2.5">
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar etiquetas..."
          className="w-full text-sm border-2 border-info/60 rounded-lg bg-card px-3 py-2 text-foreground focus:outline-none"
        />
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Etiquetas</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {lista.map((e) => {
              const marcada = aplicadas.includes(e.id);
              return (
                <div key={e.id} className="flex items-center gap-2">
                  <input type="checkbox" className="rounded shrink-0" checked={marcada} onChange={() => onToggle(e.id)} />
                  <button
                    onClick={() => onToggle(e.id)}
                    className="flex-1 h-8 rounded-md px-3 text-left text-sm font-medium text-white truncate hover:opacity-90"
                    style={{ backgroundColor: e.cor }}
                  >
                    {e.nome}
                  </button>
                  {podeGerenciar && (
                    <button onClick={() => { setAlvo(e); setModo("editar"); }} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar etiqueta">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {lista.length === 0 && <p className="text-xs text-muted-foreground px-1 py-2">Nenhuma etiqueta.</p>}
          </div>
        </div>
        <button
          onClick={() => setModo("criar")}
          className="w-full text-sm text-foreground bg-muted hover:bg-muted/70 rounded-lg px-3 py-2 text-center font-medium"
        >
          Criar uma nova etiqueta
        </button>
      </div>
    </Shell>
  );
}
