"use client";

// Quadro (kanban) dos processos por SITUAÇÃO, no padrão do Fluxo de Compras / TitulosKanban:
// colunas com pílula colorida, contagem e valor em discussão; cartão enxuto. Arrastar um cartão
// para outra coluna pede confirmação e muda a situação (o servidor registra o andamento
// "Situação alterada de X para Y").
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, Lock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { SITUACOES, diasAte, fmtBRL, fmtData, type LinhaProcesso } from "./comum";

export type CartaoProcesso = LinhaProcesso & { valorCausa?: string | number | null };

const COR: Record<string, string> = {
  EM_ANDAMENTO: "#3b82f6", AGUARDANDO_ORGAO: "#8b5cf6", AGUARDANDO_EMPRESA: "#f59e0b", SUSPENSO: "#64748b",
  ENCERRADO_FAVORAVEL: "#22c55e", ENCERRADO_DESFAVORAVEL: "#ef4444", ARQUIVADO: "#94a3b8",
};

export default function ProcessosKanban({ itens, situacoes, podeMover, onMover }: {
  itens: CartaoProcesso[];
  /** Colunas (chaves de SITUACOES) na ordem. */
  situacoes: string[];
  podeMover: boolean;
  /** Confirmado o arraste: grava a nova situação (a tela recarrega a lista). */
  onMover: (id: string, situacao: string) => Promise<void>;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [pendente, setPendente] = useState<{ p: CartaoProcesso; para: string } | null>(null);
  const [movendo, setMovendo] = useState(false);
  // Altura até o fim da janela (mesma técnica do TitulosKanban).
  const boxRef = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number | null>(null);
  useEffect(() => {
    const medir = () => {
      const el = boxRef.current;
      if (!el) return;
      setAltura(Math.max(420, Math.round(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 16)));
    };
    medir();
    window.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(document.body);
    return () => { window.removeEventListener("resize", medir); ro?.disconnect(); };
  }, []);

  const porColuna = new Map<string, CartaoProcesso[]>(situacoes.map((s) => [s, []]));
  for (const p of itens) porColuna.get(p.situacao)?.push(p);
  // Prazo mais próximo primeiro; sem prazo no fim.
  porColuna.forEach((l) => l.sort((a, b) => (a.proximoPrazo?.vence ?? "9999").localeCompare(b.proximoPrazo?.vence ?? "9999")));

  async function confirmar() {
    if (!pendente) return;
    setMovendo(true);
    await onMover(pendente.p.id, pendente.para);
    setMovendo(false); setPendente(null);
  }

  return (
    <>
      <div ref={boxRef} className={cn("flex items-start gap-3 overflow-x-auto pb-1 min-h-[420px]", altura == null && "h-[calc(100vh-220px)]")} style={altura != null ? { height: altura } : undefined}>
        {situacoes.map((s) => {
          const lista = porColuna.get(s) ?? [];
          const total = lista.reduce((t, p) => t + Number(p.valorCausa ?? 0), 0);
          const aceita = podeMover && !!arrastando && itens.find((p) => p.id === arrastando)?.situacao !== s;
          return (
            <div key={s}
              className={cn("flex-1 min-w-[260px] max-w-[360px] bg-muted/60 rounded-xl border flex flex-col max-h-full transition-colors", alvo === s && aceita ? "border-blue-500 ring-2 ring-blue-500/40 bg-blue-500/5" : "border-border")}
              onDragOver={(e) => { if (!aceita) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (alvo !== s) setAlvo(s); }}
              onDragLeave={(e) => { if (alvo === s && !e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null); }}
              onDrop={(e) => {
                if (!aceita) return;
                e.preventDefault();
                const p = itens.find((x) => x.id === arrastando);
                setArrastando(null); setAlvo(null);
                if (p) setPendente({ p, para: s });
              }}>
              <div className="flex items-center gap-2 px-3 py-2.5 shrink-0">
                <span className="font-semibold text-sm truncate rounded-md px-1.5 py-0.5 -my-0.5" style={{ backgroundColor: `${COR[s] ?? "#64748b"}1f`, color: COR[s] ?? "#64748b" }}>{SITUACOES[s]?.label ?? s}</span>
                <span className="text-xs text-muted-foreground">{lista.length}</span>
                {total > 0 && <span className="ml-auto text-xs font-semibold text-foreground tabular-nums" title="Valor em discussão">{fmtBRL(total)}</span>}
              </div>
              <div className="px-2 pb-2 space-y-2 overflow-y-auto flex-1 min-h-[6px]">
                {lista.length === 0 && <p className="text-xs text-muted-foreground/70 text-center py-4">Nenhum processo</p>}
                {lista.map((p) => {
                  const pr = p.proximoPrazo;
                  const venc = pr ? diasAte(pr.vence) : null;
                  return (
                    <div key={p.id} draggable={podeMover} className={cn(arrastando === p.id && "opacity-50")}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); setArrastando(p.id); }}
                      onDragEnd={() => { setArrastando(null); setAlvo(null); }}>
                      <Link href={`/processos/${p.id}`} className="block bg-card rounded-lg border border-border px-3 py-2.5 shadow-sm hover:border-blue-400 transition-colors">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-mono">{p.codigo}</span>
                          {p.confidencial && <Lock className="w-3 h-3" />}
                          {p.fase && <span className="truncate">· {p.fase}</span>}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2" title={p.titulo}>{p.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate" title={p.orgao}>{p.orgao}</p>
                        {pr && <p className={cn("mt-1 text-[11px] inline-flex items-center gap-1", venc! < 0 ? "text-danger font-semibold" : venc! <= pr.avisoDias ? "text-warning font-semibold" : "text-muted-foreground")} title={pr.descricao}>
                          <Clock className="w-3 h-3 shrink-0" />{fmtData(pr.vence)} · <span className="truncate max-w-[12rem]">{pr.descricao}</span></p>}
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 truncate"><User className="w-3 h-3 shrink-0" />{p.responsavel?.nome ?? "sem responsável"}</span>
                          {Number(p.valorCausa ?? 0) > 0 && <span className="ml-auto font-semibold text-foreground tabular-nums whitespace-nowrap">{fmtBRL(p.valorCausa)}</span>}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmDialog open={!!pendente} onOpenChange={(v) => !v && !movendo && setPendente(null)}
        title="Mudar a situação?"
        description={pendente ? `${pendente.p.codigo} — de "${SITUACOES[pendente.p.situacao]?.label ?? pendente.p.situacao}" para "${SITUACOES[pendente.para]?.label ?? pendente.para}". Fica registrado na linha do tempo.` : ""}
        onConfirm={confirmar} loading={movendo} confirmLabel="Mudar" variant="default" />
    </>
  );
}
