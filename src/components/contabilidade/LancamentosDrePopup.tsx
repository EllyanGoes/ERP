"use client";

// Popup dos números da DRE: lista os lançamentos que compõem a célula
// (conta/linha × mês). Fonte ERP → partidas do ERP; fonte Dexion → lançamentos
// do contador (por prefixo de conta). Mesmo visual p/ as duas origens.
import { useEffect, useState } from "react";
import ModalPortal from "@/components/shared/ModalPortal";
import EscClose from "@/components/shared/EscClose";
import { Loader2, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type AlvoLancamentos =
  | { fonte: "erp"; contaIds: string[]; titulo: string; ano: number; mes: number }
  | { fonte: "dexion"; conta: string; titulo: string; ano: number; mes: number };

type Linha = { chave: string; data: string; numero?: string | null; historico: string; contrapartida: string; lado: "D" | "C"; valor: number; conta?: string };

export default function LancamentosDrePopup({ alvo, onFechar }: { alvo: AlvoLancamentos; onFechar: () => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ atualizadoEm?: string; erroAtualizacao?: string | null } | null>(null);

  async function load(forcar = false) {
    setLoading(true); setErro("");
    const url = alvo.fonte === "erp"
      ? `/api/contabilidade/dre/lancamentos?contaIds=${encodeURIComponent(alvo.contaIds.join(","))}&ano=${alvo.ano}&mes=${alvo.mes}`
      : `/api/contabilidade/dexion/lancamentos?exercicio=${alvo.ano}&conta=${encodeURIComponent(alvo.conta)}&mes=${alvo.mes}${forcar ? "&atualizar=1" : ""}`;
    const res = await fetch(url).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setLoading(false);
    if (!res?.ok) { setErro(j?.error || "Não foi possível carregar os lançamentos."); setLinhas([]); return; }
    if (alvo.fonte === "erp") {
      setLinhas((j.data ?? []).map((l: { id: string; data: string; numero: string | null; historico: string; contrapartida: string; lado: "D" | "C"; valor: number; conta: string }) =>
        ({ chave: l.id, data: l.data, numero: l.numero, historico: l.historico, contrapartida: l.contrapartida, lado: l.lado, valor: l.valor, conta: l.conta })));
    } else {
      setLinhas((j.data ?? []).map((l: { lancamento: number; partida: number; data: string; historico: string; lado: "D" | "C"; valor: number; contaDebito: string | null; contaCredito: string | null; contaDebitoNome: string | null; contaCreditoNome: string | null }) => {
        const propria = l.lado === "D" ? `${l.contaDebito ?? ""} ${l.contaDebitoNome ?? ""}` : `${l.contaCredito ?? ""} ${l.contaCreditoNome ?? ""}`;
        const outra = l.lado === "D" ? (l.contaCredito ? `${l.contaCredito} ${l.contaCreditoNome ?? ""}` : "(várias partidas)") : (l.contaDebito ? `${l.contaDebito} ${l.contaDebitoNome ?? ""}` : "(várias partidas)");
        return { chave: `${l.lancamento}-${l.partida}`, data: l.data, numero: String(l.lancamento), historico: l.historico || "—", contrapartida: outra, lado: l.lado, valor: l.valor, conta: propria.trim() };
      }));
      setMeta({ atualizadoEm: j.atualizadoEm, erroAtualizacao: j.erroAtualizacao });
    }
  }
  useEffect(() => { load(); }, [alvo]); // eslint-disable-line react-hooks/exhaustive-deps

  const totD = (linhas ?? []).filter((l) => l.lado === "D").reduce((a, l) => a + l.valor, 0);
  const totC = (linhas ?? []).filter((l) => l.lado === "C").reduce((a, l) => a + l.valor, 0);
  const periodo = alvo.mes >= 1 && alvo.mes <= 12 ? `${MESES[alvo.mes - 1]}/${alvo.ano}` : `Exercício ${alvo.ano}`;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
        <EscClose onClose={onFechar} />
        <div className="bg-card rounded-2xl shadow-2xl w-[96vw] max-w-[1700px] my-4 flex flex-col max-h-[92vh]">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{alvo.fonte === "dexion" ? "Lançamentos do contador (Dexion)" : "Lançamentos do ERP"} · {periodo}</p>
              <p className="text-base font-semibold text-foreground truncate">{alvo.titulo}</p>
              {alvo.fonte === "dexion" && meta?.atualizadoEm && (
                <p className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
                  Dados de {new Date(meta.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {meta.erroAtualizacao && <span className="text-warning">· Dexion indisponível, mostrando o cache</span>}
                  <button onClick={() => load(true)} className="inline-flex items-center gap-1 text-info hover:underline"><RefreshCw className="w-3 h-3" /> Atualizar do Dexion</button>
                </p>
              )}
            </div>
            <button onClick={onFechar} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Fechar (Esc)"><X className="w-4 h-4" /></button>
          </div>
          <div className="overflow-auto flex-1">
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : erro ? (
              <p className="px-5 py-8 text-sm text-danger">{erro}</p>
            ) : (
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-muted text-xs text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 w-24">Data</th>
                    <th className="text-left px-3 py-2 w-24">Nº</th>
                    <th className="text-left px-3 py-2 min-w-[22rem]">Histórico</th>
                    <th className="text-left px-3 py-2">Conta</th>
                    <th className="text-left px-3 py-2">Contrapartida</th>
                    <th className="text-right px-3 py-2 w-32">Débito</th>
                    <th className="text-right px-4 py-2 w-32">Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(linhas ?? []).map((l) => (
                    <tr key={l.chave} className="hover:bg-muted/60">
                      <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground align-top">{l.data.split("-").reverse().join("/")}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{l.numero ?? ""}</td>
                      <td className="px-3 py-1.5 text-foreground whitespace-normal break-words leading-snug">{l.historico}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-normal leading-snug min-w-[14rem]">{l.conta}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-normal leading-snug min-w-[14rem]">{l.contrapartida}</td>
                      <td className="px-3 py-1.5 text-right">{l.lado === "D" ? fmt(l.valor) : ""}</td>
                      <td className="px-4 py-1.5 text-right">{l.lado === "C" ? fmt(l.valor) : ""}</td>
                    </tr>
                  ))}
                  {(linhas ?? []).length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum lançamento no período.</td></tr>}
                </tbody>
                {(linhas ?? []).length > 0 && (
                  <tfoot className="bg-muted font-semibold sticky bottom-0">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-foreground">{linhas!.length} lançamento{linhas!.length === 1 ? "" : "s"} · saldo <span className={cn(totD - totC < 0 && "text-info")}>{fmt(totD - totC)}</span></td>
                      <td className="px-3 py-2 text-right">{fmt(totD)}</td>
                      <td className="px-4 py-2 text-right">{fmt(totC)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
