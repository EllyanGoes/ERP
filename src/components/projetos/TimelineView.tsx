"use client";

// Linha do tempo — barras dataInicio→prazo agrupadas por responsável (Gantt leve).
// Edição direta: arrastar a barra move as duas datas; arrastar as bordas muda
// início/entrega; clicar num dia da linha de uma tarefa sem datas cria o prazo.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AvatarUsuario } from "./comum";
import { TarefaResumoDTO, diaPrazo } from "./tipos";

const DIA_MS = 86_400_000;

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

export default function TimelineView({
  tarefas, podeEditar = false, onAbrirTarefa, onRecarregar,
}: {
  tarefas: TarefaResumoDTO[];
  podeEditar?: boolean;
  onAbrirTarefa: (id: string) => void;
  onRecarregar?: () => void;
}) {
  const [zoom, setZoom] = useState<"semana" | "mes">("mes");
  const diaPx = zoom === "semana" ? 36 : 14;
  const [arraste, setArraste] = useState<Arraste | null>(null);
  // Datas já soltas e ainda não devolvidas pelo servidor (evita a barra "pular"
  // de volta enquanto o quadro recarrega).
  const [pendentes, setPendentes] = useState<Record<string, { inicio: string; fim: string }>>({});
  useEffect(() => { setPendentes({}); }, [tarefas]);
  const arrasteRef = useRef<Arraste | null>(null);

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

  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-16">Nenhuma tarefa com datas — defina início/prazo nos cartões.</p>;
  }

  // Janela: cobre as tarefas e sempre o entorno de hoje (espaço p/ arrastar).
  const tempos = [...comData.flatMap((t) => [t.inicio.getTime(), t.fim.getTime()]), hoje.getTime()];
  const minData = somaDias(new Date(Math.min(...tempos)), -7);
  const maxData = somaDias(new Date(Math.max(...tempos)), 45);
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

  // Agrupa por responsável
  const grupos = new Map<string, { nome: string; tarefas: Linha[] }>();
  for (const t of linhas) {
    const primeiro = t.membros[0];
    const k = primeiro?.id ?? "__sem__";
    const g = grupos.get(k) ?? { nome: primeiro?.nome ?? "Sem responsável", tarefas: [] };
    g.tarefas.push(t);
    grupos.set(k, g);
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
  // Régua de dias: todo dia na semana; só as segundas no mês (14px por dia).
  const dias = Array.from({ length: totalDias }, (_, i) => somaDias(minData, i));

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(["semana", "mes"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn("px-2.5 py-1.5 capitalize", zoom === z ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:bg-muted")}
            >
              {z === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{comData.length} tarefa{comData.length !== 1 ? "s" : ""} com datas</span>
        {podeEditar && (
          <span className="text-xs text-muted-foreground ml-auto">
            Arraste a barra para mover · as bordas para mudar início/entrega · clique num dia para datar uma tarefa sem datas
          </span>
        )}
      </div>

      <div className="border border-border rounded-xl bg-card overflow-x-auto">
        <div style={{ minWidth: 224 + totalDias * diaPx }}>
          {/* Cabeçalho: meses + régua de dias */}
          <div className="flex border-b border-border bg-muted sticky top-0">
            <div className="w-56 shrink-0 px-3 py-1.5 text-xs font-semibold text-muted-foreground border-r border-border">Responsável / tarefa</div>
            <div className="relative flex-1" style={{ height: 44 }}>
              {meses.map((m, i) => (
                <span
                  key={i}
                  className="absolute top-0 flex items-center px-2 text-xs font-medium text-muted-foreground border-r border-border/60 capitalize overflow-hidden whitespace-nowrap"
                  style={{ left: m.off * diaPx, width: m.dias * diaPx, height: 24 }}
                >
                  {m.label}
                </span>
              ))}
              {dias.map((d, i) => {
                const mostra = zoom === "semana" || d.getDay() === 1;
                if (!mostra) return null;
                const ehHoje = i === offHoje;
                return (
                  <span
                    key={i}
                    className={cn(
                      "absolute text-[10px] text-center",
                      ehHoje ? "text-danger font-semibold" : d.getDay() === 0 || d.getDay() === 6 ? "text-muted-foreground/50" : "text-muted-foreground"
                    )}
                    style={{ left: i * diaPx, width: zoom === "semana" ? diaPx : diaPx * 2, top: 26 }}
                  >
                    {d.getDate()}
                  </span>
                );
              })}
            </div>
          </div>

          {Array.from(grupos.entries()).map(([k, g]) => (
            <div key={k}>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border/60">
                {k !== "__sem__" && <AvatarUsuario nome={g.nome} size="sm" />}
                <span className="text-xs font-semibold text-foreground">{g.nome}</span>
                <span className="text-[11px] text-muted-foreground">{g.tarefas.length}</span>
              </div>
              {g.tarefas
                .sort((a, b) => Number(b.temData) - Number(a.temData) || a.inicio.getTime() - b.inicio.getTime())
                .map((t) => {
                  const { inicio, fim } = intervalo(t);
                  const off = difDias(inicio, minData);
                  const dur = Math.max(1, difDias(fim, inicio) + 1);
                  const atrasada = !t.concluidaEm && fim < hoje;
                  const arrastando = arraste?.id === t.id && arraste.moveu;
                  return (
                    <div key={t.id} className="flex border-b border-border/40 hover:bg-muted/40">
                      <div className="w-56 shrink-0 px-3 py-1.5 text-xs text-foreground truncate border-r border-border cursor-pointer" onClick={() => onAbrirTarefa(t.id)} title={t.titulo}>
                        {t.titulo}
                      </div>
                      <div
                        className={cn("relative flex-1", podeEditar && !t.temData && "cursor-copy")}
                        style={{ height: 28 }}
                        onClick={(e) => marcarDia(e, t)}
                        title={podeEditar && !t.temData ? "Clique no dia para definir o prazo" : undefined}
                      >
                        {/* linha de hoje */}
                        {offHoje >= 0 && offHoje <= totalDias && (
                          <span className="absolute top-0 bottom-0 w-px bg-danger/50" style={{ left: offHoje * diaPx }} />
                        )}
                        {t.temData && (
                          <div
                            onPointerDown={(e) => iniciarArraste(e, t, "mover")}
                            onPointerMove={moverArraste}
                            onPointerUp={() => soltarArraste(t)}
                            onPointerCancel={() => { arrasteRef.current = null; setArraste(null); }}
                            onClick={() => { if (!podeEditar) onAbrirTarefa(t.id); }}
                            className={cn(
                              "group absolute top-1 h-5 rounded-md text-[10px] text-white px-1.5 truncate text-left select-none touch-none leading-5",
                              podeEditar ? (arrastando ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer",
                              arrastando && "ring-2 ring-info/60 shadow-md",
                              t.concluidaEm ? "bg-success/70" : atrasada ? "bg-danger/80" : "bg-blue-500/85 hover:bg-blue-600"
                            )}
                            style={{ left: off * diaPx, width: Math.max(diaPx, dur * diaPx) }}
                            title={`${t.titulo} — ${inicio.toLocaleDateString("pt-BR")} → ${fim.toLocaleDateString("pt-BR")}`}
                          >
                            {dur * diaPx > 60 ? t.titulo : ""}
                            {podeEditar && (
                              <>
                                {/* Bordas: início (esquerda) e entrega (direita) */}
                                <span
                                  onPointerDown={(e) => iniciarArraste(e, t, "inicio")}
                                  onPointerMove={moverArraste}
                                  onPointerUp={(e) => { e.stopPropagation(); soltarArraste(t); }}
                                  className="absolute left-0 top-0 h-full w-1.5 rounded-l-md cursor-ew-resize bg-white/0 group-hover:bg-white/40"
                                />
                                <span
                                  onPointerDown={(e) => iniciarArraste(e, t, "fim")}
                                  onPointerMove={moverArraste}
                                  onPointerUp={(e) => { e.stopPropagation(); soltarArraste(t); }}
                                  className="absolute right-0 top-0 h-full w-1.5 rounded-r-md cursor-ew-resize bg-white/0 group-hover:bg-white/40"
                                />
                              </>
                            )}
                          </div>
                        )}
                        {arrastando && (
                          <span
                            className="absolute -top-0.5 z-10 px-1.5 py-0.5 rounded bg-foreground text-background text-[10px] whitespace-nowrap pointer-events-none"
                            style={{ left: off * diaPx + Math.max(diaPx, dur * diaPx) + 6 }}
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
          ))}
        </div>
      </div>
    </div>
  );
}
