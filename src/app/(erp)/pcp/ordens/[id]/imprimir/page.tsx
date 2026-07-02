"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import PrintButton from "@/components/shared/PrintButton";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";

type ProdutoItem = { itemId: string; quantidadePlanejada: string | number; quantidadeReal: string | number | null; unidadeId: string | null; item: { codigo: string; descricao: string; unidade: { sigla: string } | null }; unidade: { sigla: string } | null };
type ConsumoLinha = { itemId: string | null; descricao: string; unidade: string | null; consumo: number; gerenciavel: boolean };
type MovLinha = { itemId: string; descricao: string; veiculo: string; nVeiculos: number; capacidade: number; pecas: number };
type PlanoVagao = { veiculo: "VAGAO" | "VAGONETA"; nVagoes: number; cargas: { itemId: string; pecas: number }[] };
type Ordem = {
  id: string; numero: string; status: string; createdAt: string;
  dataPrevistaInicio: string | null; dataPrevistaFim: string | null;
  criadoPor: string | null;
  responsavelColaborador: { nome: string } | null;
  item: { codigo: string; descricao: string } | null;
  fluxoVersao: { fluxo: { id: string; nome: string } } | null;
  produtoItens: ProdutoItem[];
  etapas: { nodeId: string; nome: string; centroTrabalho: string | null; estadoSaida: string | null }[];
  observacao: string | null;
  planoTransporte: PlanoVagao[] | null;
};

const VEIC_LABEL: Record<string, [string, string]> = { VAGAO: ["Vagão", "vagões"], VAGONETA: ["Vagoneta", "vagonetas"], "Vagão": ["Vagão", "vagões"], "Vagoneta": ["Vagoneta", "vagonetas"] };
const veicSing = (v: string) => VEIC_LABEL[v]?.[0] ?? v;
const veicPlural = (v: string) => VEIC_LABEL[v]?.[1] ?? `${v.toLowerCase()}s`;

const STATUS_LABEL: Record<string, string> = { RASCUNHO: "Rascunho", LIBERADA: "Liberada", EM_PRODUCAO: "Em produção", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const n = (v: string | number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));

export default function ImprimirOrdemPage() {
  const { id } = useParams<{ id: string }>();
  useTabTitle("Imprimir OP");
  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? "";
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [consumo, setConsumo] = useState<ConsumoLinha[] | null>(null);
  const [movimentacao, setMovimentacao] = useState<MovLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pcp/ordens/${id}`).then((r) => r.json()).then((j) => { if (j?.data) setOrdem(j.data); else setErro(j?.error ?? "Erro"); }).catch(() => setErro("Erro ao carregar"));
  }, [id]);

  // Recursos previstos consumidos (mesmo cálculo da abertura/Nova OP).
  useEffect(() => {
    if (!ordem) return;
    const fluxoId = ordem.fluxoVersao?.fluxo?.id;
    const areaNodeId = ordem.etapas[0]?.nodeId;
    const produtos = ordem.produtoItens.map((pi) => ({ itemId: pi.itemId, quantidade: Number(pi.quantidadePlanejada), unidadeId: pi.unidadeId }));
    if (!fluxoId || !areaNodeId || !produtos.length) return;
    fetch("/api/pcp/ordens/area/consumo-previsto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fluxoId, areaNodeId, produtos }),
    }).then((r) => r.json()).then((j) => setConsumo(j.data ?? [])).catch(() => {});
  }, [ordem]);

  // Movimentação prevista (nº de vagonetas/vagões) — config de cargas por etapa.
  useEffect(() => {
    if (!ordem) return;
    const fluxoId = ordem.fluxoVersao?.fluxo?.id;
    const areaNodeId = ordem.etapas[0]?.nodeId;
    const produtos = ordem.produtoItens.map((pi) => ({ itemId: pi.itemId, quantidade: Number(pi.quantidadePlanejada), unidadeId: pi.unidadeId }));
    if (!fluxoId || !areaNodeId || !produtos.length) return;
    fetch("/api/pcp/ordens/area/movimentacao-prevista", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fluxoId, areaNodeId, produtos }),
    }).then((r) => r.json()).then((j) => setMovimentacao(j.data ?? [])).catch(() => {});
  }, [ordem]);

  // Conchadas (unidade que o operador da carregadeira entende): só na etapa de
  // Preparação, busca o fator da unidade "CONCHADA" de cada material consumido.
  const [conchadaFator, setConchadaFator] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!ordem || !consumo) return;
    const et = ordem.etapas[0];
    const prep = !!et && /prepara/i.test(`${et.nome ?? ""} ${et.centroTrabalho ?? ""}`);
    if (!prep) return;
    const ids = Array.from(new Set(consumo.map((c) => c.itemId).filter((x): x is string => !!x)));
    if (!ids.length) return;
    let cancel = false;
    Promise.all(ids.map(async (itemId) => {
      try {
        const us = await fetch(`/api/suprimentos/produtos/${itemId}/unidades`).then((r) => r.json());
        const conc = Array.isArray(us)
          ? us.find((u: { unidade?: { sigla?: string }; isPrincipal: boolean; fatorConversao: unknown }) =>
              !u.isPrincipal && /conchad/i.test(u.unidade?.sigla ?? "") && Number(u.fatorConversao) > 0)
          : null;
        return conc ? ([itemId, Number(conc.fatorConversao)] as const) : null;
      } catch { return null; }
    })).then((pares) => {
      if (cancel) return;
      const m = new Map<string, number>();
      for (const p of pares) if (p) m.set(p[0], p[1]);
      setConchadaFator(m);
    });
    return () => { cancel = true; };
  }, [ordem, consumo]);

  if (erro) return <div className="p-8 text-sm text-muted-foreground">{erro}</div>;
  if (!ordem) return <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>;

  const etapa = ordem.etapas[0];
  const ehPreparacao = !!etapa && /prepara/i.test(`${etapa.nome ?? ""} ${etapa.centroTrabalho ?? ""}`);
  const conchadasDe = (c: ConsumoLinha): string | null => {
    if (!ehPreparacao || !c.itemId) return null;
    const fator = conchadaFator.get(c.itemId);
    if (!fator || fator <= 0) return null;
    return (c.consumo / fator).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };
  const Campo = ({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) => (
    <div><p className="text-[10px] uppercase tracking-wide text-gray-500">{rotulo}</p><p className="text-sm font-medium text-gray-900">{valor}</p></div>
  );

  return (
    <div className="px-8 py-6">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link href="/pcp/ordens" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        <PrintButton />
      </div>

      <div className="print-area mx-auto max-w-3xl bg-white text-gray-900 border border-gray-200 rounded-xl p-8">
        <div className="flex items-start justify-between border-b border-gray-300 pb-3 mb-4">
          <div>
            <h1 className="text-lg font-bold">Ordem de Produção</h1>
            {empresaNome && <p className="text-sm text-gray-600">{empresaNome}</p>}
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-bold">{ordem.numero}</p>
            <p className="text-xs text-gray-500">{STATUS_LABEL[ordem.status] ?? ordem.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <Campo rotulo="Emissão" valor={d(ordem.createdAt)} />
          <Campo rotulo="Fluxo" valor={ordem.fluxoVersao?.fluxo?.nome ?? "—"} />
          <Campo rotulo="Etapa / Área" valor={etapa?.centroTrabalho ?? etapa?.nome ?? "—"} />
          <Campo rotulo="Início previsto" valor={dt(ordem.dataPrevistaInicio)} />
          <Campo rotulo="Fim previsto" valor={dt(ordem.dataPrevistaFim)} />
          <Campo rotulo="Responsável" valor={ordem.responsavelColaborador?.nome ?? "—"} />
          <Campo rotulo="Programado por" valor={ordem.criadoPor ?? "—"} />
        </div>

        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Produtos</p>
        <table className="w-full text-sm border border-gray-300 mb-5">
          <thead className="bg-gray-100 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold">Código</th>
              <th className="text-left px-3 py-1.5 font-semibold">Produto</th>
              <th className="text-right px-3 py-1.5 font-semibold">Planejado</th>
              <th className="text-right px-3 py-1.5 font-semibold">Real</th>
              <th className="text-left px-3 py-1.5 font-semibold w-16">Un.</th>
            </tr>
          </thead>
          <tbody>
            {(ordem.produtoItens.length ? ordem.produtoItens : (ordem.item ? [{ itemId: "x", quantidadePlanejada: 0, quantidadeReal: null, unidadeId: null, item: { ...ordem.item, unidade: null }, unidade: null }] : [])).map((pi, i) => (
              <tr key={i} className="border-t border-gray-200">
                <td className="px-3 py-1.5 font-mono text-xs">{pi.item.codigo}</td>
                <td className="px-3 py-1.5">{pi.item.descricao}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{n(pi.quantidadePlanejada)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{n(pi.quantidadeReal)}</td>
                <td className="px-3 py-1.5 text-xs text-gray-600">{pi.unidade?.sigla ?? pi.item.unidade?.sigla ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {consumo && consumo.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Recursos previstos consumidos</p>
            <table className="w-full text-sm border border-gray-300 mb-5">
              <thead className="bg-gray-100 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Material</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Consumo previsto</th>
                  <th className="text-left px-3 py-1.5 font-semibold w-16">Un.</th>
                  {ehPreparacao && <th className="text-right px-3 py-1.5 font-semibold w-24">Conchadas</th>}
                </tr>
              </thead>
              <tbody>
                {consumo.map((c, i) => {
                  const conc = conchadasDe(c);
                  return (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-3 py-1.5">{c.descricao}{!c.gerenciavel && <span className="text-gray-400"> (referência)</span>}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{n(c.consumo)}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-600">{c.unidade ?? "—"}</td>
                      {ehPreparacao && (
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {conc ? <>{conc} <span className="text-xs font-normal text-gray-500">conchadas</span></> : <span className="text-gray-400">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {(() => {
          // Linhas de transporte: usa o plano SALVO na OP ("Planejar por transporte");
          // sem plano salvo, cai no cálculo automático (capacidade cadastrada).
          const descDe = new Map(ordem.produtoItens.map((pi) => [pi.itemId, pi.item.descricao]));
          type TranspRow = { veiculo: string; nVagoes: number; cargas: { descricao: string; pecas: number }[] };
          const linhas: TranspRow[] = ordem.planoTransporte?.length
            ? ordem.planoTransporte.map((r) => ({
                veiculo: veicSing(r.veiculo), nVagoes: r.nVagoes,
                cargas: r.cargas.map((c) => ({ descricao: descDe.get(c.itemId) ?? c.itemId, pecas: c.pecas })),
              }))
            : (movimentacao ?? []).map((m) => ({ veiculo: m.veiculo, nVagoes: m.nVeiculos, cargas: [{ descricao: m.descricao, pecas: m.capacidade }] }));
          if (!linhas.length) return null;
          return (
          <>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Movimentação prevista{ordem.planoTransporte?.length ? " (planejada por transporte)" : ""}
            </p>
            <table className="w-full text-sm border border-gray-300 mb-5">
              <thead className="bg-gray-100 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Carga por veículo</th>
                  <th className="text-left px-3 py-1.5 font-semibold w-28">Veículo</th>
                  <th className="text-right px-3 py-1.5 font-semibold w-24">Nº veículos</th>
                  <th className="text-right px-3 py-1.5 font-semibold w-28">Capacidade</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((m, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-3 py-1.5">{m.cargas.map((c) => `${n(c.pecas)} ${c.descricao}`).join(" + ")}</td>
                    <td className="px-3 py-1.5">{m.veiculo}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{n(m.nVagoes)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{n(m.cargas.reduce((s, c) => s + c.pecas, 0))} pç</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Apontamento por veículo: um quadro por vagão p/ o chão de fábrica
                marcar cada descarga — a meta do dia é em vagões descarregados. */}
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Apontamento por veículo (marque cada {veicSing(linhas[0].veiculo).toLowerCase()} descarregado)</p>
            <div className="mb-5 space-y-3">
              {linhas.map((m, i) => {
                const capVagao = m.cargas.reduce((s, c) => s + c.pecas, 0);
                return (
                  <div key={i} style={{ breakInside: "avoid" }}>
                    <p className="text-xs font-semibold text-gray-800 mb-1">
                      {m.cargas.map((c) => `${c.descricao} (${n(c.pecas)} pç)`).join(" + ")}
                      <span className="font-normal text-gray-500"> — meta {n(m.nVagoes)} {veicPlural(m.veiculo)} × {n(capVagao)} pç</span>
                    </p>
                    <div className="grid grid-cols-8 gap-1">
                      {Array.from({ length: m.nVagoes }, (_, k) => (
                        <div key={k} className="border border-gray-400 rounded h-11 px-1 pt-0.5">
                          <div className="flex justify-between text-[9px] leading-none">
                            <span className="font-bold text-gray-700">{k + 1}</span>
                            <span className="text-gray-400 tabular-nums">{n(capVagao)}</span>
                          </div>
                        </div>
                      ))}
                      {[0, 1].map((k) => (
                        <div key={`x${k}`} className="border border-dashed border-gray-300 rounded h-11 px-1 pt-0.5">
                          <span className="text-[9px] text-gray-400">extra</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-600 mt-1.5">
                      {veicPlural(m.veiculo).replace(/^./, (ch) => ch.toUpperCase())} descarregados: __________&nbsp;&nbsp;·&nbsp;&nbsp;Peças: __________&nbsp;&nbsp;·&nbsp;&nbsp;Quebra/perda: __________
                    </p>
                  </div>
                );
              })}
            </div>
          </>
          );
        })()}

        {ordem.observacao && (
          <div className="mb-5"><p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Observação</p><p className="text-sm">{ordem.observacao}</p></div>
        )}

        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Observações do dia (preenchimento manual)</p>
          <div className="border border-gray-300 rounded-lg h-32" style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, #e5e7eb 28px)" }} />
        </div>

        <div className="grid grid-cols-2 gap-8 mt-8 pt-2 text-center text-xs text-gray-500">
          <div className="border-t border-gray-400 pt-1">Responsável</div>
          <div className="border-t border-gray-400 pt-1">Conferência</div>
        </div>
      </div>
    </div>
  );
}
