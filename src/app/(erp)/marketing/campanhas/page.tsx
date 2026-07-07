"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import CreateDrawer from "@/components/shared/CreateDrawer";
import CampanhaForm, { type CampanhaData, PLATAFORMA_LABELS, PLATAFORMA_BADGE } from "@/components/marketing/CampanhaForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { PLATAFORMAS_CAMPANHA } from "@/lib/validations/marketing-campanha";
import { Plus, Search, Loader2, Megaphone, MoreVertical, Link2, Trash2, Copy, Check } from "lucide-react";

type Campanha = {
  id: string;
  nome: string;
  plataforma: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  orcamento: number | string | null;
  dataInicio: string | null;
  dataFim: string | null;
  ativo: boolean;
  _count: { leads: number };
};

function PlataformaBadge({ plataforma }: { plataforma: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
      PLATAFORMA_BADGE[plataforma] ?? PLATAFORMA_BADGE.OUTRO,
    )}>
      {PLATAFORMA_LABELS[plataforma] ?? plataforma}
    </span>
  );
}

/** Popover simples (Dialog compacto) para montar e copiar a URL com UTMs. */
function CopiarLinkDialog({ campanha, onClose }: { campanha: Campanha | null; onClose: () => void }) {
  const [base, setBase] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { setBase(""); setCopiado(false); }, [campanha]);

  if (!campanha) return null;

  const params = new URLSearchParams();
  if (campanha.utmSource) params.set("utm_source", campanha.utmSource);
  if (campanha.utmMedium) params.set("utm_medium", campanha.utmMedium);
  if (campanha.utmCampaign) params.set("utm_campaign", campanha.utmCampaign);
  params.set("cid", campanha.id);
  const baseLimpa = base.trim() || "https://seusite.com.br";
  const url = `${baseLimpa}${baseLimpa.includes("?") ? "&" : "?"}${params.toString()}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* clipboard indisponível */ }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Link da campanha</DialogTitle>
          <DialogDescription>
            Monte a URL de divulgação de <b>{campanha.nome}</b> com os parâmetros UTM da campanha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">URL base</label>
            <Input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="https://seusite.com.br/landing"
              className="h-10 border-border mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Link gerado</label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={url} className="h-10 border-border text-xs font-mono" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={copiar} className="gap-2 shrink-0">
                {copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CampanhasPage() {
  useTabTitle("Campanhas");
  const [lista, setLista] = useState<Campanha[]>([]);
  const [contadores, setContadores] = useState<{ todos: number; porPlataforma: Record<string, number> }>({ todos: 0, porPlataforma: {} });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = usePersistedState("mkt-campanhas-q", "");
  const [plataforma, setPlataforma] = usePersistedState("mkt-campanhas-plataforma", "");
  const [openDrawer, setOpenDrawer] = useState(false);
  const [editCamp, setEditCamp] = useState<CampanhaData | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [linkCamp, setLinkCamp] = useState<Campanha | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (plataforma) params.set("plataforma", plataforma);
    const res = await fetch(`/api/marketing/campanhas?${params.toString()}`);
    const json = await res.json();
    setLista(json.data ?? []);
    setContadores(json.contadores ?? { todos: 0, porPlataforma: {} });
    setLoading(false);
  }, [q, plataforma]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  async function abrirEdicao(id: string) {
    const res = await fetch(`/api/marketing/campanhas/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setEditCamp(json.data);
    setEditOpen(true);
  }

  async function excluir(c: Campanha) {
    if (!confirm(`Excluir a campanha "${c.nome}"?`)) return;
    const res = await fetch(`/api/marketing/campanhas/${c.id}`, { method: "DELETE" });
    if (res.ok) carregar();
    else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Não foi possível excluir a campanha.");
    }
  }

  // Chips: Todos + plataformas com contagem > 0 (mantém a selecionada visível mesmo zerada)
  const chips: { value: string; label: string; count: number }[] = [
    { value: "", label: "Todos", count: contadores.todos ?? 0 },
    ...PLATAFORMAS_CAMPANHA
      .filter((p) => (contadores.porPlataforma?.[p] ?? 0) > 0 || plataforma === p)
      .map((p) => ({ value: p, label: PLATAFORMA_LABELS[p], count: contadores.porPlataforma?.[p] ?? 0 })),
  ];

  return (
    <div>
      <PageHeader
        title="Campanhas"
        subtitle="Campanhas de marketing, atribuição por UTM e leads gerados"
        actions={
          <Button onClick={() => setOpenDrawer(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Campanha</Button>
        }
      />

      <div className="px-8 pb-8">
        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-md min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha..." className="pl-9 h-10 border-border" />
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1 flex-wrap">
            {chips.map((f) => {
              const ativo = plataforma === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setPlataforma(f.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                    ativo ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.label}
                  <span className={cn("text-[11px] font-semibold tabular-nums px-1.5 py-px rounded-full", ativo ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Megaphone className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-sm font-medium text-foreground">Nenhuma campanha encontrada</p>
              <p className="text-sm text-muted-foreground">Cadastre uma campanha para começar a atribuir leads.</p>
              <Button onClick={() => setOpenDrawer(true)} className="mt-2 gap-2"><Plus className="h-4 w-4" /> Nova Campanha</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Nome</th>
                  <th className="px-3 py-2.5 font-semibold">Plataforma</th>
                  <th className="px-3 py-2.5 font-semibold">UTM Campaign</th>
                  <th className="px-3 py-2.5 font-semibold">Período</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Orçamento</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Leads</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => abrirEdicao(c.id)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <p className={cn("font-medium", c.ativo ? "text-foreground" : "text-muted-foreground line-through")}>{c.nome}</p>
                      {!c.ativo && <p className="text-xs text-muted-foreground">Inativa</p>}
                    </td>
                    <td className="px-3 py-3"><PlataformaBadge plataforma={c.plataforma} /></td>
                    <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{c.utmCampaign || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {c.dataInicio || c.dataFim
                        ? `${c.dataInicio ? formatDate(c.dataInicio) : "..."} – ${c.dataFim ? formatDate(c.dataFim) : "..."}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {c.orcamento != null && Number(c.orcamento) > 0 ? formatBRL(Number(c.orcamento)) : "—"}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-foreground font-medium">{c._count?.leads ?? 0}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors" title="Ações" />}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLinkCamp(c)}>
                            <Link2 className="h-4 w-4 mr-2" /> Copiar link com UTMs
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => excluir(c)} className="text-danger focus:text-danger">
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
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

      <CreateDrawer open={openDrawer} onOpenChange={setOpenDrawer} title="Nova Campanha" width="lg" onCreated={carregar}>
        <CampanhaForm />
      </CreateDrawer>

      {/* Drawer de edição (mesmo visual do CreateDrawer, local) */}
      {editOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setEditOpen(false)} aria-hidden />
      )}
      <Sheet open={editOpen} onOpenChange={setEditOpen} modal={false}>
        <SheetContent
          side="right"
          className="w-full max-w-3xl flex flex-col p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-6 py-4">
            <SheetTitle>Editar Campanha</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 bg-muted/60">
            {editOpen && editCamp && (
              <CampanhaForm
                campanha={editCamp}
                onSaved={() => { setEditOpen(false); carregar(); }}
                onCancel={() => setEditOpen(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <CopiarLinkDialog campanha={linkCamp} onClose={() => setLinkCamp(null)} />
    </div>
  );
}
