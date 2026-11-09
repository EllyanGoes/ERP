"use client";

// Popup SOMENTE LEITURA de um documento do quadro de acompanhamento de compras.
// Serve às 4 etapas (SC / cotação / pedido / DE) — o formato vem pronto de
// /api/compras/acompanhamento/[etapa]/[id]. No canto superior direito fica o
// atalho para abrir a página completa do documento; os elos da cadeia trocam
// o conteúdo do popup sem fechá-lo.
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, ExternalLink, Loader2, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "@/components/shared/StatusBadge";
import EmpresaTag from "@/components/shared/EmpresaTag";
import { Autoria } from "@/components/shared/Autoria";
import { cn, formatBRL, formatDate, formatDateTime } from "@/lib/utils";

export type EtapaCompra = "solicitacao" | "cotacao" | "pedido" | "entrada";
export type DocumentoRef = { etapa: EtapaCompra; id: string };

type Campo = { label: string; valor: string | number | null; tipo?: "texto" | "data" | "moeda"; full?: boolean };
type ItemLinha = {
  codigo: string; descricao: string; unidade: string | null;
  quantidade: number; quantidadeRecebida?: number | null;
  precoUnitario?: number | null; total?: number | null;
};
type Elo = { etapa: EtapaCompra; id: string; numero: string; status: string };
type Proposta = { fornecedor: string; status: string; total: number | null; escolhida: boolean };
type Detalhe = {
  etapa: EtapaCompra; id: string; numero: string; status: string; empresaId: string; href: string;
  campos: Campo[];
  itens: ItemLinha[];
  propostas?: Proposta[];
  cadeia: Elo[];
  historico: { id: string; numero: string; status: string; usuario: string | null; em: string }[];
  criadoPor: string | null;
  atualizadoPor: string | null;
};

const ETAPA_LABEL: Record<EtapaCompra, string> = {
  solicitacao: "Solicitação de Compras",
  cotacao: "Cotação de Compras",
  pedido: "Pedido de Compras",
  entrada: "Documento de Entrada",
};
const ORDEM: EtapaCompra[] = ["solicitacao", "cotacao", "pedido", "entrada"];

const fmtQtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function valorCampo(c: Campo): string {
  if (c.valor == null) return "—";
  if (c.tipo === "data") return formatDate(String(c.valor));
  if (c.tipo === "moeda") return formatBRL(c.valor);
  return String(c.valor);
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">{titulo}</div>
      {children}
    </div>
  );
}

export default function AcompanhamentoDetalheDialog({
  documento, onNavegar, onClose,
}: {
  /** Documento aberto no popup (null = fechado). */
  documento: DocumentoRef | null;
  /** Troca o documento exibido (elos da cadeia). */
  onNavegar: (d: DocumentoRef) => void;
  onClose: () => void;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const etapa = documento?.etapa;
  const id = documento?.id;
  useEffect(() => {
    if (!etapa || !id) return;
    let ativo = true;
    setDetalhe(null);
    setErro(null);
    fetch(`/api/compras/acompanhamento/${etapa}/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Erro ao carregar o documento");
        return r.json();
      })
      .then((d: Detalhe) => { if (ativo) setDetalhe(d); })
      .catch((e: Error) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [etapa, id]);

  const temPreco = !!detalhe?.itens.some((i) => i.precoUnitario != null || i.total != null);
  const temRecebido = !!detalhe?.itens.some((i) => i.quantidadeRecebida != null);
  const cadeia = detalhe
    ? [...detalhe.cadeia].sort((a, b) => ORDEM.indexOf(a.etapa) - ORDEM.indexOf(b.etapa))
    : [];

  return (
    <Dialog open={!!documento} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[min(56rem,calc(100vw-2rem))] sm:max-w-none max-h-[90vh] overflow-y-auto">
        {/* Canto superior direito, ao lado do X: abre a página completa. */}
        {detalhe && (
          <Link
            href={detalhe.href}
            onClick={onClose}
            title="Abrir a página do documento"
            className="absolute top-2 right-11 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir página
          </Link>
        )}

        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 pr-40">
            {detalhe ? (
              <>
                <span className="font-mono text-info">{detalhe.numero}</span>
                <StatusBadge status={detalhe.status} />
                <EmpresaTag empresaId={detalhe.empresaId} />
                <span className="text-xs font-normal text-muted-foreground">{ETAPA_LABEL[detalhe.etapa]}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{etapa ? ETAPA_LABEL[etapa] : ""}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {erro ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertTriangle className="w-7 h-7 text-red-500" />
            <p className="text-sm text-muted-foreground">{erro}</p>
          </div>
        ) : !detalhe ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" />
          </div>
        ) : (
          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2.5">
              {detalhe.campos.map((c, i) => (
                <div key={i} className={cn("min-w-0", c.full && "col-span-2 sm:col-span-4")}>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                  <div className="text-sm text-foreground break-words">{valorCampo(c)}</div>
                </div>
              ))}
            </div>

            {cadeia.length > 0 && (
              <Secao titulo="Documentos ligados">
                <div className="flex flex-wrap items-center gap-1.5">
                  {cadeia.map((e, i) => (
                    <span key={`${e.etapa}:${e.id}`} className="flex items-center gap-1.5">
                      {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/60" />}
                      <button
                        type="button"
                        onClick={() => onNavegar({ etapa: e.etapa, id: e.id })}
                        title={`Ver ${e.numero} (${ETAPA_LABEL[e.etapa]})`}
                        className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
                      >
                        <span className="text-xs font-semibold text-foreground">{e.numero}</span>
                        <StatusBadge status={e.status} />
                      </button>
                    </span>
                  ))}
                </div>
              </Secao>
            )}

            {detalhe.propostas && detalhe.propostas.length > 0 && (
              <Secao titulo="Propostas">
                <div className="rounded-lg border border-border divide-y divide-border">
                  {detalhe.propostas.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-sm text-foreground truncate flex-1 min-w-0">
                        {p.escolhida && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                        <span className="truncate">{p.fornecedor}</span>
                      </span>
                      <StatusBadge status={p.status} />
                      <span className="text-sm font-semibold text-foreground w-28 text-right whitespace-nowrap">
                        {p.total != null ? formatBRL(p.total) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </Secao>
            )}

            <Secao titulo={`Itens (${detalhe.itens.length})`}>
              {detalhe.itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/50">
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Qtd.</th>
                        {temRecebido && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Recebido</th>}
                        {temPreco && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Vlr. unit.</th>}
                        {temPreco && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Total</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detalhe.itens.map((it, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 min-w-0">
                            <span className="text-foreground">{it.descricao}</span>
                            <span className="ml-2 text-xs text-muted-foreground font-mono">{it.codigo}</span>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {fmtQtd(it.quantidade)} <span className="text-xs text-muted-foreground">{it.unidade ?? ""}</span>
                          </td>
                          {temRecebido && (
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {it.quantidadeRecebida != null ? fmtQtd(it.quantidadeRecebida) : "—"}
                            </td>
                          )}
                          {temPreco && (
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {it.precoUnitario != null ? formatBRL(it.precoUnitario) : "—"}
                            </td>
                          )}
                          {temPreco && (
                            <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                              {it.total != null ? formatBRL(it.total) : "—"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>

            {detalhe.historico.length > 0 && (
              <Secao titulo="Linha do tempo">
                <ul className="space-y-1.5">
                  {detalhe.historico.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="tabular-nums whitespace-nowrap">{formatDateTime(h.em)}</span>
                      <span className="font-medium text-foreground whitespace-nowrap">{h.numero}</span>
                      <StatusBadge status={h.status} />
                      {h.usuario && <span className="truncate">{h.usuario}</span>}
                    </li>
                  ))}
                </ul>
              </Secao>
            )}

            <Autoria criadoPor={detalhe.criadoPor} atualizadoPor={detalhe.atualizadoPor} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
