"use client";

// Folha A4 da OS para o chão de fábrica: cabeçalho, identificação do ativo,
// serviço, atividades com os itens de cada uma (campos p/ marcar/anotar),
// materiais, mão de obra (apontados + linhas em branco), terceiros, fechamento
// (parada, medidor, observações) e assinaturas. Custos só com a opção marcada.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import PrintButton from "@/components/shared/PrintButton";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { PRIORIDADE, STATUS_OS, brl } from "@/components/manutencao/comum";

type Material = { id: string; servicoId: string | null; descricao: string; quantidade: string; unidade: string | null; valorTotal: string; origem: string; item: { codigo: string } | null };
type Servico = {
  id: string; seq: number; descricao: string; tipoResposta: string; faixaMin: string | null; faixaMax: string | null;
  resposta: string | null; conforme: boolean | null; executado: boolean; tempoHoras: string | null; servico: { descricao: string } | null;
};
type OS = {
  id: string; numero: string; status: string; prioridade: string; descricao: string; createdAt: string; criadoPor: string | null;
  programadaPara: string | null; prazo: string | null; horasEstimadas: string | null; exigeParada: boolean;
  iniciadaEm: string | null; encerradaEm: string | null; encerradaPor: string | null; concluidaEm: string | null; concluidaPor: string | null;
  paradaInicio: string | null; paradaFim: string | null; observacaoTecnica: string | null; leituraMedidor: string | null; localTexto: string | null;
  custoMaoObra: string; custoMaterial: string; custoTerceiros: string;
  ativo: { tag: string; nome: string; localizacao: string | null } | null;
  tipo: { sigla: string; nome: string };
  plano: { codigo: string; nome: string } | null;
  equipe: { nome: string } | null; responsavel: { nome: string } | null; centroCusto: { codigo: string; nome: string } | null;
  servicos: Servico[];
  materiais: Material[];
  apontamentos: { id: string; nome: string; inicio: string; fim: string | null; observacao: string | null }[];
  terceiros: { id: string; descricao: string; valor: string; fornecedor: { razaoSocial: string; nomeFantasia: string | null } | null }[];
  solicitacoes: { numero: string; solicitanteNome: string | null }[];
  tarefa: { titulo: string; projeto: { nome: string } } | null;
};

const TIPO_RESPOSTA: Record<string, string> = { NENHUMA: "Serviço", OK_NOK: "OK / Não OK", NUMERO: "Medição", TEXTO: "Anotação" };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const hora = (s: string | null) => (s ? new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const qtd = (v: string | number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const horasEntre = (a: string, b: string | null) => (b ? ((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " h" : "");
const LINHAS = "repeating-linear-gradient(transparent, transparent 23px, #d1d5db 24px)";

const Campo = ({ rotulo, valor, className }: { rotulo: string; valor: React.ReactNode; className?: string }) => (
  <div className={className}>
    <p className="text-[9px] uppercase tracking-wide text-gray-500 leading-tight">{rotulo}</p>
    <p className="text-[12px] font-medium text-gray-900 leading-snug">{valor || "—"}</p>
  </div>
);
const Secao = ({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <section className="mb-4 os-secao">
    <div className="flex items-baseline justify-between border-b-2 border-gray-800 mb-1.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-800">{titulo}</h2>
      {extra && <span className="text-[10px] text-gray-500">{extra}</span>}
    </div>
    {children}
  </section>
);
const Caixa = ({ marcado }: { marcado?: boolean }) => (
  <span className="inline-flex items-center justify-center w-3.5 h-3.5 border border-gray-600 rounded-[2px] text-[10px] leading-none align-middle">{marcado ? "✕" : ""}</span>
);

export default function ImprimirOsPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  useTabTitle("Imprimir OS");
  const { user } = useSession();
  const empresaNome = user?.empresas?.find((e) => e.id === user.activeEmpresaId)?.nome ?? "";
  const [os, setOs] = useState<OS | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comCustos, setComCustos] = usePersistedState("pcm:os-print:custos", false);
  const [linhasMO, setLinhasMO] = usePersistedState("pcm:os-print:linhas-mo", true);

  useEffect(() => {
    fetch(`/api/pcm/os/${id}`).then((r) => r.json()).then((j) => { if (j?.data) setOs(j.data); else setErro(j?.error ?? "Erro"); }).catch(() => setErro("Erro ao carregar"));
  }, [id]);
  // ?auto=1 (botão Imprimir da OS): abre o diálogo de impressão assim que a folha monta.
  useEffect(() => {
    if (!os || sp.get("auto") !== "1") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [os, sp]);

  if (erro) return <div className="p-8 text-sm text-muted-foreground">{erro}</div>;
  if (!os) return <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>;

  const materiaisAtv = (sid: string) => os.materiais.filter((m) => m.servicoId === sid);
  const materiaisGerais = os.materiais.filter((m) => !m.servicoId || !os.servicos.some((s) => s.id === m.servicoId));
  const origem = os.solicitacoes.length
    ? `SS ${os.solicitacoes.map((s) => s.numero).join(", ")}${os.solicitacoes[0].solicitanteNome ? ` · ${os.solicitacoes[0].solicitanteNome}` : ""}`
    : os.plano ? `Plano ${os.plano.codigo} — ${os.plano.nome}`
    : os.tarefa ? `Tarefa “${os.tarefa.titulo}” (${os.tarefa.projeto.nome})`
    : "OS direta";
  const custoTotal = Number(os.custoMaoObra) + Number(os.custoMaterial) + Number(os.custoTerceiros);
  const linhasEmBranco = linhasMO ? Math.max(2, 5 - os.apontamentos.length) : 0;
  const th = "text-left px-2 py-1 font-semibold";
  const td = "px-2 py-1 align-top";

  return (
    <div className="px-8 py-6">
      <style>{`@media print {
        @page { size: A4 portrait; margin: 1cm 1.1cm; }
        .print-area { border: none !important; border-radius: 0 !important; padding: 0 !important; max-width: 100% !important; box-shadow: none !important; }
        .os-secao, .os-linha { break-inside: avoid; }
        thead { display: table-header-group; }
      }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/pcm/os/${os.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar para a OS</Link>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={linhasMO} onChange={(e) => setLinhasMO(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Linhas em branco p/ mão de obra
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={comCustos} onChange={(e) => setComCustos(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Mostrar custos
          </label>
          <PrintButton />
        </div>
      </div>

      {/* Largura de uma folha A4 (210 mm − margens) na tela, para pré-visualizar. */}
      <div className="print-area mx-auto bg-white text-gray-900 border border-gray-200 rounded-xl shadow-sm p-8" style={{ maxWidth: "190mm" }}>
        {/* Cabeçalho */}
        <header className="flex items-stretch justify-between gap-4 border-b-2 border-gray-900 pb-2 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{empresaNome || "Manutenção"}</p>
            <h1 className="text-xl font-bold leading-tight">Ordem de Serviço de Manutenção</h1>
            <p className="text-[12px] text-gray-700">{os.tipo.sigla} — {os.tipo.nome}</p>
          </div>
          <div className="text-right shrink-0 border border-gray-900 rounded-md px-3 py-1.5">
            <p className="font-mono text-2xl font-bold leading-none">{os.numero}</p>
            <p className="text-[11px] mt-1">{STATUS_OS[os.status]?.label ?? os.status} · prioridade <b>{PRIORIDADE[os.prioridade]?.label ?? os.prioridade}</b></p>
            <p className="text-[10px] text-gray-500">emitida {dt(os.createdAt)}</p>
          </div>
        </header>

        {/* Identificação */}
        <Secao titulo="Equipamento e programação">
          <div className="grid grid-cols-4 gap-x-4 gap-y-1.5">
            <Campo className="col-span-2" rotulo="Ativo" valor={os.ativo ? <><span className="font-mono">{os.ativo.tag}</span> — {os.ativo.nome}</> : "—"} />
            <Campo className="col-span-2" rotulo="Local" valor={os.localTexto || os.ativo?.localizacao} />
            <Campo rotulo="Programada para" valor={dt(os.programadaPara)} />
            <Campo rotulo="Prazo" valor={dt(os.prazo)} />
            <Campo rotulo="Horas estimadas" valor={os.horasEstimadas ? `${qtd(os.horasEstimadas)} h` : "—"} />
            <Campo rotulo="Exige parada" valor={os.exigeParada ? "Sim" : "Não"} />
            <Campo rotulo="Equipe" valor={os.equipe?.nome} />
            <Campo rotulo="Responsável" valor={os.responsavel?.nome} />
            <Campo rotulo="Centro de custo" valor={os.centroCusto ? `${os.centroCusto.codigo} ${os.centroCusto.nome}` : "—"} />
            <Campo rotulo="Origem" valor={origem} />
          </div>
        </Secao>

        <Secao titulo="Serviço a executar">
          <p className="text-[12.5px] whitespace-pre-wrap leading-snug border border-gray-300 rounded px-2.5 py-2">{os.descricao}</p>
        </Secao>

        {/* Atividades */}
        {os.servicos.length > 0 && (
          <Secao titulo="Atividades" extra={`${os.servicos.length} ${os.servicos.length === 1 ? "atividade" : "atividades"}`}>
            <table className="w-full text-[11.5px] border border-gray-400 border-collapse">
              <thead className="bg-gray-100 text-[10px] text-gray-700">
                <tr>
                  <th className={`${th} w-10`}>Nº</th>
                  <th className={th}>Atividade</th>
                  <th className={`${th} w-40`}>Resultado</th>
                  <th className={`${th} w-12 text-center`}>Feito</th>
                </tr>
              </thead>
              <tbody>
                {os.servicos.map((s) => {
                  const mats = materiaisAtv(s.id);
                  const faixa = s.faixaMin || s.faixaMax ? ` (${s.faixaMin ? qtd(s.faixaMin) : "…"} a ${s.faixaMax ? qtd(s.faixaMax) : "…"})` : "";
                  const feito = s.tipoResposta === "NENHUMA" ? s.executado : !!s.resposta;
                  return (
                    <tr key={s.id} className="os-linha border-t border-gray-300">
                      <td className={`${td} font-mono text-gray-600`}>{String(s.seq * 10).padStart(3, "0")}</td>
                      <td className={td}>
                        <p className="font-medium">{s.descricao || s.servico?.descricao}</p>
                        {s.tipoResposta !== "NENHUMA" && <p className="text-[10px] text-gray-500">{TIPO_RESPOSTA[s.tipoResposta] ?? s.tipoResposta}{faixa}</p>}
                        {mats.length > 0 && (
                          <ul className="mt-0.5 text-[10.5px] text-gray-700">
                            {mats.map((m) => <li key={m.id}>• {qtd(m.quantidade)} {m.unidade ?? ""} — {m.item?.codigo ? <span className="font-mono">{m.item.codigo} </span> : null}{m.descricao}</li>)}
                          </ul>
                        )}
                      </td>
                      <td className={td}>
                        {s.tipoResposta === "OK_NOK" ? (
                          <span className="inline-flex gap-3 text-[11px]"><span><Caixa marcado={s.conforme === true} /> OK</span><span><Caixa marcado={s.conforme === false} /> Não OK</span></span>
                        ) : s.tipoResposta === "NENHUMA" ? null : s.resposta ? (
                          <span className="font-medium">{s.resposta}</span>
                        ) : (
                          <span className="block border-b border-gray-400 h-4 mt-1" />
                        )}
                      </td>
                      <td className={`${td} text-center`}><Caixa marcado={feito} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Secao>
        )}

        {/* Materiais */}
        <Secao titulo={os.servicos.length ? "Materiais (gerais da OS)" : "Materiais"} extra={materiaisGerais.length ? undefined : "preencha o que for usado"}>
          <table className="w-full text-[11.5px] border border-gray-400 border-collapse">
            <thead className="bg-gray-100 text-[10px] text-gray-700">
              <tr>
                <th className={`${th} w-24`}>Código</th>
                <th className={th}>Descrição</th>
                <th className={`${th} w-20 text-right`}>Previsto</th>
                <th className={`${th} w-12`}>Un.</th>
                <th className={`${th} w-20 text-right`}>Usado</th>
                {comCustos && <th className={`${th} w-24 text-right`}>Valor</th>}
              </tr>
            </thead>
            <tbody>
              {materiaisGerais.map((m) => (
                <tr key={m.id} className="os-linha border-t border-gray-300">
                  <td className={`${td} font-mono text-[10.5px]`}>{m.item?.codigo ?? "—"}</td>
                  <td className={td}>{m.descricao}</td>
                  <td className={`${td} text-right tabular-nums`}>{m.origem === "PREVISTO" ? qtd(m.quantidade) : ""}</td>
                  <td className={`${td} text-gray-600`}>{m.unidade ?? ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{m.origem !== "PREVISTO" ? qtd(m.quantidade) : ""}</td>
                  {comCustos && <td className={`${td} text-right tabular-nums`}>{Number(m.valorTotal) ? brl(m.valorTotal) : ""}</td>}
                </tr>
              ))}
              {Array.from({ length: materiaisGerais.length ? 2 : 4 }, (_, k) => (
                <tr key={`b${k}`} className="border-t border-gray-300 h-6"><td /><td /><td /><td /><td />{comCustos && <td />}</tr>
              ))}
            </tbody>
          </table>
        </Secao>

        {/* Mão de obra */}
        <Secao titulo="Mão de obra">
          <table className="w-full text-[11.5px] border border-gray-400 border-collapse">
            <thead className="bg-gray-100 text-[10px] text-gray-700">
              <tr>
                <th className={th}>Executante</th>
                <th className={`${th} w-20`}>Data</th>
                <th className={`${th} w-16`}>Início</th>
                <th className={`${th} w-16`}>Fim</th>
                <th className={`${th} w-16 text-right`}>Horas</th>
                <th className={`${th} w-32`}>Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {os.apontamentos.map((a) => (
                <tr key={a.id} className="os-linha border-t border-gray-300">
                  <td className={td}>{a.nome}</td>
                  <td className={td}>{new Date(a.inicio).toLocaleDateString("pt-BR")}</td>
                  <td className={td}>{hora(a.inicio)}</td>
                  <td className={td}>{hora(a.fim)}</td>
                  <td className={`${td} text-right tabular-nums`}>{horasEntre(a.inicio, a.fim)}</td>
                  <td className={td} />
                </tr>
              ))}
              {Array.from({ length: linhasEmBranco }, (_, k) => (
                <tr key={`b${k}`} className="border-t border-gray-300 h-7"><td /><td /><td /><td /><td /><td /></tr>
              ))}
              {os.apontamentos.length === 0 && linhasEmBranco === 0 && (
                <tr className="border-t border-gray-300"><td colSpan={6} className={`${td} text-gray-500`}>Sem apontamentos.</td></tr>
              )}
            </tbody>
          </table>
        </Secao>

        {/* Terceiros */}
        {os.terceiros.length > 0 && (
          <Secao titulo="Serviços de terceiros">
            <table className="w-full text-[11.5px] border border-gray-400 border-collapse">
              <tbody>
                {os.terceiros.map((t) => (
                  <tr key={t.id} className="os-linha border-t border-gray-300 first:border-t-0">
                    <td className={td}>{t.descricao}</td>
                    <td className={`${td} text-gray-600`}>{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "—"}</td>
                    {comCustos && <td className={`${td} text-right tabular-nums w-24`}>{brl(t.valor)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        )}

        {/* Fechamento */}
        <Secao titulo="Fechamento">
          <div className="grid grid-cols-4 gap-x-4 gap-y-2 mb-2">
            <Campo rotulo="Início da execução" valor={os.iniciadaEm ? dt(os.iniciadaEm) : <span className="block border-b border-gray-400 h-4" />} />
            <Campo rotulo="Fim da execução" valor={os.encerradaEm ? dt(os.encerradaEm) : <span className="block border-b border-gray-400 h-4" />} />
            <Campo rotulo="Parada — início / fim" valor={os.paradaInicio ? `${dt(os.paradaInicio)} → ${os.paradaFim ? dt(os.paradaFim) : "…"}` : <span className="block border-b border-gray-400 h-4" />} />
            <Campo rotulo="Leitura do medidor" valor={os.leituraMedidor ? qtd(os.leituraMedidor) : <span className="block border-b border-gray-400 h-4" />} />
          </div>
          <p className="text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">Observações técnicas / causa encontrada</p>
          {os.observacaoTecnica ? (
            <p className="text-[12px] whitespace-pre-wrap border border-gray-300 rounded px-2.5 py-2">{os.observacaoTecnica}</p>
          ) : (
            <div className="border border-gray-300 rounded h-24" style={{ backgroundImage: LINHAS }} />
          )}
          {comCustos && (
            <p className="text-[11px] text-gray-700 mt-2">
              Custos: mão de obra {brl(os.custoMaoObra)} · materiais {brl(os.custoMaterial)} · terceiros {brl(os.custoTerceiros)} · <b>total {brl(custoTotal)}</b>
            </p>
          )}
        </Secao>

        {/* Assinaturas */}
        <div className="os-secao grid grid-cols-3 gap-6 mt-8 text-center text-[10.5px] text-gray-700">
          {[
            ["Executante", os.encerradaPor],
            ["Responsável / Supervisor", os.responsavel?.nome ?? null],
            ["PCM — validação", os.concluidaPor],
          ].map(([rotulo, nome]) => (
            <div key={rotulo}>
              <div className="border-t border-gray-700 pt-1">{rotulo}</div>
              {nome && <div className="text-[10px] text-gray-500">{nome}</div>}
              <div className="text-[10px] text-gray-400 mt-0.5">Data ____/____/______</div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-[9px] text-gray-400 text-right">
          {os.numero} · impressa em {new Date().toLocaleString("pt-BR")}{os.criadoPor ? ` · aberta por ${os.criadoPor}` : ""}
        </p>
      </div>
    </div>
  );
}
