"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  CircleDot,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Search,
  Settings,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { podeAcessarInvestimentos } from "@/lib/investimentos-acesso";
import { mainModules, configModule, allModules, type NavItem, type SubSection, type Module } from "@/lib/nav-menu";
import { useBarraModulos } from "@/lib/ui-prefs";
import { corDoModulo, corDoModuloFundoEscuro } from "@/lib/modulo-cores";
import { usePersistedState } from "@/lib/use-persisted-state";
import { ProgressoCirculo } from "@/components/projetos/comum";

// ── Seletor de módulo (barra de módulos oculta) ───────────────────────────────
// O nome do módulo no topo do painel abre a lista: busca, recentes, todos e
// Configurações. Substitui a faixa de ícones para quem preferir ocultá-la.
function SeletorModulo({
  atual, modulos, config, onEscolher, onDashboard,
}: {
  atual: Module;
  modulos: Module[];
  config: Module | null;
  onEscolher: (id: string) => void;
  onDashboard: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  // ⌘. (Ctrl+. no Windows) abre a lista de qualquer lugar.
  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener("modulos:abrir-seletor", abrir);
    return () => window.removeEventListener("modulos:abrir-seletor", abrir);
  }, []);
  const [recentes] = usePersistedState<string[]>("ui:modulos-recentes", []);
  const termo = busca.trim().toLowerCase();
  const filtrados = modulos.filter((m) => !termo || m.label.toLowerCase().includes(termo));
  const listaRecentes = termo ? [] : recentes
    .map((id) => modulos.find((m) => m.id === id))
    .filter((m): m is Module => !!m && m.id !== atual.id)
    .slice(0, 3);

  const escolher = (id: string) => { setAberto(false); setBusca(""); onEscolher(id); };
  // Ordem exibida (recentes primeiro): os 9 primeiros ganham o atalho 1–9.
  const ordem = [...listaRecentes, ...filtrados.filter((m) => !listaRecentes.includes(m))];
  const atalho = (m: Module) => { const i = ordem.indexOf(m); return i >= 0 && i < 9 ? i + 1 : null; };
  const Item = ({ m }: { m: Module }) => (
    <button
      type="button"
      onClick={() => escolher(m.id)}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left rounded-md hover:bg-muted",
        m.id === atual.id ? "font-medium text-foreground" : "text-foreground",
      )}
    >
      <m.icon className={cn("w-4 h-4 shrink-0", corDoModulo(m.id))} />
      <span className="flex-1 truncate">{m.label}</span>
      {m.id === atual.id
        ? <Check className="w-3.5 h-3.5 text-primary" />
        : atalho(m) && <kbd className="text-[10px] text-muted-foreground/70 font-sans">{atalho(m)}</kbd>}
    </button>
  );

  return (
    <div className="flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 max-w-full rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted"
        title="Trocar de módulo (⌘. / Ctrl+.)"
      >
        <atual.icon className={cn("w-4 h-4 shrink-0", corDoModulo(atual.id))} />
        <span className="font-semibold text-foreground text-sm truncate">{atual.label}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", aberto && "rotate-180")} />
        <kbd className="ml-1 hidden sm:inline text-[10px] text-muted-foreground/60 font-sans">{typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘." : "Ctrl ."}</kbd>
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setAberto(false)} />
          {/* Mesma largura da barra (o painel corta o que passa da borda). */}
          {/* Busca fixa no topo e Configurações fixa no rodapé — só a lista de
              módulos rola. */}
          <div className="absolute left-2 right-2 top-full mt-1 z-50 max-h-[75vh] flex flex-col rounded-xl border border-border bg-popover shadow-xl p-1.5">
            <div className="relative mb-1 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAberto(false);
                  if (e.key === "Enter" && filtrados[0]) escolher(filtrados[0].id);
                  // Números escolhem direto (com a busca vazia).
                  if (!busca && /^[1-9]$/.test(e.key) && ordem[Number(e.key) - 1]) {
                    e.preventDefault();
                    escolher(ordem[Number(e.key) - 1].id);
                  }
                }}
                placeholder="Buscar módulo…"
                className="w-full h-8 pl-8 pr-2 rounded-md bg-muted/60 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
            {listaRecentes.length > 0 && (
              <>
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground/70">Recentes</p>
                {listaRecentes.map((m) => <Item key={`r-${m.id}`} m={m} />)}
                <div className="my-1 border-t border-border" />
              </>
            )}
            {!termo && (
              <button
                type="button"
                onClick={() => { setAberto(false); onDashboard(); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left rounded-md hover:bg-muted text-foreground"
              >
                <LayoutDashboard className="w-4 h-4 shrink-0 text-muted-foreground" /> Dashboard
              </button>
            )}
            {filtrados.map((m) => <Item key={m.id} m={m} />)}
            {filtrados.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum módulo encontrado.</p>}
            </div>
            {config && !termo && (
              <div className="shrink-0">
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => escolher(config.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left rounded-md hover:bg-muted text-foreground"
                >
                  <Settings className="w-4 h-4 shrink-0 text-muted-foreground" /> Configurações
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Future modules (strip-only, no panel, disabled) ───────────────────────────
const futureModules: { id: string; label: string; icon: LucideIcon }[] = [];

const STRIP_W       = 64;
const PANEL_MIN       = 160;
const PANEL_MAX       = 400;
const PANEL_DEFAULT   = 220;
const PANEL_COLLAPSE  = 100; // abaixo disso, fecha o painel completamente

function moduleIsActive(mod: Module, pathname: string) {
  return mod.sections.some((s) =>
    s.items.some((item) => !item.soon && pathname.startsWith(item.href))
  );
}

function itemIsActive(item: NavItem, pathname: string) {
  if (item.soon) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

const kindStyle: Record<SubSection["kind"], string> = {
  Cadastros:          "text-violet-500 dark:text-violet-400",
  Processos:          "text-blue-500 dark:text-blue-400",
  Estoque:            "text-emerald-500 dark:text-emerald-400",
  "Fluxo de Compras": "text-amber-500 dark:text-amber-400",
  Almoxarifado:       "text-emerald-500 dark:text-emerald-400",
  Relatórios:         "text-rose-500 dark:text-rose-400",
  Sistema:            "text-gray-400 dark:text-muted-foreground",
  Comercial:          "text-blue-500 dark:text-blue-400",
  Geral:              "text-blue-500 dark:text-blue-400",
  Compras:            "text-amber-500 dark:text-amber-400",
  Financeiro:         "text-emerald-600 dark:text-emerald-400",
  Configurações:      "text-purple-500 dark:text-purple-400",
  "Aprovações":       "text-emerald-600 dark:text-emerald-400",
  "Manutenção":       "text-orange-500 dark:text-orange-400",
  "Produção":         "text-cyan-500 dark:text-cyan-400",
  "Estrutura":        "text-indigo-500 dark:text-indigo-400",
  "Planejamento/Apontamento":     "text-cyan-500 dark:text-cyan-400",
  "Outros":           "text-gray-400 dark:text-muted-foreground",
  "Inteligência Comercial": "text-fuchsia-500 dark:text-fuchsia-400",
  "Funis & Leads":    "text-pink-500 dark:text-pink-400",
};

// ── Projetos em andamento (toggle no painel do módulo Projetos) ───────────────

function ProjetosEmAndamento() {
  const pathname = usePathname();
  const router = useRouter();
  const { attemptNavigate } = useDirtyFormContext();
  const [open, setOpen] = usePersistedState<boolean>("sidebar:projetos:emAndamento", false);
  const [projetos, setProjetos] = useState<{ id: string; nome: string; cor: string | null; tarefasAbertas: number; tarefasConcluidas: number }[] | null>(null);

  // Carrega ao abrir (recarrega a cada abertura p/ refletir projetos novos).
  useEffect(() => {
    if (!open) return;
    let ativo = true;
    fetch("/api/projetos")
      .then((r) => r.json())
      .then((j) => {
        if (!ativo) return;
        const lista = (Array.isArray(j.data) ? j.data : [])
          .filter((p: { situacao?: string | null }) => (p.situacao ?? "EM_ANDAMENTO") === "EM_ANDAMENTO")
          .map((p: { id: string; nome: string; cor: string | null; tarefasAbertas: number; tarefasConcluidas: number }) =>
            ({ id: p.id, nome: p.nome, cor: p.cor, tarefasAbertas: p.tarefasAbertas, tarefasConcluidas: p.tarefasConcluidas }));
        setProjetos(lista);
      })
      .catch(() => { if (ativo) setProjetos([]); });
    return () => { ativo = false; };
  }, [open]);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 mb-1 text-[10px] font-bold uppercase tracking-widest transition-colors",
          kindStyle.Geral, "hover:opacity-80",
        )}
      >
        <span className="truncate">Em andamento</span>
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
      </button>
      {open && (
        projetos === null ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Carregando...</p>
        ) : projetos.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum projeto em andamento.</p>
        ) : (
          projetos.map((p) => {
            const active = pathname === `/projetos/${p.id}` || pathname.startsWith(`/projetos/${p.id}/`);
            return (
              <button
                key={p.id}
                onClick={() => attemptNavigate(() => router.push(`/projetos/${p.id}`))}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <ProgressoCirculo
                  concluidas={p.tarefasConcluidas}
                  total={p.tarefasAbertas + p.tarefasConcluidas}
                  cor={p.cor}
                  size={16}
                />
                <span className="truncate flex-1 text-left">{p.nome}</span>
              </button>
            );
          })
        )
      )}
    </div>
  );
}

// ── Tooltip wrapper (portal-based) ────────────────────────────────────────────

function StripTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref      = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.top + r.height / 2, left: r.right + 8 });
    }
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }

  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {mounted && visible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
        >
          <div className="bg-popover text-popover-foreground text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.10)] border border-border">
            {label}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { attemptNavigate } = useDirtyFormContext();
  const { user, canAccess } = useSession();

  // ── Badge de aprovações pendentes (alimenta o item "Minhas Aprovações") ──
  // O sino/painel de notificações migrou p/ o topo (NotificationCenter no TabBar).

  // Visible main modules (exclude admin)
  // Investimentos: carteira PESSOAL — além do módulo, exige a allowlist de
  // e-mails (nem outro ADMIN vê; as rotas da API aplicam a mesma regra).
  const visibleMain  = mainModules.filter((mod) => {
    if (mod.id === "investimentos" && !podeAcessarInvestimentos(user?.email)) return false;
    return canAccess(mod.id);
  });
  const showAdmin    = canAccess("admin");

  const [openId, setOpenId] = useState<string | null>(() => {
    const active = allModules.find((m) => moduleIsActive(m, pathname));
    return active?.id ?? null;
  });

  // Defaults idênticos no servidor e no 1º render do cliente (evita mismatch de
  // hidratação). As preferências salvas são lidas após montar, no efeito abaixo.
  const [panelWidth, setPanelWidth] = useState<number>(PANEL_DEFAULT);
  // Preferência do usuário (Minha Conta): faixa de ícones ou droplist no nome.
  const [barraModulos] = useBarraModulos();
  const [, setRecentes] = usePersistedState<string[]>("ui:modulos-recentes", []);
  // Sem a faixa de ícones o painel nunca fica vazio: vale o módulo da tela atual.
  const moduloAtivoId = allModules.find((m) => moduleIsActive(m, pathname))?.id ?? null;
  const painelId = openId ?? (!barraModulos ? (moduloAtivoId ?? visibleMain[0]?.id ?? null) : null);
  // Sem a faixa (64px), o painel ganha um mínimo maior para o nome e o droplist.
  const larguraPainel = barraModulos ? panelWidth : Math.max(panelWidth, 240);
  const escolherModulo = (id: string) => {
    setOpenId(id);
    setRecentes((r) => [id, ...r.filter((x) => x !== id)].slice(0, 6));
  };
  const [stripCollapsed, setStripCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  const [modKey, setModKey] = useState("⌘");

  useEffect(() => {
    setPanelWidth(parseInt(localStorage.getItem("sidebar-panel-w") ?? "") || PANEL_DEFAULT);
    setStripCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    setHydrated(true);
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.platform)) setModKey("Ctrl");
  }, []);

  const draggingRef = useRef(false);
  const dragStartX  = useRef(0);
  const dragStartW  = useRef(0);

  // Note: no auto-open on pathname change — user controls which module panel is open.
  // Initial open state is set by useState initializer above.

  // Sync CSS variable + data attribute (used by pages to react to sidebar state)
  useLayoutEffect(() => {
    const w = stripCollapsed ? 0 : (barraModulos ? STRIP_W : 0) + (painelId ? larguraPainel : 0);
    document.documentElement.style.setProperty("--sidebar-width", `${w}px`);
    // "1" = panel open (sidebar expanded), "0" = strip-only or fully collapsed
    document.documentElement.dataset.sidebarExpanded = (!stripCollapsed && !!painelId) ? "1" : "0";
  }, [painelId, larguraPainel, stripCollapsed, barraModulos]);

  // Persist settings (só depois de carregar as preferências, p/ não sobrescrever)
  useEffect(() => { if (hydrated) localStorage.setItem("sidebar-panel-w", String(panelWidth)); }, [panelWidth, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("sidebar-collapsed", stripCollapsed ? "1" : "0"); }, [stripCollapsed, hydrated]);

  // Janela estreita (Safari costuma abrir ~1200px): painel aberto + conteúdo
  // não cabem — colapsa o painel automaticamente ao cruzar o limiar.
  useEffect(() => {
    const LIMIAR = 1100;
    let estreitoAnterior = window.innerWidth < LIMIAR;
    if (estreitoAnterior) setOpenId(null);
    function aoRedimensionar() {
      const estreito = window.innerWidth < LIMIAR;
      if (estreito && !estreitoAnterior) setOpenId(null);
      estreitoAnterior = estreito;
    }
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);

  // ⌘B shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setStripCollapsed((p) => !p);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Resize drag
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    dragStartX.current  = e.clientX;
    dragStartW.current  = panelWidth;

    function onMove(ev: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = ev.clientX - dragStartX.current;
      const raw   = dragStartW.current + delta;
      // Se arrastou além do threshold de colapso, fecha o painel
      if (raw < PANEL_COLLAPSE) {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setOpenId(null);
        return;
      }
      const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, raw));
      setPanelWidth(next);
    }
    function onUp() {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  // ⌘. / Ctrl+. abre a lista de módulos (reabre a barra/painel se preciso).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== ".") return;
      e.preventDefault();
      setStripCollapsed(false);
      setOpenId((id) => id ?? (allModules.find((m) => moduleIsActive(m, window.location.pathname))?.id ?? mainModules[0]?.id ?? null));
      setTimeout(() => window.dispatchEvent(new Event("modulos:abrir-seletor")), 0);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // O menu do usuário (topo) pede para abrir o painel de Configurações.
  useEffect(() => {
    const abrir = () => { setStripCollapsed(false); setOpenId("configuracoes"); };
    window.addEventListener("sidebar:abrir-configuracoes", abrir);
    return () => window.removeEventListener("sidebar:abrir-configuracoes", abrir);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const openModuleBruto = allModules.find((m) => m.id === painelId) ?? null;
  // Configurações carrega a seção "Sistema" (Administração) — só para admin
  const openModule = openModuleBruto && openModuleBruto.id === "configuracoes" && !showAdmin
    ? { ...openModuleBruto, sections: openModuleBruto.sections.filter((sec) => sec.kind !== "Sistema") }
    : openModuleBruto;
  const sidebarW   = stripCollapsed ? 0 : (barraModulos ? STRIP_W : 0) + (painelId ? larguraPainel : 0);


  return (
    <>
      {/* ── Floating reopen button when fully collapsed ──────────────── */}
      {stripCollapsed && (
        <div className="fixed left-0 top-0 h-screen w-6 z-40 group/reopen">
          <button
            onClick={() => setStripCollapsed(false)}
            title={`Expandir sidebar (${modKey}B)`}
            className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center
              w-5 h-10 bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700
              rounded-r-lg transition-all shadow-md
              opacity-0 group-hover/reopen:opacity-100 -translate-x-full group-hover/reopen:translate-x-0
              duration-150"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <aside
        className="relative h-screen z-30 flex shrink-0 overflow-hidden transition-[width] duration-200"
        style={{ width: sidebarW }}
      >
        {/* ── Icon strip (preferência "Barra de módulos: Mostrar") ───────── */}
        {barraModulos && (
        <div
          className="flex flex-col bg-gray-900 shrink-0 overflow-hidden"
          style={{ width: STRIP_W, minWidth: STRIP_W }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center h-16 border-b border-gray-800 shrink-0">
            <button
              type="button"
              onClick={() => attemptNavigate(() => router.push("/inicio"))}
              title="Início"
              className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center hover:bg-blue-400 transition-colors"
            >
              <Building2 className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Dashboard */}
          <div className="flex flex-col items-center pt-3 pb-1 gap-1">
            <StripTooltip label="Dashboard">
              <button
                onClick={() => attemptNavigate(() => router.push("/dashboard"))}
                className={cn(
                  "flex flex-col items-center justify-center w-9 h-9 rounded-xl transition-colors",
                  pathname === "/dashboard"
                    ? "bg-blue-500 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
              </button>
            </StripTooltip>
          </div>

          <div className="mx-4 border-t border-gray-800 my-2" />

          {/* Main module icons */}
          <nav className="flex flex-col items-center gap-1 px-2 flex-1 overflow-y-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {visibleMain.map((mod) => {
              const isOpen   = openId === mod.id;
              const isActive = moduleIsActive(mod, pathname);
              return (
                <StripTooltip key={mod.id} label={mod.label}>
                  <button
                    onClick={() => (isOpen ? setOpenId(null) : escolherModulo(mod.id))}
                    className={cn(
                      "relative flex flex-col items-center justify-center w-9 h-9 rounded-xl transition-colors",
                      isOpen
                        ? "bg-gray-700 text-white"
                        : isActive
                        ? "text-blue-400 hover:bg-gray-800"
                        : "text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                    )}
                  >
                    <mod.icon className={cn("w-4 h-4", (isOpen || isActive) && corDoModuloFundoEscuro(mod.id))} />
                    {isActive && !isOpen && (
                      <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    )}
                  </button>
                </StripTooltip>
              );
            })}

            {/* Divider before future modules */}
            <div className="w-6 border-t border-gray-700 my-1.5" />

            {/* Future modules — disabled with "breve" indicator */}
            {futureModules.map((mod) => (
              <StripTooltip key={mod.id} label={`${mod.label} — Em breve`}>
                <div className="relative flex flex-col items-center justify-center w-9 h-9 rounded-xl cursor-not-allowed opacity-40">
                  <mod.icon className="w-4 h-4 text-gray-400" />
                  {/* tiny "soon" dot */}
                  <span className="absolute right-1 top-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                </div>
              </StripTooltip>
            ))}
          </nav>

          {/* ── Bottom area (de cima para baixo: recolher → admin → suporte → config → perfil) ── */}
          <div className="flex flex-col items-center gap-1 pb-3 pt-2 border-t border-gray-800 mt-2">

            {/* Recolher sidebar */}
            <StripTooltip label={`Recolher sidebar (${modKey}B)`}>
              <button
                onClick={() => setStripCollapsed(true)}
                className="flex items-center justify-center w-9 h-9 rounded-xl
                  text-gray-500 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </StripTooltip>

            {/* Menu do usuário (tema, atalhos, configurações, Sair) foi para o
                canto superior direito: components/layout/UserMenu.tsx. */}
          </div>
        </div>
        )}

        {/* ── Flyout panel ───────────────────────────────────────────── */}
        {painelId && (
          <div
            className="h-full bg-card border-r border-border flex flex-col overflow-hidden relative"
            style={{ width: larguraPainel }}
          >
            {openModule && (
              <>
                {/* Panel header */}
                <div className="relative flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
                  {(
                    <>
                      <SeletorModulo
                        atual={openModule}
                        modulos={visibleMain}
                        config={configModule}
                        onEscolher={escolherModulo}
                        onDashboard={() => attemptNavigate(() => router.push("/dashboard"))}
                      />
                      {!barraModulos && <button
                        type="button"
                        onClick={() => setStripCollapsed(true)}
                        title={`Recolher (${modKey}B)`}
                        className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <PanelLeftClose className="w-4 h-4" />
                      </button>}
                    </>
                  )}
                </div>

                {/* Nav sections — overflow-x escondido: rótulos longos truncam
                    (ex.: "Engenharia do Pro…") e não podem criar scroll horizontal
                    na base do menu. */}
                <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3">
                  {openModule.sections.map((section) => (
                    <div key={section.kind} className="mb-3">
                      {/* Título só some quando a seção é a única do módulo (aí o
                          próprio nome do módulo já diz); com outras seções ao lado
                          ele situa o item (ex.: "Processos" acima de Fluxo de Compras). */}
                      {openModule.sections.length > 1 && (
                        <p className="text-[11px] font-medium text-muted-foreground/70 px-2 mb-1">
                          {section.kind}
                        </p>
                      )}
                      {section.items.map((item) => {
                        const active = itemIsActive(item, pathname);
                        const Icon   = item.icon ?? CircleDot;
                        if (item.soon) {
                          return (
                            <div
                              key={item.href}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground/60 cursor-not-allowed"
                              title="Em breve"
                            >
                              <span className="flex shrink-0 items-center justify-center w-5 h-5 rounded-md bg-muted">
                                <Icon className="w-3 h-3 text-muted-foreground/50" />
                              </span>
                              <span className="flex-1 truncate">{item.label}</span>
                              <span className="text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">breve</span>
                            </div>
                          );
                        }
                        return (
                          <button
                            key={item.href}
                            onClick={() => attemptNavigate(() => router.push(item.href))}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors",
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground/80 hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground/70")} />
                            <span className="truncate flex-1 text-left">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {openModule.id === "projetos" && <ProjetosEmAndamento />}
                </nav>

              </>
            )}

            {/* ── Resize handle ───────────────────────────────────────── */}
            <div
              onMouseDown={onResizeMouseDown}
              className="group absolute right-0 top-0 h-full w-3 cursor-col-resize flex items-center justify-center z-10"
              title={`Arraste para redimensionar · ${modKey}B para recolher`}
            >
              <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary transition-colors" />
              <GripVertical className="absolute w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        )}
      </aside>

      {/* ── Notification panel (portal) ─────────────────────────────────────── */}
    </>
  );
}
