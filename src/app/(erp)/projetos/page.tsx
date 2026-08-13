"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Loader2, Plus, Star, FolderKanban, Users, AlertTriangle, X, Archive, Search } from "lucide-react";
import { AvatarUsuario } from "@/components/projetos/comum";
import { ProjetoHomeDTO, CORES_PROJETO } from "@/components/projetos/tipos";

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

  // Novo projeto
  const [showCreate, setShowCreate] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novaCor, setNovaCor] = useState(CORES_PROJETO[0]);
  const [novoPublico, setNovoPublico] = useState(false);
  const [novosMembros, setNovosMembros] = useState<Set<string>>(new Set());
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projetos");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao carregar"); return; }
      setProjetos(json.data ?? []);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function abrirCreate() {
    setNovoNome(""); setNovaDescricao(""); setNovaCor(CORES_PROJETO[0]);
    setNovoPublico(false); setNovosMembros(new Set()); setCreateError("");
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

  const visiveis = projetos
    .filter((p) => (aba === "ativos" ? p.status === "ATIVO" : p.status === "ARQUIVADO"))
    .filter((p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()));
  const favoritos = visiveis.filter((p) => p.favorito);
  const meus = visiveis.filter((p) => !p.favorito && p.souMembro);
  const publicos = visiveis.filter((p) => !p.favorito && !p.souMembro);
  const nArquivados = projetos.filter((p) => p.status === "ARQUIVADO").length;

  function CardProjeto({ p }: { p: ProjetoHomeDTO }) {
    return (
      <button
        onClick={() => router.push(`/projetos/${p.id}`)}
        className="text-left bg-card rounded-xl border border-border hover:border-blue-400 hover:shadow-md transition-all overflow-hidden group"
      >
        <div className="h-2" style={{ backgroundColor: p.cor ?? "#64748b" }} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-foreground leading-snug line-clamp-2">{p.nome}</p>
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
          </div>
          {p.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
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

  function Secao({ titulo, icone, lista }: { titulo: string; icone: React.ReactNode; lista: ProjetoHomeDTO[] }) {
    if (lista.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {icone} {titulo}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {lista.map((p) => <CardProjeto key={p.id} p={p} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projetos"
        breadcrumbs={[{ label: "Projetos" }]}
        action={
          <Button onClick={abrirCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Novo projeto
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-8">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar projeto..."
              className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
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
        </div>

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
            <Secao titulo="Favoritos" icone={<Star className="w-4 h-4" />} lista={favoritos} />
            <Secao titulo="Meus projetos" icone={<FolderKanban className="w-4 h-4" />} lista={meus} />
            <Secao titulo="Públicos" icone={<Users className="w-4 h-4" />} lista={publicos} />
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
    </div>
  );
}
