"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCPFCNPJ } from "@/lib/utils";
import { Search, UserCheck, UserPlus, Check, Loader2 } from "lucide-react";

type ClienteResultado = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  cidade?: string | null;
  estado?: string | null;
};

export default function ConverterLeadDialog({
  lead,
  open,
  onOpenChange,
  onConverted,
}: {
  lead: { id: string; nome: string; email?: string | null; telefone?: string | null; empresaNome?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted: () => void;
}) {
  const [modo, setModo] = useState<"vincular" | "criar">("vincular");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ClienteResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [clienteSel, setClienteSel] = useState<ClienteResultado | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setModo("vincular");
      setBusca("");
      setResultados([]);
      setClienteSel(null);
      setErro(null);
      setBusy(false);
    }
  }, [open]);

  // Busca de clientes com debounce
  useEffect(() => {
    if (modo !== "vincular" || !open) return;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const params = new URLSearchParams();
        if (busca) params.set("q", busca);
        params.set("limit", "20");
        const res = await fetch(`/api/clientes?${params.toString()}`);
        const json = await res.json();
        setResultados(json.data ?? []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca, modo, open]);

  async function confirmar() {
    setErro(null);
    if (modo === "vincular" && !clienteSel) {
      setErro("Selecione um cliente para vincular.");
      return;
    }
    setBusy(true);
    try {
      const body = modo === "vincular" ? { clienteId: clienteSel!.id } : { criarCliente: true };
      const res = await fetch(`/api/marketing/leads/${lead.id}/converter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onOpenChange(false);
        onConverted();
      } else {
        const json = await res.json().catch(() => ({}));
        setErro(json.error ?? "Erro ao converter o lead. Tente novamente.");
      }
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Converter lead em cliente</DialogTitle>
          <DialogDescription>
            O lead <b>{lead.nome}</b> será marcado como <b>ganho</b> e vinculado a um cliente.
          </DialogDescription>
        </DialogHeader>

        {/* Escolha do modo */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModo("vincular")}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              modo === "vincular" ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
            )}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-md shrink-0", modo === "vincular" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              <UserCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Vincular existente</p>
              <p className="text-xs text-muted-foreground">Já é cliente da base</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setModo("criar")}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              modo === "criar" ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
            )}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-md shrink-0", modo === "criar" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Criar novo cliente</p>
              <p className="text-xs text-muted-foreground">A partir dos dados do lead</p>
            </div>
          </button>
        </div>

        {modo === "vincular" ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente por nome ou CPF/CNPJ..."
                className="pl-9 h-10 border-border"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {buscando ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : resultados.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum cliente encontrado.</p>
              ) : (
                resultados.map((c) => {
                  const sel = clienteSel?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClienteSel(sel ? null : c)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                        sel ? "bg-primary/5" : "hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground truncate">{c.nomeFantasia || c.razaoSocial}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {c.cpfCnpj ? formatCPFCNPJ(c.cpfCnpj) : c.razaoSocial}
                          {c.cidade ? ` · ${c.cidade}${c.estado ? `/${c.estado}` : ""}` : ""}
                        </span>
                      </span>
                      {sel && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Prévia do novo cliente</p>
            <p className="text-sm text-foreground"><span className="text-muted-foreground">Nome:</span> {lead.empresaNome || lead.nome}</p>
            {lead.empresaNome && <p className="text-sm text-foreground"><span className="text-muted-foreground">Contato:</span> {lead.nome}</p>}
            <p className="text-sm text-foreground"><span className="text-muted-foreground">E-mail:</span> {lead.email || "—"}</p>
            <p className="text-sm text-foreground"><span className="text-muted-foreground">Telefone:</span> {lead.telefone || "—"}</p>
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{erro}</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirmar} disabled={busy || (modo === "vincular" && !clienteSel)} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Converter em cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
