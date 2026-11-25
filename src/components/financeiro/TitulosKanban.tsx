"use client";

// Visão em quadro (kanban) dos títulos a pagar, no padrão do Fluxo de Compras:
// uma coluna por situação (Sem vencimento · A vencer · Vencido · Parcial ·
// Pago), nome em pílula colorida, contagem e total; cartões enxutos.
// Recebe os títulos já filtrados pela tela (mês, busca, chips).
import { Clock, ShoppingCart } from "lucide-react";
import { cn, formatBRL, formatDate } from "@/lib/utils";

export type TituloKanban = {
  id: string;
  numero: string;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;
  saldo: number;
  vencimento: string | Date | null;
  status: string;
  compra: string | null;
  antecipado: boolean;
};

type Coluna = "sem_vencimento" | "a_vencer" | "vencido" | "parcial" | "pago";

const COLUNAS: { id: Coluna; label: string; cor: string }[] = [
  { id: "sem_vencimento", label: "Sem vencimento", cor: "#8b5cf6" },
  { id: "a_vencer",       label: "A vencer",       cor: "#3b82f6" },
  { id: "vencido",        label: "Vencido",        cor: "#ef4444" },
  { id: "parcial",        label: "Parcial",        cor: "#f59e0b" },
  { id: "pago",           label: "Pago",           cor: "#22c55e" },
];

// Vencimento é data pura gravada em UTC 00:00 — compara pelo "AAAA-MM-DD"
// (new Date() < hoje local jogaria o título que vence HOJE em "Vencido").
function diaISO(d: string | Date): string {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}

function colunaDo(t: TituloKanban, hoje: string): Coluna | null {
  if (t.status === "CANCELADA") return null;
  if (t.status === "PAGA") return "pago";
  if (t.status === "PARCIAL") return "parcial";
  if (!t.vencimento) return "sem_vencimento";
  return diaISO(t.vencimento) < hoje ? "vencido" : "a_vencer";
}

export default function TitulosKanban({ itens, onAbrir }: { itens: TituloKanban[]; onAbrir: (id: string) => void }) {
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const porColuna: Record<Coluna, TituloKanban[]> = { sem_vencimento: [], a_vencer: [], vencido: [], parcial: [], pago: [] };
  for (const t of itens) {
    const c = colunaDo(t, hoje);
    if (c) porColuna[c].push(t);
  }
  // Vencimento mais próximo primeiro (vencidos: o mais antigo no topo).
  for (const c of Object.keys(porColuna) as Coluna[]) {
    porColuna[c].sort((a, b) => (a.vencimento ? diaISO(a.vencimento) : "9999").localeCompare(b.vencimento ? diaISO(b.vencimento) : "9999"));
  }

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-1 h-[calc(100vh-200px)] min-h-[420px]">
      {COLUNAS.map((col) => {
        const lista = porColuna[col.id];
        const total = lista.reduce((s, t) => s + (col.id === "pago" ? t.valor : t.saldo), 0);
        return (
          <div key={col.id} className="flex-1 min-w-[260px] max-w-[380px] bg-muted/60 rounded-xl border border-border flex flex-col max-h-full">
            <div className="flex items-center gap-2 px-3 py-2.5 shrink-0">
              <span
                className="font-semibold text-sm truncate rounded-md px-1.5 py-0.5 -my-0.5"
                style={{ backgroundColor: `${col.cor}1f`, color: col.cor }}
              >
                {col.label}
              </span>
              <span className="text-xs text-muted-foreground">{lista.length}</span>
              <span className="ml-auto text-xs font-semibold text-foreground tabular-nums" title={col.id === "pago" ? "Total pago" : "Total em aberto"}>
                {formatBRL(total)}
              </span>
            </div>
            <div className="px-2 pb-2 space-y-2 overflow-y-auto flex-1 min-h-[6px]">
              {lista.length === 0 && <p className="text-xs text-muted-foreground/70 text-center py-4">Nenhum título</p>}
              {lista.map((t) => {
                const vencido = col.id === "vencido";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onAbrir(t.id)}
                    className="w-full text-left bg-card rounded-lg border border-border px-3 py-2.5 shadow-sm hover:border-blue-400 transition-colors"
                  >
                    <p className="text-sm text-foreground truncate" title={t.fornecedor ?? undefined}>{t.fornecedor ?? "Sem fornecedor"}</p>
                    {t.descricao && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2" title={t.descricao}>{t.descricao}</p>}
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{t.numero}</span>
                      {t.compra && (
                        <span className="inline-flex items-center gap-0.5" title={t.antecipado ? "Compra · pagamento antecipado" : "Compra"}>
                          <ShoppingCart className="w-3 h-3" />{t.compra}
                        </span>
                      )}
                      {t.vencimento ? (
                        <span className={cn("inline-flex items-center gap-0.5", vencido && "font-semibold text-danger")}>
                          <Clock className="w-3 h-3" />{formatDate(t.vencimento)}
                        </span>
                      ) : <span className="italic">a combinar</span>}
                      <span className="ml-auto font-semibold text-foreground tabular-nums">
                        {formatBRL(col.id === "pago" ? t.valor : t.saldo)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
