"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EscClose from "@/components/shared/EscClose";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Star, FolderKanban, Users, AlertTriangle, X, Archive, Search, Building2, MoreHorizontal, ExternalLink, Trash2, LayoutGrid, List, Settings2 } from "lucide-react";
import { AvatarUsuario, SituacaoBadge, SITUACOES_PROJETO } from "@/components/projetos/comum";
import { ProjetoHomeDTO, CORES_PROJETO, ProjetoBoardDTO } from "@/components/projetos/tipos";
import ProjetoConfigDialog from "@/components/projetos/ProjetoConfigDialog";
import EmpresaTag from "@/components/shared/EmpresaTag";
import SelectMenu from "@/components/shared/SelectMenu";
import { usePersistedState } from "@/lib/use-persisted-state";

type UsuarioOption = { id: string; nome: string };

export default function ProjetosHomePage() {
  const router = useRouter();
  const { user } = useSession();
  useTabTitle("Projetos");

  const [projetos, setProjetos] = useState<ProjetoHomeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aba, setAba] = useState<"ativos" | "arquivados">("ativos");
  const [busca, setBusca] = useState("");
  // Filtro por empresa: "TODAS" | "GERAL" (sem empresa) | empresaId.
  const [filtroEmpresa, setFiltroEmpresa] = useState("TODAS");
  const empresasSessao = user?.empresas ?? [];
  const multiEmpresa = empresasSessao.length > 1;
  // Visualização: cards (padrão) ou lista — persiste por usuário.
  const [vista, setVista] = usePersistedState<"cards" | "lista">("projetos:home:vista", "cards");
  // Agrupamento das seções: padrão (favoritos/meus/públicos), situação ou empresa.
  const [agrupar, setAgrupar] = usePersistedState<"padrao" | "situacao" | "empresa">("projetos:home:agrupar", "padrao");
  // Menu ⋯ de ações rápidas do card (id do projeto aberto).
  const [menuProjeto, setMenuProjeto] = useState<string | null>(null);
  // Atalhos com o mouse sobre um projeto: E = ações rápidas (⋯), C = configurações.
  const hoverProjeto = useRef<ProjetoHomeDTO | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "e" && k !== "c") return;
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable) return;
      const p = hoverProjeto.current;
      if (!p) return;
      e.preventDefault();
      if (k === "e") setMenuProjeto((cur) => (cur === p.id ? null : p.id));
      else abrirConfig(p.id);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Novo projeto
  const [showCreate, setShowCreate] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novaCor, setNovaCor] = useState(CORES_PROJETO[0]);
  const [novoPublico, setNovoPublico] = useState(false);
  const [novaEmpresaId, setNovaEmpresaId] = useState(""); // "" = geral (sem empresa)
  const [novosMembros, setNovosMembros] = useState<Set<string>>(new Set());
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [createError, setCreateError] = useState("");

  // Cache por aba (stale-while-revalidate): a lista salva aparece NA HORA, sem
  // spinner, e a busca fresca roda em segundo plano atualizando tela e cache.
  const CACHE_KEY = "projetos:home:cache";
  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await fetch("/api/projetos");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao carregar"); return; }
      setProjetos(json.data ?? []);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(json.data ?? [])); } catch { /* storage cheio */ }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let temCache = false;
    try {
      const c = sessionStorage.getItem(CACHE_KEY);
      if (c) { setProjetos(JSON.parse(c)); setLoading(false); temCache = true; }
    } catch { /* ignore */ }
    load(temCache);
  }, [load]);

  // Configurações direto da home (menu ⋯): abre o popup aqui mesmo, sem
  // navegar p/ o quadro. Busca o payload completo (membros etc.) sob demanda.
  const [configBoard, setConfigBoard] = useState<ProjetoBoardDTO | null>(null);
  async function abrirConfig(projetoId: string) {
    const res = await fetch(`/api/projetos/${projetoId}`).catch(() => null);
    if (res?.ok) setConfigBoard((await res.json()).data);
  }
  async function recarregarConfig() {
    load(true);
    if (configBoard) {
      const res = await fetch(`/api/projetos/${configBoard.id}`).catch(() => null);
      if (res?.ok) {
        const data = (await res.json()).data;
        // Só atualiza se o diálogo AINDA estiver aberto — o Salvar fecha e o
        // refetch assíncrono não pode reabri-lo por cima do usuário.
        setConfigBoard((cur) => (cur ? data : cur));
      }
    }
  }

  async function abrirCreate() {
    setNovoNome(""); setNovaDescricao(""); setNovaCor(CORES_PROJETO[0]);
    setNovoPublico(false); setNovaEmpresaId(""); setNovosMembros(new Set()); setCreateError("");
    setShowCreate(true);
    if (usuarios.length === 0) {
      try {
        const res = await fetch("/api/projetos/usuarios");
        const json = await res.json();
        setUsuarios(json.data ?? []);
      } catch {}
    }
  }

  async function criarProjeto() {
    if (!novoNome.trim()) { setCreateError("Informe o nome do projeto."); return; }
    setSalvando(true); setCreateError("");
    try {
      const res = await fetch("/api/projetos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: novoNome.trim(),
          descricao: novaDescricao.trim() || null,
          cor: novaCor,
          visibilidade: novoPublico ? "PUBLICO" : "PRIVADO",
          empresaId: novaEmpresaId || null,
          membroIds: Array.from(novosMembros),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error || "Erro ao criar"); return; }
      setShowCreate(false);
      router.push(`/projetos/${json.data.id}`);
    } catch {
      setCreateError("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  }

  async function toggleFavorito(p: ProjetoHomeDTO, e: React.MouseEvent) {
    e.stopPropagation();
    setProjetos((prev) => prev.map((x) => (x.id === p.id ? { ...x, favorito: !x.favorito } : x)));
    await fetch(`/api/projetos/${p.id}/membros`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorito: !p.favorito }),
    }).catch(() => {});
  }

  // ── Ações rápidas do ⋯ do card ────────────────────────────────────────────
  async function alternarArquivado(p: ProjetoHomeDTO) {
    setMenuProjeto(null);
    const res = await fetch(`/api/projetos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: p.status === "ARQUIVADO" ? "ATIVO" : "ARQUIVADO" }),
    }).catch(() => null);
    if (res && !res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Não foi possível arquivar.");
    }
    await load();
  }

  async function excluirProjeto(p: ProjetoHomeDTO) {
    setMenuProjeto(null);
    if (!confirm(`Excluir "${p.nome}" com todas as tarefas? Vai para a Lixeira do sistema (retenção 90 dias).`)) return;
    const res = await fetch(`/api/projetos/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (res && !res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Não foi possível excluir.");
    }
    await load();
  }

  const visiveis = projetos
    .filter((p) => (aba === "ativos" ? p.status === "ATIVO" : p.status === "ARQUIVADO"))
    .filter((p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter((p) =>
      filtroEmpresa === "TODAS" ? true
      : filtroEmpresa === "GERAL" ? !p.empresaId
      : p.empresaId === filtroEmpresa);
  const favoritos = visiveis.filter((p) => p.favorito);
  const meus = visiveis.filter((p) => !p.favorito && p.souMembro);
  const publicos = visiveis.filter((p) => !p.favorito && !p.souMembro);
  const nArquivados = projetos.filter((p) => p.status === "ARQUIVADO").length;

  // Círculo de progresso (estilo Things): pizza preenchida na proporção de
  // tarefas concluídas do projeto, na cor dele. Vazio = nada concluído.
  function ProgressoProjeto({ p, size = 18 }: { p: ProjetoHomeDTO; size?: number }) {
    const total = p.tarefasAbertas + p.tarefasConcluidas;
    const pct = total > 0 ? p.tarefasConcluidas / total : 0;
    const cor = p.cor ?? "#64748b";
    const r = 4.5, C = 2 * Math.PI * r;
    return (
      <svg
        width={size} height={size} viewBox="0 0 20 20" className="shrink-0 -rotate-90"
        role="img" aria-label={`${p.tarefasConcluidas} de ${total} concluídas`}
      >
        <title>{`${p.tarefasConcluidas} de ${total} concluída${total === 1 ? "" : "s"}`}</title>
        <circle cx="10" cy="10" r="8" fill="none" stroke={cor} strokeWidth="1.8" />
        {/* pizza: stroke largo sobre raio pequeno preenche o miolo */}
        <circle cx="10" cy="10" r={r} fill="none" stroke={cor} strokeWidth="9" strokeDasharray={`${C * pct} ${C}`} />
      </svg>
    );
  }

  // Menu ⋯ de ações rápidas (compartilhado entre card e linha da lista).
  function MenuAcoes({ p }: { p: ProjetoHomeDTO }) {
    const dono = p.donoId === user?.id || user?.perfil === "ADMIN";
    return (
      <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
        <span
          role="button"
          onClick={() => setMenuProjeto(menuProjeto === p.id ? null : p.id)}
          className={cn(
            "p-1 rounded-md transition-colors cursor-pointer shrink-0 text-muted-foreground/40 hover:text-foreground hover:bg-muted",
            menuProjeto === p.id ? "opacity-100 text-foreground" : "opacity-0 group-hover:opacity-100"
          )}
          title="Ações do projeto"
        >
          <MoreHorizontal className="w-4 h-4" />
        </span>
        {menuProjeto === p.id && (
          <>
            <span className="fixed inset-0 z-40" onClick={() => setMenuProjeto(null)} />
            <span className="absolute right-0 top-7 z-50 w-52 bg-card border border-border rounded-xl shadow-xl py-1 text-sm flex flex-col">
              <span role="button" onClick={() => router.push(`/projetos/${p.id}`)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-foreground">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir projeto
              </span>
              <span role="button" onClick={(e) => { toggleFavorito(p, e); setMenuProjeto(null); }} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-foreground">
                <Star className="w-3.5 h-3.5" /> {p.favorito ? "Remover dos favoritos" : "Favoritar"}
              </span>
              <span role="button" onClick={() => abrirConfig(p.id)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-foreground">
                <Settings2 className="w-3.5 h-3.5" /> Configurações
              </span>
              {dono && (
                <span role="button" onClick={() => alternarArquivado(p)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-foreground">
                  <Archive className="w-3.5 h-3.5" /> {p.status === "ARQUIVADO" ? "Reativar projeto" : "Arquivar projeto"}
                </span>
              )}
              {dono && (
                <span role="button" onClick={() => excluirProjeto(p)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-danger/10 cursor-pointer text-danger">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir projeto
                </span>
              )}
            </span>
          </>
        )}
      </span>
    );
  }

  function CardProjeto({ p }: { p: ProjetoHomeDTO }) {
    return (
      <button
        onClick={() => router.push(`/projetos/${p.id}`)}
        onMouseEnter={() => { hoverProjeto.current = p; }}
        onMouseLeave={() => { if (hoverProjeto.current?.id === p.id) hoverProjeto.current = null; }}
        className="text-left bg-card rounded-xl border border-border hover:border-blue-400 hover:shadow-md transition-all group"
      >
        <div className="h-2 rounded-t-xl" style={{ backgroundColor: p.cor ?? "#64748b" }} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-1">
            <span className="mt-0.5"><ProgressoProjeto p={p} /></span>
            <p className="font-semibold text-foreground leading-snug line-clamp-2 flex-1">{p.nome}</p>
            <span
              onClick={(e) => toggleFavorito(p, e)}
              className={cn(
                "p-1 rounded-md transition-colors cursor-pointer shrink-0",
                p.favorito ? "text-amber-400" : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-amber-400"
              )}
              title={p.favorito ? "Remover dos favoritos" : "Favoritar"}
            >
              <Star className="w-4 h-4" fill={p.favorito ? "currentColor" : "none"} />
            </span>
            <MenuAcoes p={p} />
          </div>
          {p.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
          {/* Situação + tag da empresa (ou "Geral" p/ quem vê 2+ empresas). */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <SituacaoBadge situacao={p.situacao} small />
            {multiEmpresa && (p.empresaId ? (
              <EmpresaTag empresaId={p.empresaId} compact={false} />
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground text-[10px] font-medium">
                <Users className="w-3 h-3" /> Geral
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex -space-x-1.5">
              {p.membros.slice(0, 4).map((m) => <AvatarUsuario key={m.id} nome={m.nome} size="sm" />)}
              {p.membros.length > 4 && (
                <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[9px] font-semibold inline-flex items-center justify-center">
                  +{p.membros.length - 4}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {p.tarefasAtrasadas > 0 && (
                <span className="inline-flex items-center gap-0.5 text-danger font-medium">
                  <AlertTriangle className="w-3 h-3" /> {p.tarefasAtrasadas}
                </span>
              )}
              <span>{p.tarefasAbertas} aberta{p.tarefasAbertas === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  // Linha da visualização em LISTA — mesmas infos do card, densas.
  function LinhaProjeto({ p }: { p: ProjetoHomeDTO }) {
    return (
      <div
        role="button"
        onClick={() => router.push(`/projetos/${p.id}`)}
        onMouseEnter={() => { hoverProjeto.current = p; }}
        onMouseLeave={() => { if (hoverProjeto.current?.id === p.id) hoverProjeto.current = null; }}
        className="group flex items-center gap-3 px-4 py-2.5 bg-card hover:bg-muted cursor-pointer transition-colors"
      >
        <ProgressoProjeto p={p} size={16} />
        <span className="font-medium text-sm text-foreground truncate">{p.nome}</span>
        {p.favorito && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" />}
        <SituacaoBadge situacao={p.situacao} small />
        {multiEmpresa && (
          p.empresaId
            ? <EmpresaTag empresaId={p.empresaId} />
            : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground text-[10px] font-medium shrink-0"><Users className="w-3 h-3" /> Geral</span>
        )}
        {p.descricao && <span className="text-xs text-muted-foreground truncate hidden md:inline">{p.descricao}</span>}
        <span className="ml-auto flex items-center gap-3 shrink-0">
          {p.tarefasAtrasadas > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-danger font-medium"><AlertTriangle className="w-3 h-3" /> {p.tarefasAtrasadas}</span>
          )}
          <span className="text-xs text-muted-foreground">{p.tarefasAbertas} aberta{p.tarefasAbertas === 1 ? "" : "s"}</span>
          <span className="flex -space-x-1.5">
            {p.membros.slice(0, 4).map((m) => <AvatarUsuario key={m.id} nome={m.nome} size="sm" />)}
            {p.membros.length > 4 && (
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[9px] font-semibold inline-flex items-center justify-center">+{p.membros.length - 4}</span>
            )}
          </span>
          <MenuAcoes p={p} />
        </span>
      </div>
    );
  }

  function Secao({ titulo, icone, lista }: { titulo: string; icone: React.ReactNode; lista: ProjetoHomeDTO[] }) {
    if (lista.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {icone} {titulo}
        </div>
        {vista === "lista" ? (
          <div className="rounded-xl border border-border divide-y divide-border overflow-visible">
            {lista.map((p) => <LinhaProjeto key={p.id} p={p} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {lista.map((p) => <CardProjeto key={p.id} p={p} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projetos"
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar projeto..."
                className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
            {/* Filtro por empresa (projetos podem ser de uma empresa ou gerais) */}
            {multiEmpresa && (
              <SelectMenu
                value={filtroEmpresa}
                onChange={setFiltroEmpresa}
                title="Filtrar por empresa"
                className="w-48"
                options={[
                  { value: "TODAS", label: "Todas as empresas" },
                  { value: "GERAL", label: "Gerais (sem empresa)" },
                  ...empresasSessao.map((e) => ({ value: e.id, label: e.nome })),
                ]}
              />
            )}
            {/* Agrupamento das seções */}
            <SelectMenu
              value={agrupar}
              onChange={(v) => setAgrupar(v as "padrao" | "situacao" | "empresa")}
              title="Agrupar projetos por"
              className="w-44"
              options={[
                { value: "padrao", label: "Agrupar: padrão" },
                { value: "situacao", label: "Agrupar: situação" },
                ...(multiEmpresa ? [{ value: "empresa", label: "Agrupar: empresa" }] : []),
              ]}
            />
            {/* Visualização: cards ou lista */}
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                onClick={() => setVista("cards")}
                title="Cards"
                className={cn("px-2.5 py-2 transition-colors", vista === "cards" ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setVista("lista")}
                title="Lista"
                className={cn("px-2.5 py-2 transition-colors", vista === "lista" ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                onClick={() => setAba("ativos")}
                className={cn("px-3 py-2 transition-colors", aba === "ativos" ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:bg-muted")}
              >
                Ativos
              </button>
              <button
                onClick={() => setAba("arquivados")}
                className={cn("px-3 py-2 inline-flex items-center gap-1.5 transition-colors", aba === "arquivados" ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:bg-muted")}
              >
                <Archive className="w-3.5 h-3.5" /> Arquivados{nArquivados > 0 ? ` (${nArquivados})` : ""}
              </button>
            </div>
            <Button onClick={abrirCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Novo projeto
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-8">
        {error && <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>}
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{aba === "arquivados" ? "Nenhum projeto arquivado." : "Nenhum projeto ainda — crie o primeiro."}</p>
          </div>
        ) : (
          <>
            {agrupar === "padrao" && (
              <>
                <Secao titulo="Favoritos" icone={<Star className="w-4 h-4" />} lista={favoritos} />
                <Secao titulo="Meus projetos" icone={<FolderKanban className="w-4 h-4" />} lista={meus} />
                <Secao titulo="Públicos" icone={<Users className="w-4 h-4" />} lista={publicos} />
              </>
            )}
            {agrupar === "situacao" && Object.entries(SITUACOES_PROJETO).map(([k, s]) => (
              <Secao
                key={k}
                titulo={s.label}
                icone={<span className={cn("w-2.5 h-2.5 rounded-full", s.cls.split(" ")[0])} />}
                lista={visiveis.filter((p) => (p.situacao ?? "EM_ANDAMENTO") === k)}
              />
            ))}
            {agrupar === "empresa" && (
              <>
                {empresasSessao.map((e) => (
                  <Secao
                    key={e.id}
                    titulo={e.nome}
                    icone={<Building2 className="w-4 h-4" />}
                    lista={visiveis.filter((p) => p.empresaId === e.id)}
                  />
                ))}
                <Secao titulo="Gerais (sem empresa)" icone={<Users className="w-4 h-4" />} lista={visiveis.filter((p) => !p.empresaId)} />
              </>
            )}
          </>
        )}
      </div>

      {/* ── Novo projeto ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) setShowCreate(false); }}
        >
          <EscClose onClose={() => { if (!salvando) setShowCreate(false); }} />
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Novo projeto</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Obra do galpão 2" onKeyDown={(e) => e.key === "Enter" && criarProjeto()} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} rows={2} placeholder="Objetivo do projeto (opcional)" />
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex gap-2 flex-wrap">
                  {CORES_PROJETO.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNovaCor(c)}
                      className={cn("w-7 h-7 rounded-full transition-transform", novaCor === c && "ring-2 ring-offset-2 ring-blue-500 scale-110")}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={novoPublico} onChange={(e) => setNovoPublico(e.target.checked)} className="rounded" />
                Público — qualquer pessoa com o módulo pode ver (só membros editam)
              </label>
              {multiEmpresa && (
                <div className="space-y-1.5">
                  <Label className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Empresa</Label>
                  <SelectMenu
                    value={novaEmpresaId}
                    onChange={setNovaEmpresaId}
                    options={[
                      { value: "", label: "Geral (sem empresa)" },
                      ...empresasSessao.map((e) => ({ value: e.id, label: e.nome })),
                    ]}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Membros</Label>
                <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {usuarios.filter((u) => u.id !== user?.id).map((u) => (
                    <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={novosMembros.has(u.id)}
                        onChange={(e) => {
                          setNovosMembros((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(u.id); else next.delete(u.id);
                            return next;
                          });
                        }}
                      />
                      <AvatarUsuario nome={u.nome} size="sm" /> {u.nome}
                    </label>
                  ))}
                  {usuarios.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Carregando usuários...</p>}
                </div>
              </div>
              {createError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{createError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-border bg-muted rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={salvando}>Cancelar</Button>
              <Button onClick={criarProjeto} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Criar projeto
              </Button>
            </div>
          </div>
        </div>
      )}
      {configBoard && (
        <ProjetoConfigDialog
          board={configBoard}
          onFechar={() => setConfigBoard(null)}
          onMudou={recarregarConfig}
          onExcluido={() => { setConfigBoard(null); load(true); }}
        />
      )}
    </div>
  );
}
