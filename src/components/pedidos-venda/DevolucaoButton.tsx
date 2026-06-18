"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Loader2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import ModalPortal from "@/components/shared/ModalPortal";
import { formatBRL, decimalToNumber, parseDecimal } from "@/lib/utils";

type ItemRow = { id: string; descricao: string; codigo: string; quantidade: number; precoUnitario: number };
type ContaOpt = { id: string; nome: string; tipo?: string; ativo?: boolean };

/**
 * "Registrar devolução" — devolução parcial por item de um pedido. Fase B1: só
 * ESTORNO (dinheiro de volta). Crédito/Troca aparecem como "em breve".
 */
export default function DevolucaoButton({ pedidoVendaId, pedidoNumero, onDone }: {
  pedidoVendaId: string; pedidoNumero: string; onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<ItemRow[]>([]);
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [contas, setContas] = useState<ContaOpt[]>([]);
  const [contaId, setContaId] = useState("");
  const [tipo, setTipo] = useState<"ESTORNO" | "CREDITO" | "TROCA">("ESTORNO");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setErro(null);
    Promise.all([
      fetch(`/api/pedidos-venda/${pedidoVendaId}`).then((r) => r.json()),
      fetch("/api/financeiro/contas").then((r) => r.json()),
    ]).then(([pj, cj]) => {
      const lista = (pj.data?.itens ?? []).map((it: { id: string; quantidade: unknown; precoUnitario: unknown; item: { codigo: string; descricao: string } }) => ({
        id: it.id, descricao: it.item.descricao, codigo: it.item.codigo,
        quantidade: decimalToNumber(it.quantidade), precoUnitario: decimalToNumber(it.precoUnitario),
      }));
      setItens(lista);
      const cs: ContaOpt[] = Array.isArray(cj) ? cj : (cj.data ?? []);
      setContas(cs);
      setContaId((cs.find((c) => c.tipo === "CAIXA") ?? cs[0])?.id ?? "");
    }).catch(() => setErro("Falha ao carregar o pedido.")).finally(() => setLoading(false));
  }, [open, pedidoVendaId]);

  const linhas = itens
    .map((it) => ({ ...it, q: parseDecimal(qtd[it.id] ?? "") }))
    .filter((l) => Number.isFinite(l.q) && l.q > 0);
  const total = linhas.reduce((s, l) => s + l.q * l.precoUnitario, 0);

  async function salvar() {
    setErro(null);
    if (linhas.length === 0) { setErro("Informe a quantidade a devolver de ao menos um item."); return; }
    for (const l of linhas) {
      if (l.q > l.quantidade + 1e-6) { setErro(`Quantidade a devolver de "${l.descricao}" maior que a vendida.`); return; }
    }
    if (tipo === "ESTORNO" && !contaId) { setErro("Selecione a conta de saída do estorno."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/comercial/devolucoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoVendaId, tipoResolucao: tipo,
          contaBancariaId: tipo === "ESTORNO" ? contaId : null,
          observacoes: obs.trim() || null,
          itens: linhas.map((l) => ({ pedidoVendaItemId: l.id, quantidade: l.q })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(j.error ?? "Erro ao registrar devolução."); return; }
      setOpen(false); setQtd({}); setObs("");
      onDone?.(); router.refresh();
    } catch { setErro("Erro de conexão."); }
    finally { setSalvando(false); }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5 text-warning border-orange-200 hover:bg-warning/10">
        <Undo2 className="w-3.5 h-3.5" /> Registrar devolução
      </Button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex justify-end bg-black/40" onClick={() => !salvando && setOpen(false)}>
            <div className="h-full w-full max-w-xl bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h3 className="text-lg font-bold text-foreground">Devolução — {pedidoNumero}</h3>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-muted-foreground text-2xl leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resolução</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["ESTORNO", "Estorno", "Dinheiro de volta"],
                          ["CREDITO", "Crédito", "Vale do cliente"],
                          ["TROCA", "Troca", "Outro material"],
                        ] as const).map(([val, label, desc]) => (
                          <button
                            key={val} type="button" onClick={() => setTipo(val)}
                            className={`rounded-lg border px-2 py-2 text-left transition-colors ${tipo === val ? "border-orange-400 bg-warning/10 ring-1 ring-orange-200" : "border-border hover:border-border"}`}
                          >
                            <span className="block text-sm font-medium text-foreground">{label}</span>
                            <span className="block text-[11px] text-muted-foreground">{desc}</span>
                          </button>
                        ))}
                      </div>
                      {tipo !== "ESTORNO" && (
                        <p className="text-[11px] text-teal-600">
                          {tipo === "TROCA" ? "Gera um crédito (vale) — use no caixa numa nova venda do material desejado." : "Gera um crédito (vale) que o cliente usa em compras futuras."}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens a devolver</p>
                      {itens.map((it) => (
                        <div key={it.id} className="grid grid-cols-[1fr_7rem] gap-2 items-center">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{it.descricao}</p>
                            <p className="text-[11px] text-muted-foreground">Vendido: {it.quantidade} · {formatBRL(it.precoUnitario)}/un</p>
                          </div>
                          <input
                            inputMode="decimal" value={qtd[it.id] ?? ""}
                            onChange={(e) => setQtd((p) => ({ ...p, [it.id]: e.target.value.replace(/[^0-9.,]/g, "") }))}
                            placeholder="0" max={it.quantidade}
                            className="h-9 rounded-lg border border-border px-2 text-sm text-right"
                          />
                        </div>
                      ))}
                    </div>

                    {tipo === "ESTORNO" && (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conta de saída (estorno)</label>
                        <ComboboxWithCreate
                          value={contaId}
                          onChange={(v) => setContaId(v)}
                          placeholder="Selecione"
                          noneLabel="Selecione"
                          triggerClassName="h-10 rounded-lg"
                          options={contas.filter((c) => c.ativo !== false).map((c) => ({ value: c.id, label: c.nome }))}
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observações <span className="font-normal normal-case text-muted-foreground">(opcional)</span></label>
                      <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Motivo da devolução" className="w-full h-10 rounded-lg border border-border px-3 text-sm" />
                    </div>

                    {erro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{erro}</p>}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 px-6 py-4 border-t border-border">
                <span className="text-sm text-muted-foreground">{tipo === "ESTORNO" ? "Total a estornar" : "Total em crédito"} <span className="font-bold text-foreground tabular-nums">{formatBRL(total)}</span></span>
                <div className="flex-1" />
                <Button onClick={salvar} disabled={salvando || loading} className="bg-orange-600 hover:bg-orange-700">
                  {salvando ? "Registrando..." : "Registrar devolução"}
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
