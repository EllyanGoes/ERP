"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Paperclip, Upload, Trash2, Download, Loader2,
  FileText, FileImage, FileSpreadsheet, File,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Anexo = {
  id: string;
  nome: string;
  url: string;
  tamanho: number;
  tipo: string;
  createdAt: string;
};

type Props = {
  /** API base: /api/suprimentos/cotacoes/{id}/fornecedores/{cfId}/anexos */
  apiBase: string;
  /** If true, upload is disabled (e.g. CF not yet created) */
  disabled?: boolean;
  disabledHint?: string;
  /** Optionally seed initial attachments (to avoid extra fetch) */
  initialAnexos?: Anexo[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ tipo }: { tipo: string }) {
  if (tipo.startsWith("image/")) return <FileImage className="w-4 h-4 text-purple-500" />;
  if (tipo === "application/pdf")  return <FileText   className="w-4 h-4 text-red-500"    />;
  if (tipo.includes("spreadsheet") || tipo.includes("excel"))
    return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
  return <File className="w-4 h-4 text-blue-400" />;
}

export default function AnexosSection({ apiBase, disabled, disabledHint, initialAnexos }: Props) {
  const [anexos, setAnexos]         = useState<Anexo[]>(initialAnexos ?? []);
  const [loading, setLoading]       = useState(!initialAnexos);
  const [uploading, setUploading]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]           = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing attachments if not seeded
  useEffect(() => {
    if (initialAnexos || disabled) { setLoading(false); return; }
    fetch(`${apiBase}`)
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j.data)) setAnexos(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]); // eslint-disable-line

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(apiBase, { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Erro ao enviar arquivo"); return; }
        setAnexos((prev) => [...prev, json.data]);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [apiBase, disabled]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setError(j.error || "Erro ao excluir"); return; }
      setAnexos((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("Erro de conexão.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    uploadFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Anexos</h3>
        {!disabled && (
          <span className="text-xs text-muted-foreground">PDF, imagens, planilhas — máx. 20 MB por arquivo</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger bg-danger/10 px-3 py-1.5 rounded-lg">{error}</p>
      )}

      {/* File list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-1.5">
          {anexos.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-muted group"
            >
              <FileIcon tipo={a.tipo} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{a.nome}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(a.tamanho)}</p>
              </div>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
                title="Baixar"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:text-danger hover:bg-danger/10 transition-colors"
                  title="Excluir"
                >
                  {deletingId === a.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / upload button */}
      {disabled ? (
        <p className="text-xs text-muted-foreground italic py-1">
          {disabledHint ?? "Salve a proposta primeiro para poder adicionar anexos."}
        </p>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
            dragOver
              ? "border-blue-400 bg-info/10"
              : "border-border hover:border-blue-300 hover:bg-muted"
          )}
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          ) : (
            <Upload className={cn("w-5 h-5", dragOver ? "text-blue-500" : "text-muted-foreground/60")} />
          )}
          <p className="text-xs text-muted-foreground select-none text-center">
            {uploading
              ? "Enviando..."
              : dragOver
              ? "Solte para anexar"
              : "Clique ou arraste arquivos aqui"
            }
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,.rar"
            onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); }}
          />
        </div>
      )}
    </div>
  );
}
