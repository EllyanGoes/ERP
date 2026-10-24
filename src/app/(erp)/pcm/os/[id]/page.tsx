"use client";

// Detalhe da OS: execução (cronômetro/horas, serviços e falha, checklist do plano,
// materiais via requisição, terceiros) e as ações de status. Conclusão em duas
// etapas: o técnico ENCERRA, o PCM CONCLUI (ou devolve para execução).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Autoria } from "@/components/shared/Autoria";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2, Pause, Pencil, Play, Plus, Square, Trash2, Wrench, X } from "lucide-react";
import {
  AtivoCombobox, DataHora, OPCOES_PRIORIDADE, PrioridadeTxt, StatusOSBadge, api, brl, fmtData, fmtDataHora, fmtHoras, useManutLookups,
} from "@/components/manutencao/comum";

type Servico = {
  id: string; seq: number; descricao: string; servicoId: string | null; sintomaId: string | null; causaId: string | null;
  tipoResposta: string; faixaMin: string | null; faixaMax: string | null; resposta: string | null; conforme: boolean | null; executado: boolean; tempoHoras: string | null;
  servico: { descricao: string } | null; sintoma: { descricao: string } | null; causa: { descricao: string } | null;
};
type Apont = { id: string; colaboradorId: string | null; nome: string; inicio: string; fim: string | null; custoHora: string | null; observacao: string | null };
type OSDet = {
  id: string; numero: string; status: string; prioridade: string; descricao: string; createdAt: string; updatedAt: string; criadoPor: string | null; atualizadoPor: string | null;
  programadaPara: string | null; prazo: string | null; horasEstimadas: string | null; exigeParada: boolean; iniciadaEm: string | null;
  encerradaEm: string | null; encerradaPor: string | null; concluidaEm: string | null; concluidaPor: string | null; canceladaEm: string | null; motivoCancelamento: string | null;
  paradaInicio: string | null; paradaFim: string | null; observacaoTecnica: string | null; leituraMedidor: string | null; localTexto: string | null;
  custoMaoObra: string; custoMaterial: string; custoTerceiros: string; codOrdLegado: number | null;
  tipoId: string; equipeId: string | null; responsavelId: string | null;
  ativo: { id: string; codApl: number; tag: string; nome: string; status: string; localizacao: string | null } | null;
  tipo: { sigla: string; nome: string; contaComoFalha: boolean };
  plano: { id: string; codigo: string; nome: string } | null;
  equipe: { nome: string } | null; responsavel: { nome: string } | null; centroCusto: { id: string; codigo: string; nome: string } | null;
  servicos: Servico[];
  materiais: { id: string; descricao: string; quantidade: string; valorTotal: string; origem: string; item: { codigo: string } | null }[];
  apontamentos: Apont[];
  terceiros: { id: string; descricao: string; valor: string; pedidoCompraId: string | null; fornecedor: { razaoSocial: string; nomeFantasia: string | null } | null }[];
  eventos: { id: string; tipo: string; detalhe: string | null; usuario: string | null; createdAt: string }[];
  solicitacoes: { id: string; numero: string; solicitanteNome: string | null; createdAt: string; descricao: string }[];
  requisicoes: { id: string; numero: string; tipo: string; status: string; data: string; itens: { quantidade: string; item: { codigo: string; descricao: string } }[] }[];
  acoes: string[]; podeValidar: boolean; pendencias: string[];
};

const ACAO: Record<string, { label: string; motivo?: boolean; pcm?: boolean; variant?: "default" | "outline" | "destructive" }> = {
  iniciar: { label: "Iniciar" },
  planejar: { label: "Planejar", pcm: true, variant: "outline" },
  pausar: { label: "Pausar", motivo: true, variant: "outline" },
  aguardar_material: { label: "Aguardar material", motivo: true, variant: "outline" },
  aguardar_terceiro: { label: "Aguardar terceiro", motivo: true, variant: "outline" },
  retomar: { label: "Retomar" },
  encerrar: { label: "Encerrar execução" },
  concluir: { label: "Validar e concluir", pcm: true },
  devolver: { label: "Devolver p/ execução", motivo: true, pcm: true, variant: "outline" },
  reabrir: { label: "Reabrir", motivo: true, pcm: true, variant: "outline" },
  cancelar: { label: "Cancelar OS", motivo: true, pcm: true, variant: "destructive" },
};

const EVENTO_LABEL: Record<string, string> = {
  CRIADA: "OS aberta", PLANEJAR: "Planejada", INICIAR: "Iniciada", PAUSAR: "Pausada", AGUARDAR_MATERIAL: "Aguardando material",
  AGUARDAR_TERCEIRO: "Aguardando terceiro", RETOMAR: "Retomada", ENCERRAR: "Execução encerrada", CONCLUIR: "Validada e concluída",
  DEVOLVER: "Devolvida para execução", REABRIR: "Reaberta", CANCELAR: "Cancelada", SS_ANEXADA: "Solicitação anexada",
};

const horas = (a: { inicio: string; fim: string | null }, agora: number) => ((a.fim ? new Date(a.fim).getTime() : agora) - new Date(a.inicio).getTime()) / 3_600_000;

export default function OrdemServicoPage() {
  const { id } = useParams<{ id: string }>();
  const lk = useManutLookups();
  const [o, setO] = useState<OSDet | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  useTabTitle(o ? `${o.numero}` : "OS");
  const load = useCallback(async () => {
    const res = await fetch(`/api/pcm/os/${id}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErroCarga(j?.error || "Erro ao carregar a OS."); return; }
    setO(j.data);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const [msg, setMsg] = useState("");

  // ações de status
  const [acaoAberta, setAcaoAberta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState(""); const [fimParada, setFimParada] = useState(""); const [progr, setProgr] = useState("");
  const [executando, setExecutando] = useState(false); const [erroAcao, setErroAcao] = useState("");
  async function executar(acao: string) {
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}/acao`, "POST", { acao, motivo, fimParada: fimParada || null, programadaPara: progr || null });
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); if (!acaoAberta) setMsg(r.error!); return; }
    setAcaoAberta(null); setMsg(""); load();
  }
  function clicarAcao(acao: string) {
    setMotivo(""); setErroAcao(""); setFimParada(""); setProgr(o?.programadaPara ?? "");
    const precisaDialog = ACAO[acao].motivo || acao === "planejar" || (acao === "encerrar" && o?.paradaInicio && !o.paradaFim);
    if (precisaDialog) setAcaoAberta(acao); else executar(acao);
  }

  // edição do cabeçalho
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  function abrirEdit() {
    if (!o) return;
    setF({ ativoId: o.ativo?.id ?? "", tipoId: o.tipoId, prioridade: o.prioridade, descricao: o.descricao, equipeId: o.equipeId ?? "", responsavelId: o.responsavelId ?? "",
      programadaPara: o.programadaPara ?? "", prazo: o.prazo ?? "", horasEstimadas: o.horasEstimadas ?? "", exigeParada: o.exigeParada,
      paradaInicio: o.paradaInicio ?? "", paradaFim: o.paradaFim ?? "", leituraMedidor: o.leituraMedidor ?? "", observacaoTecnica: o.observacaoTecnica ?? "" });
    setErroAcao(""); setEdit(true);
  }
  async function salvarEdit() {
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}`, "PATCH", f);
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setEdit(false); load();
  }

  // serviços / falhas
  const [sv, setSv] = useState<Record<string, string | boolean> | null>(null);
  async function salvarServico() {
    if (!sv) return;
    setExecutando(true); setErroAcao("");
    const r = sv.linhaId ? await api(`/api/pcm/os/${id}/servicos`, "PATCH", sv) : await api(`/api/pcm/os/${id}/servicos`, "POST", sv);
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setSv(null); load();
  }
  async function responder(linhaId: string, resposta: string | null) {
    const r = await api(`/api/pcm/os/${id}/servicos`, "PATCH", { linhaId, resposta });
    if (!r.ok) setMsg(r.error!); else load();
  }
  async function removerServico(linhaId: string) {
    const r = await api(`/api/pcm/os/${id}/servicos?linhaId=${linhaId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }

  // apontamentos
  const [quem, setQuem] = useState("");
  const [manual, setManual] = useState<{ colaboradorId: string; inicio: string; fim: string; observacao: string } | null>(null);
  async function apontar(body: Record<string, unknown>) {
    const r = await api(`/api/pcm/os/${id}/apontamentos`, "POST", body);
    if (!r.ok) { setMsg(r.error!); setErroAcao(r.error!); return false; }
    setMsg(""); load(); return true;
  }
  async function removerApont(apontamentoId: string) {
    const r = await api(`/api/pcm/os/${id}/apontamentos?apontamentoId=${apontamentoId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }

  // terceiros
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [terc, setTerc] = useState<{ fornecedorId: string; descricao: string; valor: string } | null>(null);
  async function abrirTerceiro() {
    setErroAcao(""); setTerc({ fornecedorId: "", descricao: "", valor: "" });
    if (fornecedores.length === 0) {
      const j = await fetch("/api/suprimentos/fornecedores?ativo=1").then((r) => r.json()).catch(() => ({}));
      const lista: { id: string; razaoSocial: string; nomeFantasia?: string | null }[] = Array.isArray(j) ? j : j.data ?? [];
      setFornecedores(lista.map((x) => ({ id: x.id, nome: x.nomeFantasia || x.razaoSocial })));
    }
  }
  async function salvarTerceiro() {
    if (!terc) return;
    setExecutando(true); setErroAcao("");
    const r = await api(`/api/pcm/os/${id}/terceiros`, "POST", { ...terc, valor: Number(terc.valor.replace(",", ".")) });
    setExecutando(false);
    if (!r.ok) { setErroAcao(r.error!); return; }
    setTerc(null); load();
  }
  async function removerTerceiro(terceiroId: string) {
    const r = await api(`/api/pcm/os/${id}/terceiros?terceiroId=${terceiroId}`, "DELETE");
    if (!r.ok) setMsg(r.error!); else load();
  }

  const fechada = !!o && ["CONCLUIDA", "CANCELADA"].includes(o.status);
  const checklist = useMemo(() => o?.servicos.filter((s) => s.tipoResposta !== "NENHUMA") ?? [], [o]);
  const servicos = useMemo(() => o?.servicos.filter((s) => s.tipoResposta === "NENHUMA") ?? [], [o]);
  const abertos = o?.apontamentos.filter((a) => !a.fim) ?? [];
  const totalHoras = o?.apontamentos.reduce((s, a) => s + horas(a, agora), 0) ?? 0;

  if (erroCarga) return <div className="p-8 text-sm text-danger">{erroCarga}</div>;
  if (!o) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const requisitarHref = `/suprimentos/requisicoes-materiais/nova?ordemServicoId=${o.id}&os=${encodeURIComponent(o.numero)}${o.centroCusto ? `&centroCustoId=${o.centroCusto.id}` : ""}`;
  const custoTotal = Number(o.custoMaoObra) + Number(o.custoMaterial) + Number(o.custoTerceiros);

  return (
    <div>
      <PageHeader
        title={o.numero}
        subtitle={`${o.tipo.sigla} — ${o.tipo.nome}${o.plano ? ` · plano ${o.plano.codigo} ${o.plano.nome}` : ""}${o.codOrdLegado ? " · importada do Engeman" : ""}`}
        breadcrumbs={[{ label: "Manutenção" }, { label: "Ordens de Serviço", href: "/pcm/os" }, { label: o.numero }]}
        action={<div className="flex flex-wrap items-center gap-2 justify-end">
          <StatusOSBadge s={o.status} />
          {o.acoes.filter((a) => a !== "iniciar").map((a) => {
            const cfg = ACAO[a]; if (!cfg || (cfg.pcm && !o.podeValidar)) return null;
            return <Button key={a} size="sm" variant={cfg.variant ?? "default"} disabled={executando} onClick={() => clicarAcao(a)}>{cfg.label}</Button>;
          })}
          {!fechada && <Button size="sm" variant="outline" onClick={abrirEdit} className="gap-1"><Pencil className="w-3.5 h-3.5" /> Editar</Button>}
        </div>} />
      <div className="px-8 pb-10 space-y-4">
        {msg && <div className="text-sm text-danger bg-danger/5 border border-danger/30 rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{msg}</span><button onClick={() => setMsg("")}><X className="w-4 h-4" /></button></div>}
        {o.status === "ENCERRADA" && (
          <div className="text-sm bg-purple-500/5 border border-purple-500/30 rounded-lg px-3 py-2 text-foreground">
            Execução encerrada por <b>{o.encerradaPor ?? "—"}</b> em {fmtDataHora(o.encerradaEm)}. {o.podeValidar ? "Confira apontamentos, falha e materiais e valide." : "Aguardando validação do PCM."}
          </div>
        )}
        {!fechada && o.pendencias.length > 0 && (
          <div className="text-xs bg-warning/5 border border-warning/30 rounded-lg px-3 py-2 text-foreground">
            <b className="text-warning">Para encerrar falta:</b>
            <ul className="list-disc ml-5 mt-1 space-y-0.5">{o.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {o.status === "CANCELADA" && <div className="text-sm bg-danger/5 border border-danger/30 rounded-lg px-3 py-2">Cancelada em {fmtDataHora(o.canceladaEm)}{o.motivoCancelamento ? `: ${o.motivoCancelamento}` : ""}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Resumo */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Wrench className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                {o.ativo ? (
                  <Link href={`/pcm/ativos?ativo=${o.ativo.codApl}`} className="font-medium text-foreground hover:underline">{o.ativo.tag} — {o.ativo.nome}</Link>
                ) : <span className="text-muted-foreground">{o.localTexto ?? "Sem ativo"}</span>}
                {o.ativo?.status === "PARADO" && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">ativo parado</span>}
                {o.ativo?.localizacao && <div className="text-xs text-muted-foreground">{o.ativo.localizacao}</div>}
              </div>
              <PrioridadeTxt p={o.prioridade} />
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{o.descricao}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Campo l="Equipe" v={o.equipe?.nome} /><Campo l="Responsável" v={o.responsavel?.nome} />
              <Campo l="Programada" v={fmtDataHora(o.programadaPara)} /><Campo l="Prazo" v={fmtData(o.prazo)} />
              <Campo l="Horas estimadas" v={o.horasEstimadas ? `${Number(o.horasEstimadas)} h` : null} /><Campo l="Início" v={fmtDataHora(o.iniciadaEm)} />
              <Campo l="Centro de custo" v={o.centroCusto ? `${o.centroCusto.codigo} ${o.centroCusto.nome}` : null} /><Campo l="Leitura do medidor" v={o.leituraMedidor} />
            </div>
            <div className={cn("text-xs rounded-lg px-3 py-2 border", o.paradaInicio && !o.paradaFim ? "bg-danger/5 border-danger/30" : "bg-muted/40 border-border")}>
              <b>Parada do ativo:</b>{" "}
              {o.paradaInicio ? <>de {fmtDataHora(o.paradaInicio)} {o.paradaFim ? <>até {fmtDataHora(o.paradaFim)} ({fmtHoras(horas({ inicio: o.paradaInicio, fim: o.paradaFim }, agora))})</> : <span className="text-danger font-medium">— ainda parado</span>}</> : <span className="text-muted-foreground">sem parada registrada{o.exigeParada ? " (serviço exige parar o ativo)" : ""}</span>}
            </div>
            {o.observacaoTecnica && <div className="text-xs"><b>Observação técnica:</b> <span className="whitespace-pre-wrap">{o.observacaoTecnica}</span></div>}
            {o.solicitacoes.length > 0 && <div className="text-xs text-muted-foreground">Origem: {o.solicitacoes.map((s) => `${s.numero} (${s.solicitanteNome ?? "—"}, ${fmtData(s.createdAt)})`).join(" · ")}</div>}
            <Autoria criadoPor={o.criadoPor} atualizadoPor={o.atualizadoPor} criadoEm={o.createdAt} atualizadoEm={o.updatedAt} />
          </div>

          {/* Custos */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
            <div className="font-semibold text-foreground">Custo da OS</div>
            <Linha l="Mão de obra" v={brl(o.custoMaoObra)} /><Linha l="Material" v={brl(o.custoMaterial)} /><Linha l="Terceiros" v={brl(o.custoTerceiros)} />
            <div className="border-t border-border pt-2"><Linha l="Total" v={brl(custoTotal)} forte /></div>
            <p className="text-[11px] text-muted-foreground">Mão de obra = horas apontadas × custo-hora da equipe. Material = requisições atendidas vinculadas (CMPM).</p>
            {o.concluidaEm && <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Concluída por {o.concluidaPor ?? "—"} em {fmtDataHora(o.concluidaEm)}</p>}
          </div>
        </div>

        {/* Mão de obra */}
        <Secao titulo={`Mão de obra · ${fmtHoras(totalHoras)}`} acao={!fechada && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56"><ComboboxWithCreate value={quem} onChange={setQuem} options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Quem vai executar…" /></div>
            <Button size="sm" disabled={!quem} onClick={async () => { if (await apontar({ acao: "iniciar", colaboradorId: quem })) setQuem(""); }} className="gap-1"><Play className="w-3.5 h-3.5" /> Iniciar</Button>
            <Button size="sm" variant="outline" onClick={() => { setErroAcao(""); setManual({ colaboradorId: quem, inicio: "", fim: "", observacao: "" }); }}>Lançar horas</Button>
          </div>
        )}>
          {o.apontamentos.length === 0 ? <Vazio t="Nenhum apontamento." /> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Executante</th><th className="text-left py-1">Início</th><th className="text-left py-1">Fim</th><th className="text-right py-1">Horas</th><th /></tr></thead>
              <tbody>{o.apontamentos.map((a) => (
                <tr key={a.id} className="border-t border-border/60">
                  <td className="py-1.5">{a.nome}{!a.colaboradorId && <span className="ml-1 text-[10px] text-muted-foreground">(Engeman)</span>}{a.observacao && <div className="text-[11px] text-muted-foreground">{a.observacao}</div>}</td>
                  <td className="py-1.5 text-xs">{fmtDataHora(a.inicio)}</td>
                  <td className="py-1.5 text-xs">{a.fim ? fmtDataHora(a.fim) : <span className="text-warning font-medium">em andamento</span>}</td>
                  <td className="py-1.5 text-right text-xs">{fmtHoras(horas(a, agora))}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {!fechada && !a.fim && <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => apontar({ acao: "parar", apontamentoId: a.id })}><Square className="w-3 h-3" /> Parar</Button>}
                    {!fechada && <button className="ml-2 text-muted-foreground hover:text-danger" onClick={() => removerApont(a.id)} title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {abertos.length > 0 && <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Pause className="w-3 h-3" /> Pare os cronômetros antes de encerrar a OS.</p>}
        </Secao>

        {/* Checklist do plano */}
        {checklist.length > 0 && (
          <Secao titulo={`Checklist · ${checklist.filter((c) => c.resposta).length}/${checklist.length}`}>
            <div className="divide-y divide-border/60">
              {checklist.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <span className={cn("flex-1 min-w-[14rem]", c.conforme === false && "text-danger")}>{c.descricao}{c.tipoResposta === "NUMERO" && (c.faixaMin || c.faixaMax) && <span className="text-[11px] text-muted-foreground"> (faixa {c.faixaMin ?? "—"} a {c.faixaMax ?? "—"})</span>}</span>
                  {c.tipoResposta === "OK_NOK" ? (
                    <div className="flex gap-1">
                      {["OK", "NOK", "N/A"].map((r) => <button key={r} disabled={fechada} onClick={() => responder(c.id, c.resposta === r ? null : r)} className={cn("text-xs px-2 py-0.5 rounded border", c.resposta === r ? (r === "OK" ? "bg-success/15 border-success/40 text-success" : r === "NOK" ? "bg-danger/15 border-danger/40 text-danger" : "bg-muted border-border") : "border-border text-muted-foreground hover:bg-muted")}>{r}</button>)}
                    </div>
                  ) : (
                    <Input key={c.resposta ?? ""} defaultValue={c.resposta ?? ""} disabled={fechada} inputMode={c.tipoResposta === "NUMERO" ? "decimal" : undefined} className={cn("h-7 w-40 text-xs", c.conforme === false && "border-danger")} onBlur={(e) => e.target.value !== (c.resposta ?? "") && responder(c.id, e.target.value || null)} />
                  )}
                </div>
              ))}
            </div>
            {checklist.some((c) => c.conforme === false) && <p className="text-[11px] text-danger mt-2">Há itens não conformes — abra uma corretiva se precisar de intervenção.</p>}
          </Secao>
        )}

        {/* Serviços / falha */}
        <Secao titulo="Serviços executados e falha" acao={!fechada && <Button size="sm" variant="outline" className="gap-1" onClick={() => { setErroAcao(""); setSv({ descricao: "", servicoId: "", sintomaId: "", causaId: "", executado: true, tempoHoras: "" }); }}><Plus className="w-3.5 h-3.5" /> Serviço</Button>}>
          {o.tipo.contaComoFalha && <p className="text-[11px] text-muted-foreground mb-2">OS corretiva: registre o sintoma (defeito) e a causa — é isso que alimenta MTBF, MTTR e FMEA.</p>}
          {servicos.length === 0 ? <Vazio t="Nenhum serviço registrado." /> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Serviço</th><th className="text-left py-1">Sintoma</th><th className="text-left py-1">Causa</th><th className="text-right py-1">Tempo</th><th /></tr></thead>
              <tbody>{servicos.map((s) => (
                <tr key={s.id} className="border-t border-border/60 align-top">
                  <td className="py-1.5">{s.descricao}{s.servico && s.servico.descricao !== s.descricao && <div className="text-[11px] text-muted-foreground">{s.servico.descricao}</div>}{!s.executado && <span className="text-[10px] text-muted-foreground"> (não executado)</span>}</td>
                  <td className="py-1.5 text-xs">{s.sintoma?.descricao ?? "—"}</td>
                  <td className="py-1.5 text-xs">{s.causa?.descricao ?? "—"}</td>
                  <td className="py-1.5 text-right text-xs">{s.tempoHoras ? `${Number(s.tempoHoras)} h` : "—"}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">{!fechada && <>
                    <button className="text-muted-foreground hover:text-foreground" title="Editar" onClick={() => { setErroAcao(""); setSv({ linhaId: s.id, descricao: s.descricao, servicoId: s.servicoId ?? "", sintomaId: s.sintomaId ?? "", causaId: s.causaId ?? "", executado: s.executado, tempoHoras: s.tempoHoras ?? "" }); }}><Pencil className="w-3.5 h-3.5" /></button>
                    <button className="ml-2 text-muted-foreground hover:text-danger" title="Excluir" onClick={() => removerServico(s.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Secao>

        {/* Materiais */}
        <Secao titulo="Materiais" acao={!fechada && <Link href={requisitarHref}><Button size="sm" variant="outline" className="gap-1"><Plus className="w-3.5 h-3.5" /> Requisitar material</Button></Link>}>
          {o.requisicoes.length === 0 && o.materiais.length === 0 ? <Vazio t="Nenhum material. Use “Requisitar material” — a requisição sai do almoxarifado vinculada a esta OS." /> : (
            <div className="space-y-2 text-sm">
              {o.requisicoes.map((r) => (
                <div key={r.id} className="border border-border/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs"><Link href={`/suprimentos/requisicoes-materiais/${r.id}`} className="font-medium text-info hover:underline">{r.numero}</Link><span className="text-muted-foreground">{r.tipo === "DEVOLUCAO" ? "devolução" : "requisição"} · {fmtData(r.data)} · {r.status.toLowerCase()}</span></div>
                  <ul className="mt-1 text-xs text-muted-foreground">{r.itens.map((i, k) => <li key={k}>{Number(i.quantidade)} × {i.item.codigo} {i.item.descricao}</li>)}</ul>
                </div>
              ))}
              {o.materiais.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground"><tr><th className="text-left py-1">{o.materiais.some((m) => m.origem === "LEGADO") ? "Material (histórico Engeman / previsto)" : "Material previsto (kit do plano)"}</th><th className="text-right py-1">Qtd</th><th className="text-right py-1">Valor</th></tr></thead>
                  <tbody>{o.materiais.map((m) => <tr key={m.id} className="border-t border-border/60"><td className="py-1">{m.item?.codigo ? `${m.item.codigo} ` : ""}{m.descricao}{m.origem === "PREVISTO" && <span className="text-muted-foreground"> (previsto)</span>}</td><td className="py-1 text-right">{Number(m.quantidade)}</td><td className="py-1 text-right">{m.origem === "LEGADO" ? brl(m.valorTotal) : "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          )}
        </Secao>

        {/* Terceiros */}
        <Secao titulo="Serviços de terceiros" acao={!fechada && <Button size="sm" variant="outline" className="gap-1" onClick={abrirTerceiro}><Plus className="w-3.5 h-3.5" /> Terceiro</Button>}>
          {o.terceiros.length === 0 ? <Vazio t="Nenhum serviço externo." /> : (
            <table className="w-full text-sm"><tbody>{o.terceiros.map((t) => (
              <tr key={t.id} className="border-t border-border/60 first:border-t-0">
                <td className="py-1.5">{t.descricao}<div className="text-[11px] text-muted-foreground">{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "fornecedor não informado"}</div></td>
                <td className="py-1.5 text-right text-xs">{brl(t.valor)}</td>
                <td className="py-1.5 w-8 text-right">{!fechada && <button className="text-muted-foreground hover:text-danger" onClick={() => removerTerceiro(t.id)}><Trash2 className="w-3.5 h-3.5" /></button>}</td>
              </tr>
            ))}</tbody></table>
          )}
        </Secao>

        {/* Linha do tempo */}
        <Secao titulo="Linha do tempo">
          <ol className="space-y-1 text-xs">
            {o.eventos.map((e) => <li key={e.id} className="flex gap-2"><span className="text-muted-foreground w-28 shrink-0">{fmtDataHora(e.createdAt)}</span><span><b>{EVENTO_LABEL[e.tipo] ?? e.tipo}</b>{e.detalhe ? ` — ${e.detalhe}` : ""}{e.usuario ? <span className="text-muted-foreground"> · {e.usuario}</span> : null}</span></li>)}
            {o.eventos.length === 0 && <li className="text-muted-foreground">Sem eventos (OS do histórico do Engeman).</li>}
          </ol>
        </Secao>
      </div>

      {/* Dialog: ação com motivo / fim de parada / programação */}
      <Dialog open={!!acaoAberta} onOpenChange={(v) => !v && setAcaoAberta(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{acaoAberta ? ACAO[acaoAberta].label : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {acaoAberta === "planejar" && <div><Label>Programar para</Label><DataHora value={progr} onChange={setProgr} /></div>}
            {acaoAberta === "encerrar" && o.paradaInicio && !o.paradaFim && <div><Label>O ativo voltou a funcionar em</Label><DataHora value={fimParada} onChange={setFimParada} /><p className="text-[11px] text-muted-foreground mt-1">Parado desde {fmtDataHora(o.paradaInicio)}.</p></div>}
            {acaoAberta && ACAO[acaoAberta].motivo && <div><Label>Motivo</Label><Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>}
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAcaoAberta(null)}>Voltar</Button><Button onClick={() => acaoAberta && executar(acaoAberta)} disabled={executando} variant={acaoAberta ? ACAO[acaoAberta].variant === "destructive" ? "destructive" : "default" : "default"}>{executando ? "Salvando…" : "Confirmar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar OS */}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar {o.numero}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ativo</Label><AtivoCombobox ativos={lk.ativos} value={String(f.ativoId ?? "")} onChange={(v) => setF({ ...f, ativoId: v })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={String(f.tipoId ?? "")} onChange={(v) => setF({ ...f, tipoId: v })} options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
              <div><Label>Prioridade</Label><SelectMenu value={String(f.prioridade ?? "")} onChange={(v) => setF({ ...f, prioridade: v })} options={OPCOES_PRIORIDADE} /></div>
            </div>
            <div><Label>Descrição</Label><Textarea rows={3} value={String(f.descricao ?? "")} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Equipe</Label><SelectMenu value={String(f.equipeId ?? "")} onChange={(v) => setF({ ...f, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
              <div><Label>Responsável</Label><ComboboxWithCreate value={String(f.responsavelId ?? "")} onChange={(v) => setF({ ...f, responsavelId: v })} allowNone options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="—" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Programada para</Label><DataHora value={String(f.programadaPara ?? "")} onChange={(v) => setF({ ...f, programadaPara: v })} /></div>
              <div><Label>Prazo</Label><DataHora value={String(f.prazo ?? "")} onChange={(v) => setF({ ...f, prazo: v })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Parada — início</Label><DataHora value={String(f.paradaInicio ?? "")} onChange={(v) => setF({ ...f, paradaInicio: v })} /></div>
              <div><Label>Parada — fim (voltou a funcionar)</Label><DataHora value={String(f.paradaFim ?? "")} onChange={(v) => setF({ ...f, paradaFim: v })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Horas estimadas</Label><Input inputMode="decimal" value={String(f.horasEstimadas ?? "")} onChange={(e) => setF({ ...f, horasEstimadas: e.target.value })} /></div>
              <div><Label>Leitura do medidor na execução</Label><Input inputMode="decimal" value={String(f.leituraMedidor ?? "")} onChange={(e) => setF({ ...f, leituraMedidor: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={!!f.exigeParada} onChange={(e) => setF({ ...f, exigeParada: e.target.checked })} /> Serviço exige parar o ativo</label>
            <div><Label>Observação técnica</Label><Textarea rows={2} value={String(f.observacaoTecnica ?? "")} onChange={(e) => setF({ ...f, observacaoTecnica: e.target.value })} /></div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(false)}>Cancelar</Button><Button onClick={salvarEdit} disabled={executando}>{executando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: serviço / falha */}
      <Dialog open={!!sv} onOpenChange={(v) => !v && setSv(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{sv?.linhaId ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
          {sv && <div className="space-y-3">
            <div><Label>Serviço (catálogo)</Label><ComboboxWithCreate value={String(sv.servicoId)} onChange={(v) => { const d = lk.servicos.find((x) => x.id === v)?.descricao; setSv({ ...sv, servicoId: v, descricao: sv.descricao || d || "" }); }} allowNone options={lk.servicos.map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" /></div>
            <div><Label>O que foi feito</Label><Textarea rows={2} value={String(sv.descricao)} onChange={(e) => setSv({ ...sv, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Sintoma (defeito)</Label><ComboboxWithCreate value={String(sv.sintomaId)} onChange={(v) => setSv({ ...sv, sintomaId: v })} allowNone options={lk.sintomas.map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" /></div>
              <div><Label>Causa</Label><ComboboxWithCreate value={String(sv.causaId)} onChange={(v) => setSv({ ...sv, causaId: v })} allowNone options={lk.causas.map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><Label>Tempo (h)</Label><Input inputMode="decimal" value={String(sv.tempoHoras)} onChange={(e) => setSv({ ...sv, tempoHoras: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="rounded" checked={!!sv.executado} onChange={(e) => setSv({ ...sv, executado: e.target.checked })} /> Executado</label>
            </div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSv(null)}>Cancelar</Button><Button onClick={salvarServico} disabled={executando}>{executando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: lançar horas */}
      <Dialog open={!!manual} onOpenChange={(v) => !v && setManual(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Lançar horas</DialogTitle></DialogHeader>
          {manual && <div className="space-y-3">
            <div><Label>Executante</Label><ComboboxWithCreate value={manual.colaboradorId} onChange={(v) => setManual({ ...manual, colaboradorId: v })} options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Escolha…" /></div>
            <div><Label>Início</Label><DataHora value={manual.inicio} onChange={(v) => setManual({ ...manual, inicio: v })} /></div>
            <div><Label>Fim</Label><DataHora value={manual.fim} onChange={(v) => setManual({ ...manual, fim: v })} /></div>
            <div><Label>Observação</Label><Input value={manual.observacao} onChange={(e) => setManual({ ...manual, observacao: e.target.value })} /></div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setManual(null)}>Cancelar</Button><Button onClick={async () => { if (manual && await apontar({ acao: "manual", ...manual })) setManual(null); }}>Lançar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: terceiro */}
      <Dialog open={!!terc} onOpenChange={(v) => !v && setTerc(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Serviço de terceiro</DialogTitle></DialogHeader>
          {terc && <div className="space-y-3">
            <div><Label>Fornecedor</Label><ComboboxWithCreate value={terc.fornecedorId} onChange={(v) => setTerc({ ...terc, fornecedorId: v })} allowNone options={fornecedores.map((x) => ({ value: x.id, label: x.nome }))} placeholder="—" /></div>
            <div><Label>Serviço</Label><Input value={terc.descricao} onChange={(e) => setTerc({ ...terc, descricao: e.target.value })} placeholder="Rebobinagem do motor, usinagem do eixo…" /></div>
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={terc.valor} onChange={(e) => setTerc({ ...terc, valor: e.target.value })} /></div>
            {erroAcao && <p className="text-sm text-danger">{erroAcao}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setTerc(null)}>Cancelar</Button><Button onClick={salvarTerceiro} disabled={executando}>{executando ? "Salvando…" : "Adicionar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ l, v }: { l: string; v: string | null | undefined }) {
  return <div><div className="text-muted-foreground">{l}</div><div className="text-foreground">{v || "—"}</div></div>;
}
function Linha({ l, v, forte }: { l: string; v: string; forte?: boolean }) {
  return <div className={cn("flex justify-between", forte && "font-semibold")}><span className="text-muted-foreground">{l}</span><span>{v}</span></div>;
}
function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h3 className="text-sm font-semibold text-foreground">{titulo}</h3>{acao}</div>
      {children}
    </div>
  );
}
function Vazio({ t }: { t: string }) {
  return <p className="text-xs text-muted-foreground">{t}</p>;
}
