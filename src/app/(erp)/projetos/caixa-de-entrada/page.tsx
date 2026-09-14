"use client";

// Caixa de Entrada — captura rápida pessoal de tarefas sem projeto, estilo
// Things 3: input no topo (Enter cria), lista com bolinha p/ concluir, clique
// abre o item inline (título + notas) com "Mover para projeto" e excluir.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, Circle, CheckCircle2, FolderInput, Trash2, Plus, X } from "lucide-react";
import InboxMoverMenu, { InboxItemDTO, avisarInboxMudou } from "@/components/projetos/InboxMoverMenu";

export default function CaixaDeEntradaPage() {
  const router = useRouter();
  const params = useSearchParams();
  useTabTitle("Caixa de Entrada");

  const [itens, setItens] = useState<InboxItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(params.get("item"));
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [moverDe, setMoverDe] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projetos/inbox");
      const j = await res.json();
      setItens(j.data ?? []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const onMudou = () => load();
    window.addEventListener("erp:inbox-mudou", onMudou);
    return () => window.removeEventListener("erp:inbox-mudou", onMudou);
  }, [load]);

  useEffect(() => { if (!aberto) inputRef.current?.focus(); }, [aberto]);

  async function adicionar() {
    const titulo = novo.trim();
    if (!titulo || salvando) return;
    setSalvando(true);
    const res = await fetch("/api/projetos/inbox", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo }),
    }).catch(() => null);
    setSalvando(false);
    if (res?.ok) {
      const j = await res.json();
      setItens((prev) => [...prev, j.data]);
      setNovo("");
      avisarInboxMudou();
    }
  }

  async function salvar(id: string, data: { titulo?: string; notas?: string | null }) {
    const res = await fetch(`/api/projetos/inbox/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).catch(() => null);
    if (res?.ok) {
      const j = await res.json();
      setItens((prev) => prev.map((i) => (i.id === id ? j.data : i)));
      avisarInboxMudou();
    }
  }

  async function concluir(item: InboxItemDTO) {
    setConcluindo(item.id);
    await fetch(`/api/projetos/inbox/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concluida: true }),
    }).catch(() => {});
    setTimeout(() => {
      setItens((prev) => prev.filter((i) => i.id !== item.id));
      setConcluindo(null);
      if (aberto === item.id) setAberto(null);
      avisarInboxMudou();
    }, 450);
  }

  async function excluir(item: InboxItemDTO) {
    await fetch(`/api/projetos/inbox/${item.id}`, { method: "DELETE" }).catch(() => {});
    setItens((prev) => prev.filter((i) => i.id !== item.id));
    if (aberto === item.id) setAberto(null);
    avisarInboxMudou();
  }

  return (
    <div>
      <PageHeader title="Caixa de Entrada" breadcrumbs={[{ label: "Projetos", href: "/projetos" }, { label: "Caixa de Entrada" }]} />
      <div className="px-8 pb-8 max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/15 text-info"><Inbox className="w-5 h-5" /></span>
          <div>
            <p className="text-sm text-muted-foreground">
              Anote o que vier à cabeça. Depois conclua aqui mesmo ou mova para um projeto — vira uma atividade do quadro com você como responsável.
            </p>
          </div>
        </div>

        {/* Captura rápida */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
          <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
            placeholder="Nova tarefa… (Enter para adicionar)"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
          {salvando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {aviso && (
          <div className="flex items-center justify-between rounded-lg bg-success/10 text-success text-sm px-3 py-2">
            <span>{aviso}</span>
            <button onClick={() => setAviso(null)} className="p-0.5"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : itens.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Caixa vazia. Tudo organizado.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {itens.map((item) => (
              aberto === item.id ? (
                <ItemAberto
                  key={item.id}
                  item={item}
                  concluindo={concluindo === item.id}
                  moverAberto={moverDe === item.id}
                  onToggleMover={() => setMoverDe(moverDe === item.id ? null : item.id)}
                  onFecharMover={() => setMoverDe(null)}
                  onConcluir={() => concluir(item)}
                  onExcluir={() => excluir(item)}
                  onSalvar={(data) => salvar(item.id, data)}
                  onFechar={() => setAberto(null)}
                  onMovido={(r) => {
                    setMoverDe(null);
                    setItens((prev) => prev.filter((i) => i.id !== item.id));
                    setAberto(null);
                    setAviso(`“${item.titulo}” virou atividade em ${r.projetoNome}.`);
                    router.push(`/projetos/${r.projetoId}?tarefa=${r.tarefaId}`);
                  }}
                />
              ) : (
                <div key={item.id} className="group relative flex items-start gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors">
                  <button
                    onClick={() => concluir(item)}
                    className={cn("mt-0.5 shrink-0 transition-colors", concluindo === item.id ? "text-info" : "text-muted-foreground/50 hover:text-info")}
                    title="Concluir"
                  >
                    {concluindo === item.id ? <CheckCircle2 className="w-[18px] h-[18px]" /> : <Circle className="w-[18px] h-[18px]" />}
                  </button>
                  <button onClick={() => setAberto(item.id)} className="flex-1 min-w-0 text-left">
                    <span className={cn("block text-sm", concluindo === item.id ? "text-muted-foreground line-through" : "text-foreground")}>{item.titulo}</span>
                    {item.notas && <span className="block text-xs text-muted-foreground truncate">{item.notas}</span>}
                  </button>
                  <button
                    onClick={() => setMoverDe(moverDe === item.id ? null : item.id)}
                    className={cn("shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border", moverDe === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
                    title="Mover para projeto"
                  >
                    <FolderInput className="w-3.5 h-3.5" /> Mover
                  </button>
                  {moverDe === item.id && (
                    <InboxMoverMenu
                      itemId={item.id}
                      onFechar={() => setMoverDe(null)}
                      onMovido={(r) => {
                        setMoverDe(null);
                        setItens((prev) => prev.filter((i) => i.id !== item.id));
                        setAviso(`“${item.titulo}” virou atividade em ${r.projetoNome}.`);
                        router.push(`/projetos/${r.projetoId}?tarefa=${r.tarefaId}`);
                      }}
                    />
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Item expandido (cartão do Things): título + notas editáveis, salva ao sair
// do campo; rodapé com Mover / Excluir / Fechar.
function ItemAberto({
  item, concluindo, moverAberto, onToggleMover, onFecharMover, onConcluir, onExcluir, onSalvar, onFechar, onMovido,
}: {
  item: InboxItemDTO;
  concluindo: boolean;
  moverAberto: boolean;
  onToggleMover: () => void;
  onFecharMover: () => void;
  onConcluir: () => void;
  onExcluir: () => void;
  onSalvar: (data: { titulo?: string; notas?: string | null }) => void;
  onFechar: () => void;
  onMovido: (r: { tarefaId: string; projetoId: string; projetoNome: string }) => void;
}) {
  const [titulo, setTitulo] = useState(item.titulo);
  const [notas, setNotas] = useState(item.notas ?? "");
  const tituloRef = useRef<HTMLInputElement>(null);

  useEffect(() => { tituloRef.current?.focus(); }, []);

  function salvarTitulo() {
    const t = titulo.trim();
    if (!t) { setTitulo(item.titulo); return; }
    if (t !== item.titulo) onSalvar({ titulo: t });
  }
  function salvarNotas() {
    const n = notas.trim();
    if (n !== (item.notas ?? "")) onSalvar({ notas: n || null });
  }

  return (
    <div className="relative px-4 py-3 bg-muted/40 ring-1 ring-inset ring-info/30 rounded-lg m-1">
      <div className="flex items-start gap-3">
        <button
          onClick={onConcluir}
          className={cn("mt-1 shrink-0 transition-colors", concluindo ? "text-info" : "text-muted-foreground/50 hover:text-info")}
          title="Concluir"
        >
          {concluindo ? <CheckCircle2 className="w-[18px] h-[18px]" /> : <Circle className="w-[18px] h-[18px]" />}
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            ref={tituloRef}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); salvarTitulo(); onFechar(); }
              if (e.key === "Escape") { e.preventDefault(); onFechar(); }
            }}
            className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
          />
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={salvarNotas}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onFechar(); } }}
            placeholder="Notas"
            rows={3}
            className="w-full bg-transparent text-sm text-foreground outline-none resize-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 pl-[30px]">
        <div className="relative">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onToggleMover}>
            <FolderInput className="w-3.5 h-3.5" /> Mover para projeto
          </Button>
          {moverAberto && <InboxMoverMenu itemId={item.id} align="left" onFechar={onFecharMover} onMovido={onMovido} />}
        </div>
        <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-danger hover:text-danger" onClick={onExcluir}>
          <Trash2 className="w-3.5 h-3.5" /> Excluir
        </Button>
        <Button size="sm" variant="ghost" className="h-8 ml-auto" onClick={onFechar}>Fechar</Button>
      </div>
    </div>
  );
}
