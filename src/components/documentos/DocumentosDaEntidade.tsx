"use client";

// Aba "Documentos" nas telas de entidade (fornecedor/colaborador/bem/cliente):
// lista os documentos vinculados e permite cadastrar já vinculado.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session-context";
import { Loader2, Plus, FileArchive } from "lucide-react";
import { DocumentoListaDTO, StatusDocBadge, ValidadeCell, IconesDoc } from "./comum";
import DocumentoCreateDrawer from "./DocumentoCreateDrawer";

export default function DocumentosDaEntidade({
  tipo, id,
}: {
  tipo: "fornecedor" | "cliente" | "colaborador" | "imobilizado";
  id: string;
}) {
  const router = useRouter();
  const { canAccess } = useSession();
  const [documentos, setDocumentos] = useState<DocumentoListaDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const temModulo = canAccess("documentos");

  const load = useCallback(async () => {
    if (!temModulo) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/documentos?entidade=${tipo}:${id}`);
      const json = await res.json();
      if (res.ok) setDocumentos(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [tipo, id, temModulo]);
  useEffect(() => { load(); }, [load]);

  if (!temModulo) {
    return <p className="text-sm text-muted-foreground italic py-6 text-center">Sem acesso ao módulo de Documentos.</p>;
  }
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{documentos.length} documento{documentos.length === 1 ? "" : "s"} vinculado{documentos.length === 1 ? "" : "s"}</p>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Novo documento
        </Button>
      </div>

      {documentos.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
          <FileArchive className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum documento vinculado.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Documento</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Categoria</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Validade</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documentos.map((d) => (
                <tr key={d.id} className="hover:bg-muted cursor-pointer" onClick={() => router.push(`/documentos/${d.id}`)}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-foreground font-medium">{d.titulo} <IconesDoc doc={d} /></span>
                    {d.numero && <span className="block font-mono text-xs text-muted-foreground">{d.numero}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.categoria.nome}</td>
                  <td className="px-4 py-2.5 text-right"><ValidadeCell doc={d} /></td>
                  <td className="px-4 py-2.5"><StatusDocBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <DocumentoCreateDrawer
          vinculo={{ tipo, id }}
          onFechar={() => setShowCreate(false)}
          onCriado={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
