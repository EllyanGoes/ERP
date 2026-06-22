"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, Check, X, Search, ChevronDown } from "lucide-react";

interface FluxoOpt { id: string; nome: string; }
interface ProdLite { id: string; codigo: string; descricao: string; }
export interface NovaEngResult {
  engenhariaId: string;
  item: { id: string; codigo: string; descricao: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, o fluxo é fixo (não mostra o seletor de fluxo). */
  fluxoId?: string;
  /** Habilita o modo "criar produto novo" além de escolher um existente. */
  permitirNovoProduto?: boolean;
  onCreated: (r: NovaEngResult) => void;
}

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 bg-card";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

export default function NovaEngenhariaDialog({ open, onOpenChange, fluxoId, permitirNovoProduto, onCreated }: Props) {
  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoSel, setFluxoSel] = useState<string>(fluxoId ?? "");
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  const [produtos, setProdutos] = useState<ProdLite[]>([]);
  const [q, setQ] = useState("");
  const [item, setItem] = useState<ProdLite | null>(null);
  const [descricaoNova, setDescricaoNova] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Reseta a cada abertura.
  useEffect(() => {
    if (open) { setModo("existente"); setItem(null); setDescricaoNova(""); setQ(""); setErro(null); setBusy(false); setFluxoSel(fluxoId ?? ""); }
  }, [open, fluxoId]);

  // Carrega fluxos (quando não é fixo) e a lista de produtos acabados.
  useEffect(() => {
    if (!open) return;
    let active = true;
    if (!fluxoId) {
      fetch("/api/pcp/fluxos").then((r) => r.json()).then((j) => {
        if (!active) return;
        const fs: FluxoOpt[] = j.data ?? [];
        setFluxos(fs);
        setFluxoSel((s) => s || fs[0]?.id || "");
      }).catch(() => {});
    }
    fetch("/api/itens?categoria=PRODUTO_ACABADO,WIP&limit=300").then((r) => r.json()).then((j) => {
      if (active) setProdutos((j.data ?? []).map((it: ProdLite) => ({ id: it.id, codigo: it.codigo, descricao: it.descricao })));
    }).catch(() => {});
    return () => { active = false; };
  }, [open, fluxoId]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return produtos.slice(0, 50);
    return produtos.filter((p) => p.descricao.toLowerCase().includes(t) || p.codigo.toLowerCase().includes(t)).slice(0, 50);
  }, [produtos, q]);

  const alvoFluxo = fluxoId ?? fluxoSel;

  async function criar() {
    setErro(null);
    if (!alvoFluxo) { setErro("Escolha o fluxo de produção"); return; }
    if (modo === "existente" && !item) { setErro("Escolha o produto"); return; }
    if (modo === "novo" && !descricaoNova.trim()) { setErro("Informe a descrição do produto"); return; }
    setBusy(true);
    try {
      let prod: ProdLite;
      if (modo === "novo") {
        const rp = await fetch("/api/suprimentos/produtos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descricao: descricaoNova.trim(), tipo: "PRODUTO", categoriaEstoque: "PRODUTO_ACABADO", vendavel: true }),
        });
        const jp = await rp.json();
        if (!rp.ok) throw new Error(jp?.error ?? "Erro ao criar o produto");
        prod = { id: jp.data.id, codigo: jp.data.codigo, descricao: jp.data.descricao };
      } else {
        prod = item!;
      }

      const re = await fetch("/api/pcp/engenharia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: prod.id, fluxoId: alvoFluxo }),
      });
      const je = await re.json();
      let engenhariaId: string;
      if (re.ok) {
        engenhariaId = je.data.id as string;
      } else {
        const lr = await fetch("/api/pcp/engenharia");
        const lj = await lr.json();
        const existente = (lj.data ?? []).find((e: { id: string; item?: { id: string } }) => e.item?.id === prod.id);
        if (!existente) throw new Error(je?.error ?? "Erro ao criar a engenharia");
        engenhariaId = existente.id as string;
      }

      onCreated({ engenhariaId, item: prod });
      onOpenChange(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova engenharia</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

          {permitirNovoProduto && (
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              <button type="button" onClick={() => setModo("existente")} className={`px-2.5 py-1 rounded-md ${modo === "existente" ? "bg-cyan-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>Produto existente</button>
              <button type="button" onClick={() => setModo("novo")} className={`px-2.5 py-1 rounded-md ${modo === "novo" ? "bg-cyan-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>Produto novo</button>
            </div>
          )}

          {modo === "existente" ? (
            <div>
              <label className={labelCls}>Produto (acabado ou em processo) *</label>
              <div ref={pickerRef} className="relative">
                <button type="button" onClick={() => setPickerOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-cyan-500">
                  {item ? (
                    <span className="truncate"><span className="font-mono text-muted-foreground text-xs mr-2">{item.codigo}</span>{item.descricao}</span>
                  ) : (
                    <span className="text-muted-foreground">Selecionar produto…</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                </button>
                {pickerOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                    <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
                      <Search className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" className="flex-1 text-sm outline-none bg-transparent min-w-0" autoFocus />
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {filtrados.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto. Use “Produto novo”.</div>
                      ) : filtrados.map((p) => (
                        <button key={p.id} type="button" onClick={() => { setItem(p); setPickerOpen(false); setQ(""); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">
                          <span className="font-mono text-muted-foreground text-xs mr-2">{p.codigo}</span>{p.descricao}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Descrição do produto novo *</label>
              <input className={inputCls} value={descricaoNova} onChange={(e) => setDescricaoNova(e.target.value)} placeholder="ex.: BV 09X19X29" autoFocus />
              <p className="text-[11px] text-muted-foreground mt-1">O código é gerado automaticamente (PROD-XXXX) e a categoria fica como Produto acabado.</p>
            </div>
          )}

          {!fluxoId && (
            <div>
              <label className={labelCls}>Fluxo de produção *</label>
              <select className={inputCls} value={fluxoSel} onChange={(e) => setFluxoSel(e.target.value)}>
                <option value="">Selecionar…</option>
                {fluxos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <X className="w-4 h-4" /> Cancelar
          </button>
          <button onClick={criar} disabled={busy} className="inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
