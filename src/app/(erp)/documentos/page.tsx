"use client";

// Acervo de documentos — lista com cards de resumo, filtros persistidos e drawer de criação.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Search, FileArchive, AlertTriangle, RefreshCw } from "lucide-react";
import { DocumentoListaDTO, StatusDocBadge, ValidadeCell, IconesDoc, entidadeVinculada } from "@/components/documentos/comum";
import DocumentoCreateDrawer from "@/components/documentos/DocumentoCreateDrawer";

type Categoria = { id: string; nome: string };

export default function DocumentosPage() {
  const router = useRouter();
  useTabTitle("Documentos");

  const [documentos, setDocumentos] = useState<DocumentoListaDTO[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [fCategoria, setFCategoria] = usePersistedState<string>("documentos:fcat", "");
  const [fStatus, setFStatus] = usePersistedState<string>("documentos:fstatus", "");
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fCategoria) p.set("categoria", fCategoria);
      if (busca.trim()) p.set("busca", busca.trim());
      const res = await fetch(`/api/documentos?${p.toString()}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao carregar"); return; }
      setDocumentos(json.data ?? []);
      setError("");
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [fCategoria, busca]);

  useEffect(() => {
    const t = setTimeout(load, busca ? 300 : 0); // debounce da busca
    return () => clearTimeout(t);
  }, [load, busca]);

  useEffect(() => {
    fetch("/api/documentos/categorias").then((r) => r.json()).then((j) => setCategorias(j.data ?? [])).catch(() => {});
  }, []);

  const visiveis = documentos.filter((d) => !fStatus || d.status === fStatus);
  const nVencidos = documentos.filter((d) => d.status === "VENCIDO").length;
  const nVencendo = documentos.filter((d) => d.status === "VENCE_EM_BREVE").length;
  const nRenovacao = documentos.filter((d) => d.status === "EM_RENOVACAO").length;

  function CardResumo({ titulo, valor, cls, filtro }: { titulo: string; valor: number; cls: string; filtro: string }) {
    return (
      <button
        onClick={() => setFStatus(fStatus === filtro ? "" : filtro)}
        className={cn(
          "bg-card rounded-xl border px-4 py-3 text-left transition-colors",
          fStatus === filtro ? "border-blue-400 ring-2 ring-blue-100" : "border-border hover:border-blue-300"
        )}
      >
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("text-2xl font-bold", cls)}>{valor}</p>
      </button>
    );
  }

  return (
    <div>
      <PageHeader
        title="Documentos"
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar título, número, emissor, tag..."
                className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
              />
            </div>
            <select
              value={fCategoria}
              onChange={(e) => setFCategoria(e.target.value)}
              className="text-sm border border-border rounded-lg bg-card px-2 py-2 text-foreground"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Novo documento
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          <CardResumo titulo="Vencidos" valor={nVencidos} cls="text-danger" filtro="VENCIDO" />
          <CardResumo titulo="Vencem em breve" valor={nVencendo} cls="text-warning" filtro="VENCE_EM_BREVE" />
          <CardResumo titulo="Em renovação" valor={nRenovacao} cls="text-info" filtro="EM_RENOVACAO" />
          <CardResumo titulo="Total no acervo" valor={documentos.length} cls="text-foreground" filtro="" />
        </div>

        {error && <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <FileArchive className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum documento {fStatus || fCategoria || busca ? "com esses filtros" : "no acervo ainda"}.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Documento</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Categoria</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Número</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vinculado a</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Responsável</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Validade</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.map((d) => (
                  <tr key={d.id} className="hover:bg-muted cursor-pointer" onClick={() => router.push(`/documentos/${d.id}`)}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-foreground font-medium">
                        {d.titulo} <IconesDoc doc={d} />
                        {d.status === "EM_RENOVACAO" && <RefreshCw className="w-3 h-3 text-info" />}
                      </span>
                      {d.emissor && <span className="block text-xs text-muted-foreground">{d.emissor}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d.categoria.nome}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{d.numero || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{entidadeVinculada(d) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{d.responsavel?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right"><ValidadeCell doc={d} /></td>
                    <td className="px-4 py-2.5"><StatusDocBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nVencidos > 0 && !fStatus && (
          <p className="text-xs text-danger inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {nVencidos} documento{nVencidos > 1 ? "s" : ""} vencido{nVencidos > 1 ? "s" : ""} — clique no card acima para filtrar.
          </p>
        )}
      </div>

      {showCreate && (
        <DocumentoCreateDrawer
          onFechar={() => setShowCreate(false)}
          onCriado={(id) => { setShowCreate(false); router.push(`/documentos/${id}`); }}
        />
      )}
    </div>
  );
}
