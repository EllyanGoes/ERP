"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import CreateDrawer, { useCreateDrawer } from "@/components/shared/CreateDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatDate } from "@/lib/utils";
import { Plus, Loader2, Globe, MoreVertical, Code2, Pencil, Trash2, Copy, Check } from "lucide-react";

type Site = {
  id: string;
  nome: string;
  dominios: string[];
  ativo: boolean;
  createdAt: string;
};

const labelCls = "text-xs font-semibold text-foreground uppercase tracking-wide";

// ── Formulário (criação no CreateDrawer e edição no Sheet) ──────────────────
function SiteForm({
  site,
  onSaved,
  onCancel,
}: {
  site?: Site;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const drawer = useCreateDrawer();
  const editando = !!site;
  const [nome, setNome] = useState(site?.nome ?? "");
  const [dominiosTexto, setDominiosTexto] = useState(site?.dominios.join("\n") ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    const dominios = dominiosTexto.split("\n").map((d) => d.trim()).filter(Boolean);
    if (nome.trim().length < 2) { setErro("Informe o nome do site."); return; }
    if (dominios.length === 0) { setErro("Informe pelo menos um domínio (um por linha)."); return; }

    setSalvando(true);
    try {
      const res = await fetch(editando ? `/api/marketing/sites/${site.id}` : "/api/marketing/sites", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), dominios }),
      });
      if (res.ok) {
        if (editando) onSaved?.();
        else drawer?.aposCriar();
      } else {
        const json = await res.json().catch(() => ({}));
        setErro(json.error ?? "Erro ao salvar o site. Tente novamente.");
      }
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div>
          <label className={labelCls}>Nome</label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Site institucional"
            className="h-10 border-border mt-1"
          />
        </div>
        <div>
          <label className={labelCls}>Domínios (um por linha)</label>
          <Textarea
            value={dominiosTexto}
            onChange={(e) => setDominiosTexto(e.target.value)}
            placeholder={"exemplo.com.br\nwww.exemplo.com.br"}
            rows={4}
            className="border-border mt-1 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Só o hostname, sem https:// — eventos de outros domínios são rejeitados (allowlist).
            Subdomínios do domínio informado são aceitos automaticamente.
          </p>
        </div>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => (editando ? onCancel?.() : drawer?.fechar())}>
          Cancelar
        </Button>
        <Button type="button" onClick={salvar} disabled={salvando} className="gap-2">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {editando ? "Salvar" : "Cadastrar site"}
        </Button>
      </div>
    </div>
  );
}

// ── Dialog de instalação: snippet pronto + dicas da API window.erp ──────────
function InstalacaoDialog({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setCopiado(false);
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, [site]);

  if (!site) return null;

  const snippet = `<script async src="${origin}/api/t/s.js" data-site="${site.id}"></script>`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* clipboard indisponível */ }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Code2 className="h-4 w-4" /> Instalação do tracking</DialogTitle>
          <DialogDescription>
            Adicione o snippet em <b>{site.nome}</b> para registrar visitas e eventos nos funis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Snippet</label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={snippet} className="h-10 border-border text-xs font-mono" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={copiar} className="gap-2 shrink-0">
                {copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Instale antes do <code className="font-mono">&lt;/head&gt;</code>. O site é responsável
              pelo aviso de cookies/consentimento (LGPD).
            </p>
          </div>

          <div>
            <label className={labelCls}>Eventos e identificação (opcional)</label>
            <div className="mt-1 rounded-lg border border-border bg-muted/60 p-3 text-xs font-mono space-y-1.5 overflow-x-auto">
              <p className="text-muted-foreground font-sans">Evento nomeado (ex.: envio de formulário) — usado nos nós de Ação do funil:</p>
              <p>window.erp(&quot;track&quot;, &quot;form_submit&quot;)</p>
              <p className="text-muted-foreground font-sans pt-1">Identificar o visitante por email (amarra ao Lead):</p>
              <p>window.erp(&quot;identify&quot;, {"{ email: \"pessoa@exemplo.com\" }"})</p>
            </div>
          </div>

          <div>
            <label className={labelCls}>Domínios autorizados</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {site.dominios.map((d) => (
                <span key={d} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-muted text-muted-foreground">
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SitesRastreadosPage() {
  useTabTitle("Sites rastreados");
  const [lista, setLista] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [instalacaoSite, setInstalacaoSite] = useState<Site | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/marketing/sites");
    const json = await res.json();
    setLista(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(s: Site) {
    if (!confirm(`Desativar o site "${s.nome}"? O snippet instalado deixa de registrar eventos.`)) return;
    const res = await fetch(`/api/marketing/sites/${s.id}`, { method: "DELETE" });
    if (res.ok) carregar();
    else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Não foi possível desativar o site.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Sites rastreados"
        subtitle="Snippet de tracking web — visitas e eventos alimentam a análise dos funis"
        actions={
          <Button onClick={() => setOpenDrawer(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Site</Button>
        }
      />

      <div className="px-8 pb-8">
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Globe className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-sm font-medium text-foreground">Nenhum site cadastrado</p>
              <p className="text-sm text-muted-foreground">Cadastre um site para gerar o snippet de instalação.</p>
              <Button onClick={() => setOpenDrawer(true)} className="mt-2 gap-2"><Plus className="h-4 w-4" /> Novo Site</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Nome</th>
                  <th className="px-3 py-2.5 font-semibold">Domínios</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Criado em</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setInstalacaoSite(s)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <p className={cn("font-medium", s.ativo ? "text-foreground" : "text-muted-foreground line-through")}>{s.nome}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.id}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {s.dominios.map((d) => (
                          <span key={d} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-muted text-muted-foreground">
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                        s.ativo
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {s.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(s.createdAt)}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors" title="Ações" />}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setInstalacaoSite(s)}>
                            <Code2 className="h-4 w-4 mr-2" /> Instalação
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditSite(s); setEditOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => excluir(s)} className="text-danger focus:text-danger">
                            <Trash2 className="h-4 w-4 mr-2" /> Desativar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateDrawer open={openDrawer} onOpenChange={setOpenDrawer} title="Novo Site" width="md" onCreated={carregar}>
        <SiteForm />
      </CreateDrawer>

      {/* Drawer de edição (mesmo visual do CreateDrawer, local) */}
      {editOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setEditOpen(false)} aria-hidden />
      )}
      <Sheet open={editOpen} onOpenChange={setEditOpen} modal={false}>
        <SheetContent
          side="right"
          className="w-full max-w-xl flex flex-col p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-6 py-4">
            <SheetTitle>Editar Site</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 bg-muted/60">
            {editOpen && editSite && (
              <SiteForm
                site={editSite}
                onSaved={() => { setEditOpen(false); carregar(); }}
                onCancel={() => setEditOpen(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <InstalacaoDialog site={instalacaoSite} onClose={() => setInstalacaoSite(null)} />
    </div>
  );
}
