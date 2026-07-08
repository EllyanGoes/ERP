"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBRL, cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Loader2, Upload, FileText, MoreVertical, Pencil, Trash2 } from "lucide-react";

type Folha = {
  id: string;
  competencia: string;
  status: "EM_REVISAO" | "FECHADA" | "CANCELADA";
  totalBruto: string;
  totalLiquido: string;
  arquivoNome: string | null;
  _count: { itens: number };
  itensPendentes: number;
};

const STATUS_LABEL: Record<Folha["status"], string> = { EM_REVISAO: "Em revisão", FECHADA: "Fechada", CANCELADA: "Cancelada" };

function competenciaLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default function FolhasPage() {
  const router = useRouter();
  const [folhas, setFolhas] = useState<Folha[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/rh/folhas");
    const j = await r.json();
    setFolhas(j.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function excluir(f: Folha) {
    if (!confirm(`Excluir a folha ${competenciaLabel(f.competencia)}? Esta ação é permanente.`)) return;
    const r = await fetch(`/api/rh/folhas/${f.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Falha ao excluir a folha"); return; }
    setErro("");
    load();
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true); setErro("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/rh/folhas", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Falha no upload"); return; }
      // Abre o detalhe; a extração é disparada lá.
      router.push(`/rh/folhas/${j.data.id}?extrair=1`);
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="Folhas de Pagamento"
        breadcrumbs={[{ label: "RH" }, { label: "Folhas de Pagamento" }]}
        action={
          <>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onUpload} />
            <Button onClick={() => fileRef.current?.click()} disabled={enviando}>
              {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Nova folha (PDF)
            </Button>
          </>
        }
      />
      <div className="px-8 pb-8 space-y-4">
        {erro && <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">{erro}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : folhas.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma folha</p>
            <p className="text-sm mt-1">Suba o PDF da folha em &quot;Nova folha&quot; — a IA extrai os dados.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Competência</th>
                  <th className="text-center px-4 py-3 font-semibold">Colaboradores</th>
                  <th className="text-right px-4 py-3 font-semibold">Bruto</th>
                  <th className="text-right px-4 py-3 font-semibold">Líquido</th>
                  <th className="text-center px-4 py-3 font-semibold">Classificação</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {folhas.map((f) => (
                  <tr key={f.id} className="hover:bg-muted cursor-pointer" onClick={() => router.push(`/rh/folhas/${f.id}`)}>
                    <td className="px-4 py-3 font-medium text-foreground">{competenciaLabel(f.competencia)}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{f._count.itens}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(parseFloat(f.totalBruto))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(parseFloat(f.totalLiquido))}</td>
                    <td className="px-4 py-3 text-center">
                      {f._count.itens === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : f.itensPendentes > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-warning/15 text-warning border-warning/30 tabular-nums">
                          {/* floor p/ nunca exibir 100% enquanto houver pendência */}
                          {Math.floor(((f._count.itens - f.itensPendentes) / f._count.itens) * 100)}% classificado (faltam {f.itensPendentes})
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-success/15 text-success border-success/30 tabular-nums">
                          100% classificado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                        f.status === "FECHADA" ? "bg-success/15 text-success border-success/30"
                          : f.status === "CANCELADA" ? "bg-muted text-muted-foreground border-border"
                          : "bg-warning/15 text-warning border-warning/30",
                      )}>
                        {STATUS_LABEL[f.status]}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<button className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Ações" />}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/rh/folhas/${f.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => excluir(f)} className="text-danger" disabled={f.status === "FECHADA"}>
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
