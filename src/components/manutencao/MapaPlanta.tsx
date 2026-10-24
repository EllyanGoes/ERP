"use client";

// Mapa da planta (docs/manutencao-prd.md §14, referência Tractian): as ÁREAS
// (nós LOCAL de 1º/2º nível) são blocos arrastáveis/redimensionáveis no canvas
// (posição salva em ManutAtivo.mapaX/Y/Largura/Altura, em % do canvas); dentro
// de cada bloco os equipamentos são ladrilhos coloridos pelo status derivado
// (GET /api/pcm/mapa). Clique no título = zoom na área (breadcrumb); clique no
// ladrilho = abrir ativo / OS. No celular vira lista de áreas com contadores.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AlertTriangle, Boxes, CheckCircle2, ChevronRight, CircleOff, CircleStop, ExternalLink, ImageOff, ImagePlus, Loader2, Maximize2, Move, RotateCcw, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { MapaResponse, NoMapa, StatusMapa } from "@/lib/manutencao/mapa";

// ── Status: cor (token do tema) + ícone + rótulo. Nunca só cor. ──────────────
const ORDEM: StatusMapa[] = ["PARADO", "EM_MANUTENCAO", "ATENCAO", "OK", "INATIVO"];
const PESO: Record<StatusMapa, number> = { PARADO: 0, EM_MANUTENCAO: 1, ATENCAO: 2, OK: 3, INATIVO: 4 };
const UI: Record<StatusMapa, { label: string; Icon: typeof Wrench; dot: string; tile: string; borda: string; texto: string }> = {
  PARADO:        { label: "Parado",        Icon: CircleStop,    dot: "bg-danger",  tile: "bg-danger/15 text-danger border-danger/40 hover:bg-danger/25",     borda: "border-l-danger",  texto: "text-danger" },
  EM_MANUTENCAO: { label: "Em manutenção", Icon: Wrench,        dot: "bg-info",    tile: "bg-info/15 text-info border-info/40 hover:bg-info/25",             borda: "border-l-info",    texto: "text-info" },
  ATENCAO:       { label: "Atenção",       Icon: AlertTriangle, dot: "bg-warning", tile: "bg-warning/15 text-warning border-warning/40 hover:bg-warning/25", borda: "border-l-warning", texto: "text-warning" },
  OK:            { label: "Operando",      Icon: CheckCircle2,  dot: "bg-success", tile: "bg-success/10 text-success border-success/30 hover:bg-success/20", borda: "border-l-success", texto: "text-success" },
  INATIVO:       { label: "Inativo",       Icon: CircleOff,     dot: "bg-muted-foreground/40", tile: "bg-muted text-muted-foreground border-border hover:bg-muted/70", borda: "border-l-border", texto: "text-muted-foreground" },
};
const PROBLEMA = new Set<StatusMapa>(["PARADO", "EM_MANUTENCAO", "ATENCAO"]);

type Rollup = { status: StatusMapa; osAbertas: number; contagem: Record<StatusMapa, number>; equipamentos: number };
type Bloco = { chave: string; no: NoMapa | null; titulo: string; tiles: NoMapa[]; subareas: NoMapa[] };
type Rect = { x: number; y: number; w: number; h: number };

const zeroContagem = (): Record<StatusMapa, number> => ({ PARADO: 0, EM_MANUTENCAO: 0, ATENCAO: 0, OK: 0, INATIVO: 0 });

export default function MapaPlanta({ telaCheia = false }: { telaCheia?: boolean }) {
  const router = useRouter();
  const [dados, setDados] = useState<MapaResponse | null>(null);
  const [erro, setErro] = useState("");
  const [foco, setFoco] = useState<string | null>(null);
  const [organizar, setOrganizar] = useState(false);
  const [soProblema, setSoProblema] = usePersistedState("pcm:mapa:so-problema", false);
  const [mobile, setMobile] = useState(false);
  const [posLocal, setPosLocal] = useState<Record<string, Rect>>({});
  const [salvando, setSalvando] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; no: NoMapa } | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number; no: NoMapa } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/pcm/mapa").catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) { setErro(j?.error || "Não foi possível carregar o mapa."); return; }
    setDados(j.data); setPosLocal({});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setMobile(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  // ── Árvore + roll-up (pior status dos descendentes, soma de OS) ───────────
  const { porId, filhos, rollup } = useMemo(() => {
    const porId = new Map<string, NoMapa>();
    const filhos = new Map<string, NoMapa[]>();
    for (const n of dados?.nos ?? []) porId.set(n.id, n);
    for (const n of dados?.nos ?? []) {
      const pai = n.paiId && porId.has(n.paiId) ? n.paiId : "";
      const lista = filhos.get(pai) ?? []; lista.push(n); filhos.set(pai, lista);
    }
    const rollup = new Map<string, Rollup>();
    const calc = (n: NoMapa, trilha: Set<string>): Rollup => {
      const memo = rollup.get(n.id); if (memo) return memo;
      const r: Rollup = { status: n.status, osAbertas: n.osAbertas, contagem: zeroContagem(), equipamentos: 0 };
      if (n.tipo !== "LOCAL") { r.contagem[n.status]++; r.equipamentos++; }
      if (!trilha.has(n.id)) {
        trilha.add(n.id);
        for (const f of filhos.get(n.id) ?? []) {
          const rf = calc(f, trilha);
          if (PESO[rf.status] < PESO[r.status]) r.status = rf.status;
          r.osAbertas += rf.osAbertas; r.equipamentos += rf.equipamentos;
          for (const s of ORDEM) r.contagem[s] += rf.contagem[s];
        }
      }
      rollup.set(n.id, r);
      return r;
    };
    for (const n of dados?.nos ?? []) calc(n, new Set());
    return { porId, filhos, rollup };
  }, [dados]);

  /** Equipamentos "de primeiro nível" do nó: não-LOCAL cujo caminho até `id` só passa por LOCAL. */
  const tilesDe = useCallback((id: string, pularLocais: boolean): NoMapa[] => {
    const out: NoMapa[] = [];
    const walk = (pid: string, prof: number) => {
      for (const f of filhos.get(pid) ?? []) {
        if (f.tipo === "LOCAL") { if (!pularLocais && prof < 12) walk(f.id, prof + 1); }
        else out.push(f);
      }
    };
    walk(id, 0);
    return out.sort((a, b) => PESO[rollup.get(a.id)!.status] - PESO[rollup.get(b.id)!.status] || a.tag.localeCompare(b.tag, "pt-BR"));
  }, [filhos, rollup]);

  // ── Blocos (áreas) do nível em foco ───────────────────────────────────────
  const blocos = useMemo<Bloco[]>(() => {
    if (!dados) return [];
    const out: Bloco[] = [];
    const blocoDe = (n: NoMapa, pularLocais = false): Bloco => ({ chave: n.id, no: n, titulo: n.nome, tiles: tilesDe(n.id, pularLocais), subareas: (filhos.get(n.id) ?? []).filter((f) => f.tipo === "LOCAL") });
    if (foco === null) {
      const soltos: NoMapa[] = [];
      for (const r of filhos.get("") ?? []) {
        if (r.tipo !== "LOCAL") { soltos.push(r); continue; }
        const locais = (filhos.get(r.id) ?? []).filter((f) => f.tipo === "LOCAL");
        if (locais.length === 0) { out.push(blocoDe(r)); continue; }
        // raiz "PLANTA FABRIL": as áreas filhas viram blocos; equipamentos diretos ficam num bloco da raiz
        for (const l of locais) out.push(blocoDe(l));
        const diretos = tilesDe(r.id, true);
        if (diretos.length) out.push({ chave: r.id, no: r, titulo: r.nome, tiles: diretos, subareas: [] });
      }
      if (soltos.length) out.push({ chave: "__soltos", no: null, titulo: "Sem área definida", tiles: soltos.sort((a, b) => PESO[rollup.get(a.id)!.status] - PESO[rollup.get(b.id)!.status] || a.tag.localeCompare(b.tag, "pt-BR")), subareas: [] });
    } else {
      const n = porId.get(foco);
      if (!n) return [];
      const fs = filhos.get(n.id) ?? [];
      for (const l of fs.filter((f) => f.tipo === "LOCAL")) out.push(blocoDe(l));
      const diretos = fs.filter((f) => f.tipo !== "LOCAL").sort((a, b) => PESO[rollup.get(a.id)!.status] - PESO[rollup.get(b.id)!.status] || a.tag.localeCompare(b.tag, "pt-BR"));
      if (diretos.length || out.length === 0) out.push({ chave: `${n.id}__diretos`, no: null, titulo: n.tipo === "LOCAL" ? `Equipamentos de ${n.nome}` : `Componentes de ${n.nome}`, tiles: diretos, subareas: [] });
    }
    return out;
  }, [dados, foco, filhos, porId, rollup, tilesDe]);

  // Trilha do foco (planta › área › …)
  const trilha = useMemo(() => {
    const out: NoMapa[] = [];
    let cur = foco ? porId.get(foco) : undefined;
    for (let i = 0; cur && i < 12; i++) { out.unshift(cur); cur = cur.paiId ? porId.get(cur.paiId) : undefined; }
    return out;
  }, [foco, porId]);

  // ── Layout: posição salva (só no nível da planta) ou grade automática ─────
  const GAP = 1.5;
  const rects = useMemo(() => {
    const out = new Map<string, Rect>();
    const semPos: Bloco[] = [];
    for (const b of blocos) {
      const local = posLocal[b.chave];
      const n = b.no;
      if (local) out.set(b.chave, local);
      else if (foco === null && n && n.mapaX != null && n.mapaY != null && n.mapaLargura != null && n.mapaAltura != null) out.set(b.chave, { x: n.mapaX, y: n.mapaY, w: n.mapaLargura, h: n.mapaAltura });
      else semPos.push(b);
    }
    // grade p/ os sem posição: ocupa as linhas abaixo do que já está posicionado
    const n = semPos.length;
    if (n) {
      const cols = n <= 2 ? n : n <= 6 ? 3 : 4;
      const rows = Math.ceil(n / cols);
      let yIni = 0;
      out.forEach((r) => { yIni = Math.max(yIni, r.y + r.h + GAP); });
      const alturaDisp = Math.max(100 - yIni, 30);
      const h = Math.max(alturaDisp / rows - GAP, 12);
      const w = (100 - GAP * (cols - 1)) / cols;
      semPos.forEach((b, i) => out.set(b.chave, { x: (i % cols) * (w + GAP), y: yIni + Math.floor(i / cols) * (h + GAP), w, h }));
    }
    return out;
  }, [blocos, posLocal, foco]);
  const linhasGrade = Math.max(1, Math.ceil(blocos.length / (blocos.length <= 2 ? Math.max(1, blocos.length) : blocos.length <= 6 ? 3 : 4)));
  const alturaCanvas = telaCheia ? "calc(100vh - 230px)" : `${Math.max(2, linhasGrade) * 210}px`;

  // ── Arrastar / redimensionar (modo organizar) ─────────────────────────────
  const dragRef = useRef<{ chave: string; id: string; modo: "mover" | "redimensionar"; x0: number; y0: number; rect: Rect; cw: number; ch: number; atual: Rect } | null>(null);
  const iniciarDrag = (e: React.PointerEvent, b: Bloco, modo: "mover" | "redimensionar") => {
    if (!organizar || !b.no || foco !== null) return;
    const canvas = canvasRef.current; const rect = rects.get(b.chave);
    if (!canvas || !rect) return;
    e.preventDefault(); e.stopPropagation();
    const cr = canvas.getBoundingClientRect();
    dragRef.current = { chave: b.chave, id: b.no.id, modo, x0: e.clientX, y0: e.clientY, rect, cw: cr.width, ch: cr.height, atual: rect };
    const mover = (ev: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const dx = ((ev.clientX - d.x0) / d.cw) * 100, dy = ((ev.clientY - d.y0) / d.ch) * 100;
      let r: Rect;
      if (d.modo === "mover") r = { ...d.rect, x: Math.min(100 - d.rect.w, Math.max(0, d.rect.x + dx)), y: Math.min(100 - d.rect.h, Math.max(0, d.rect.y + dy)) };
      else r = { ...d.rect, w: Math.min(100 - d.rect.x, Math.max(12, d.rect.w + dx)), h: Math.min(100 - d.rect.y, Math.max(12, d.rect.h + dy)) };
      d.atual = r;
      setPosLocal((p) => ({ ...p, [d.chave]: r }));
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar);
      const d = dragRef.current; dragRef.current = null;
      if (d && d.atual !== d.rect) salvarPos(d.id, d.atual);
    };
    window.addEventListener("pointermove", mover); window.addEventListener("pointerup", soltar);
  };
  const salvarPos = async (id: string, r: Rect | null) => {
    setSalvando(true);
    const body = r ? { id, mapaX: r.x, mapaY: r.y, mapaLargura: r.w, mapaAltura: r.h } : { id, mapaX: null, mapaY: null, mapaLargura: null, mapaAltura: null };
    const res = await fetch("/api/pcm/mapa", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSalvando(false);
    if (!res?.ok) setErro("Não foi possível salvar a posição.");
  };
  const limparLayout = async () => {
    const ids = blocos.filter((b) => b.no && (b.no.mapaX != null || posLocal[b.chave])).map((b) => b.no!.id);
    if (!ids.length) return;
    setSalvando(true);
    await fetch("/api/pcm/mapa", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: ids.map((id) => ({ id, mapaX: null, mapaY: null, mapaLargura: null, mapaAltura: null })) }) }).catch(() => null);
    setSalvando(false);
    carregar();
  };

  // ── Planta baixa (imagem de fundo) ────────────────────────────────────────
  const enviarPlanta = async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    setSalvando(true);
    const res = await fetch("/api/pcm/mapa/planta", { method: "POST", body: fd }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setSalvando(false);
    if (!res?.ok) { setErro(j?.error || "Não foi possível enviar a planta."); return; }
    carregar();
  };
  const removerPlanta = async () => {
    setSalvando(true);
    await fetch("/api/pcm/mapa/planta", { method: "DELETE" }).catch(() => null);
    setSalvando(false);
    carregar();
  };

  // ── Ações do ladrilho ─────────────────────────────────────────────────────
  const abrirAtivo = (n: NoMapa) => router.push(`/pcm/ativos?ativo=${n.codApl}`);
  const clicarTile = (e: React.MouseEvent, n: NoMapa) => {
    const r = rollup.get(n.id)!;
    const temFilhos = (filhos.get(n.id) ?? []).length > 0;
    if (!n.osPrincipal && r.osAbertas === 0 && !temFilhos) { abrirAtivo(n); return; }
    setTooltip(null);
    setPopover({ x: e.clientX, y: e.clientY, no: n });
  };
  useEffect(() => {
    if (!popover) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setPopover(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [popover]);

  const totais = useMemo(() => {
    const c = zeroContagem();
    for (const n of dados?.nos ?? []) if (n.tipo !== "LOCAL") c[n.status]++;
    return c;
  }, [dados]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (erro && !dados) return <p className="text-sm text-danger">{erro}</p>;
  if (!dados) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const cabecalho = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* Breadcrumb planta › área › equipamento */}
      <nav className="flex items-center gap-1 text-sm min-w-0 flex-1">
        <button onClick={() => setFoco(null)} className={cn("hover:underline", foco === null ? "font-semibold text-foreground" : "text-muted-foreground")}>Planta</button>
        {trilha.map((n) => (
          <span key={n.id} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <button onClick={() => setFoco(n.id)} className={cn("truncate hover:underline", n.id === foco ? "font-semibold text-foreground" : "text-muted-foreground")}>{n.nome}</button>
          </span>
        ))}
      </nav>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
        <input type="checkbox" className="accent-[hsl(var(--info))]" checked={soProblema} onChange={(e) => setSoProblema(e.target.checked)} />
        Só com problema
      </label>
      {!mobile && (
        <button
          onClick={() => { setOrganizar((v) => !v); setFoco(null); }}
          className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border", organizar ? "bg-info/10 text-info border-info/40" : "border-border text-muted-foreground hover:bg-muted")}
          title="Arraste os blocos pelo título e redimensione pelo canto; a posição fica salva para todos"
        >
          <Move className="w-3.5 h-3.5" /> {organizar ? "Concluir" : "Organizar"}
        </button>
      )}
      {organizar && (
        <>
          <button onClick={limparLayout} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted" title="Volta todos os blocos para a grade automática"><RotateCcw className="w-3.5 h-3.5" /> Grade automática</button>
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted" title="Imagem da planta baixa como fundo do mapa (JPEG/PNG/WebP/SVG)"><ImagePlus className="w-3.5 h-3.5" /> {dados.plantaUrl ? "Trocar planta baixa" : "Planta baixa"}</button>
          {dados.plantaUrl && <button onClick={removerPlanta} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"><ImageOff className="w-3.5 h-3.5" /> Remover fundo</button>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarPlanta(f); e.target.value = ""; }} />
        </>
      )}
      {salvando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {!telaCheia && !mobile && <Link href="/pcm/mapa" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted" title="Mapa em tela cheia"><Maximize2 className="w-3.5 h-3.5" /> Tela cheia</Link>}
    </div>
  );

  const legenda = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {ORDEM.map((s) => { const u = UI[s]; return (
        <span key={s} className="inline-flex items-center gap-1.5"><span className={cn("w-2.5 h-2.5 rounded-sm", u.dot)} /><u.Icon className={cn("w-3.5 h-3.5", u.texto)} />{u.label} <b className="text-foreground tabular-nums">{totais[s]}</b></span>
      ); })}
      {erro && <span className="text-danger">{erro}</span>}
    </div>
  );

  // ── Celular: lista de áreas com contadores ────────────────────────────────
  if (mobile) {
    return (
      <div className="space-y-3">
        {cabecalho}
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {blocos.map((b) => {
            const r = b.no ? rollup.get(b.no.id)! : agregar(b.tiles, rollup);
            const problemas = r.contagem.PARADO + r.contagem.EM_MANUTENCAO + r.contagem.ATENCAO;
            if (soProblema && problemas === 0) return null;
            return (
              <li key={b.chave}>
                <button onClick={() => b.no && setFoco(b.no.id)} disabled={!b.no} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", UI[r.status].dot)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{b.titulo}</span>
                    <span className="block text-[11px] text-muted-foreground"><Contadores c={r.contagem} /> · {r.equipamentos} equip.{r.osAbertas ? ` · ${r.osAbertas} OS` : ""}</span>
                  </span>
                  {b.no && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
                {/* no nível em foco, os equipamentos diretos aparecem como linhas */}
                {!b.no && b.tiles.filter((t) => !soProblema || PROBLEMA.has(rollup.get(t.id)!.status)).map((t) => {
                  const rt = rollup.get(t.id)!; const u = UI[rt.status];
                  return (
                    <button key={t.id} onClick={() => (t.osPrincipal ? router.push(`/pcm/os?os=${t.osPrincipal.id}`) : abrirAtivo(t))} className="w-full flex items-center gap-3 pl-8 pr-3 py-2 text-left border-t border-border/60">
                      <u.Icon className={cn("w-4 h-4 shrink-0", u.texto)} />
                      <span className="flex-1 min-w-0"><span className="font-mono text-xs">{t.tag}</span> <span className="text-sm">{t.nome}</span><span className="block text-[11px] text-muted-foreground">{u.label}{t.motivo ? ` · ${t.motivo}` : ""}{rt.osAbertas ? ` · ${rt.osAbertas} OS aberta(s)` : ""}</span></span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>
        {legenda}
      </div>
    );
  }

  // ── Canvas ────────────────────────────────────────────────────────────────
  const grande = foco !== null; // ladrilhos maiores no zoom
  return (
    <div className="space-y-3">
      {cabecalho}
      <div
        ref={canvasRef}
        className={cn("relative w-full rounded-xl border border-border bg-muted/30 overflow-hidden select-none", organizar && "ring-2 ring-info/40")}
        style={{ height: alturaCanvas }}
        onClick={() => setPopover(null)}
      >
        {dados.plantaUrl && foco === null && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dados.plantaUrl} alt="Planta baixa" className="absolute inset-0 w-full h-full object-contain opacity-40 dark:opacity-30 pointer-events-none" />
        )}
        {blocos.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Nenhum ativo cadastrado. <Link href="/pcm/ativos" className="ml-1 text-info hover:underline">Cadastrar</Link></p>}
        {blocos.map((b) => {
          const rect = rects.get(b.chave)!;
          const r = b.no ? rollup.get(b.no.id)! : agregar(b.tiles, rollup);
          const u = UI[r.status];
          const tiles = soProblema ? b.tiles.filter((t) => PROBLEMA.has(rollup.get(t.id)!.status)) : b.tiles;
          const apagado = soProblema && tiles.length === 0 && r.contagem.PARADO + r.contagem.EM_MANUTENCAO + r.contagem.ATENCAO === 0;
          const movivel = organizar && !!b.no && foco === null;
          return (
            <div
              key={b.chave}
              className={cn("absolute flex flex-col rounded-lg border border-border border-l-4 bg-card/95 backdrop-blur-[2px] shadow-sm overflow-hidden transition-opacity", u.borda, apagado && "opacity-40", movivel && "ring-1 ring-info/50")}
              style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
            >
              <div
                className={cn("flex items-center gap-2 px-2.5 py-1.5 border-b border-border/60 bg-card", movivel && "cursor-move")}
                onPointerDown={(e) => iniciarDrag(e, b, "mover")}
              >
                {b.no ? (
                  <button onClick={(e) => { e.stopPropagation(); if (!organizar) setFoco(b.no!.id); }} className="text-sm font-semibold truncate hover:underline text-left min-w-0" title={`Ver ${b.titulo}`}>{b.titulo}</button>
                ) : <span className="text-sm font-semibold truncate">{b.titulo}</span>}
                <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                  <Contadores c={r.contagem} />
                  <span className="inline-flex items-center gap-0.5 tabular-nums" title={`${r.equipamentos} equipamento(s)`}><Boxes className="w-3 h-3" />{r.equipamentos}</span>
                  {r.osAbertas > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-foreground tabular-nums" title="OS abertas">{r.osAbertas} OS</span>}
                </span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {b.subareas.length > 0 && foco === null && (
                  <p className="text-[10px] text-muted-foreground mb-1.5 truncate">{b.subareas.length} sub-área(s): {b.subareas.map((s) => s.nome).join(", ")}</p>
                )}
                {tiles.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">{soProblema ? "Tudo operando." : b.subareas.length ? "Equipamentos nas sub-áreas." : "Sem equipamentos."}</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {tiles.map((t) => <Tile key={t.id} no={t} rollup={rollup.get(t.id)!} grande={grande} temFilhos={(filhos.get(t.id) ?? []).length} onClick={clicarTile} onHover={setTooltip} />)}
                  </div>
                )}
              </div>
              {movivel && <div onPointerDown={(e) => iniciarDrag(e, b, "redimensionar")} className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize" title="Redimensionar"><span className="absolute right-1 bottom-1 w-2 h-2 border-r-2 border-b-2 border-info" /></div>}
            </div>
          );
        })}
      </div>
      {legenda}

      {tooltip && createPortal(
        <div className="fixed z-[80] pointer-events-none max-w-xs rounded-lg border border-border bg-popover text-popover-foreground shadow-lg px-3 py-2 text-xs" style={{ left: Math.min(tooltip.x + 12, window.innerWidth - 300), top: tooltip.y + 14 }}>
          <p className="font-mono text-[11px] text-muted-foreground">{tooltip.no.tag} · #{tooltip.no.codApl}</p>
          <p className="font-medium text-sm">{tooltip.no.nome}</p>
          <p className={cn("mt-1 inline-flex items-center gap-1", UI[rollup.get(tooltip.no.id)!.status].texto)}>{(() => { const I = UI[rollup.get(tooltip.no.id)!.status].Icon; return <I className="w-3.5 h-3.5" />; })()}{UI[rollup.get(tooltip.no.id)!.status].label}{rollup.get(tooltip.no.id)!.status !== tooltip.no.status && " (componente)"}</p>
          {tooltip.no.motivo && <p className="text-muted-foreground">{tooltip.no.motivo}</p>}
          <p className="text-muted-foreground">{rollup.get(tooltip.no.id)!.osAbertas} OS aberta(s){tooltip.no.criticidade ? ` · criticidade ${tooltip.no.criticidade}` : ""}</p>
          <p className="text-muted-foreground/70 mt-1">{caminhoDe(tooltip.no, porId)}</p>
        </div>, document.body)}

      {popover && createPortal(
        <div className="fixed inset-0 z-[90]" onClick={() => setPopover(null)}>
          <div className="absolute w-64 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl p-3 text-sm" style={{ left: Math.min(popover.x, window.innerWidth - 270), top: Math.min(popover.y + 8, window.innerHeight - 220) }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] text-muted-foreground">{popover.no.tag}</p>
                <p className="font-semibold leading-tight truncate">{popover.no.nome}</p>
                <p className={cn("text-xs mt-0.5", UI[rollup.get(popover.no.id)!.status].texto)}>{UI[rollup.get(popover.no.id)!.status].label}{popover.no.motivo ? ` · ${popover.no.motivo}` : ""}</p>
              </div>
              <button onClick={() => setPopover(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {popover.no.osPrincipal && (
                <Link href={`/pcm/os?os=${popover.no.osPrincipal.id}`} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-info/10 text-info hover:bg-info/20 text-xs font-medium"><Wrench className="w-3.5 h-3.5" /> Abrir OS {popover.no.osPrincipal.numero}{rollup.get(popover.no.id)!.osAbertas > 1 ? ` (+${rollup.get(popover.no.id)!.osAbertas - 1})` : ""}</Link>
              )}
              <button onClick={() => abrirAtivo(popover.no)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted text-xs text-left"><ExternalLink className="w-3.5 h-3.5" /> Abrir ativo</button>
              {(filhos.get(popover.no.id) ?? []).length > 0 && (
                <button onClick={() => { setFoco(popover.no.id); setPopover(null); }} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted text-xs text-left"><ChevronRight className="w-3.5 h-3.5" /> Ver componentes ({(filhos.get(popover.no.id) ?? []).length})</button>
              )}
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function Tile({ no, rollup, grande, temFilhos, onClick, onHover }: { no: NoMapa; rollup: Rollup; grande: boolean; temFilhos: number; onClick: (e: React.MouseEvent, n: NoMapa) => void; onHover: (t: { x: number; y: number; no: NoMapa } | null) => void }) {
  const u = UI[rollup.status];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e, no); }}
      onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY, no })}
      onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, no })}
      onMouseLeave={() => onHover(null)}
      className={cn("relative inline-flex items-center gap-1 rounded border font-mono leading-none transition-colors", u.tile, grande ? "h-9 px-2 text-xs max-w-[14rem]" : "h-6 px-1.5 text-[10px]")}
    >
      {grande && <u.Icon className="w-3.5 h-3.5 shrink-0" />}
      <span className="truncate">{no.tag}</span>
      {grande && <span className="truncate font-sans text-[11px] opacity-80">{no.nome}</span>}
      {rollup.osAbertas > 0 && <span className="rounded-full bg-background/80 px-1 text-[9px] font-semibold tabular-nums" title={`${rollup.osAbertas} OS aberta(s)`}>{rollup.osAbertas}</span>}
      {temFilhos > 0 && <span className="text-[9px] opacity-70" title={`${temFilhos} componente(s)`}>▸{temFilhos}</span>}
    </button>
  );
}

function Contadores({ c }: { c: Record<StatusMapa, number> }) {
  const itens = (["PARADO", "EM_MANUTENCAO", "ATENCAO"] as StatusMapa[]).filter((s) => c[s] > 0);
  if (!itens.length) return <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="w-3 h-3" /> ok</span>;
  return <>{itens.map((s) => { const I = UI[s].Icon; return <span key={s} className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", UI[s].texto)} title={UI[s].label}><I className="w-3 h-3" />{c[s]}</span>; })}</>;
}

/** Roll-up de um bloco sintético (sem nó próprio): agrega os ladrilhos. */
function agregar(tiles: NoMapa[], rollup: Map<string, Rollup>): Rollup {
  const r: Rollup = { status: "INATIVO", osAbertas: 0, contagem: zeroContagem(), equipamentos: 0 };
  if (!tiles.length) { r.status = "OK"; return r; }
  for (const t of tiles) {
    const rt = rollup.get(t.id)!;
    if (PESO[rt.status] < PESO[r.status]) r.status = rt.status;
    r.osAbertas += rt.osAbertas; r.equipamentos += rt.equipamentos;
    for (const s of ORDEM) r.contagem[s] += rt.contagem[s];
  }
  return r;
}

function caminhoDe(n: NoMapa, porId: Map<string, NoMapa>): string {
  const out: string[] = [];
  let cur = n.paiId ? porId.get(n.paiId) : undefined;
  for (let i = 0; cur && i < 12; i++) { out.unshift(cur.nome); cur = cur.paiId ? porId.get(cur.paiId) : undefined; }
  return out.join(" › ");
}
