"use client";

// Nova entrega de EPI em dois modos:
//  • Para um colaborador — vários EPIs de uma vez, vira FICHA (termo p/ assinar,
//    depois o escaneado é anexado e arquivado no GED).
//  • Em lote — um EPI para vários colaboradores (campanha de troca).
// Regra de prazo: EPI retirado antes do fim da vida útil exige motivo; a tela
// avisa antes e o servidor confere de novo (422 precisaMotivo).
// Ficha só sai com o cadastro que a cautela imprime completo (CPF, matrícula,
// admissão, setor, cargo) — a tela bloqueia e oferece completar; o servidor confere.
import { useEffect, useMemo, useState } from "react";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import InfoHint from "@/components/shared/InfoHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, Printer, User, Users } from "lucide-react";
import Link from "next/link";
import { PROCEDIMENTO_EPI_RETROATIVO } from "@/lib/documentacao/procedimentos-sst";
import { fmtData, hojeISO, UploadAnexo, TIPO_ENTREGA, participaSst, type Lookups } from "@/components/sst/comum";
import CadastroComplementarDialog, { AvisoCadastroIncompleto, type ColabCadastro } from "@/components/sst/CadastroComplementarDialog";
import CautelaEpiDialog from "@/components/sst/CautelaEpiDialog";
import { camposFaltandoCautela } from "@/lib/sst-cadastro";

export type EpiOpt = {
  id: string; nome: string; ca: string | null; vidaUtilDias: number | null; itemId: string | null; ativo: boolean;
  /** Tamanhos (um item de estoque cada). Com 2+ a entrega exige escolher o tamanho. */
  itens?: { itemId: string; tamanho: string | null; saldo?: number }[];
  /** Saldo próprio somado em todos os locais (null = sem item de estoque). */
  saldoEstoque?: number | null;
};
const temEstoque = (e: EpiOpt) => !!e.itemId || (e.itens?.length ?? 0) > 0;
const grade = (e?: EpiOpt | null) => (e?.itens ?? []).filter((i) => i.tamanho);
// Botão mostra só o tamanho; a lista mostra também o saldo de cada um.
const opcoesTamanho = (e: EpiOpt) => grade(e).map((i) => ({
  value: i.tamanho!, label: i.tamanho!,
  render: () => <span>{i.tamanho}{i.saldo !== undefined && <span className={cn("ml-1.5 text-xs", i.saldo <= 0 ? "text-danger" : "text-muted-foreground")}>{i.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} em estoque</span>}</span>,
}));
const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
/** Saldo exibido na linha: o do tamanho escolhido, senão o total do EPI. */
function saldoLinha(e: EpiOpt, tamanho: string): { valor: number; rotulo: string } | null {
  const doTam = tamanho ? e.itens?.find((i) => i.tamanho === tamanho)?.saldo : undefined;
  if (doTam !== undefined) return { valor: doTam, rotulo: `tam. ${tamanho}` };
  if (e.saldoEstoque != null) return { valor: e.saldoEstoque, rotulo: grade(e).length > 1 ? "total" : "" };
  return null;
}
export type ColabOpt = { id: string; nome: string; ativo: boolean; afastamento?: unknown | null; funcao: { nome: string } | null };
type FichaCriada = { id: string; numero: number; colaborador: { id: string; nome: string }; itens: { id: string }[] };

type Linha = { sel: boolean; qtd: string; tipo: string; motivo: string; local: string; tamanho: string };
type DetalheColab = {
  id: string; nome: string; cpf: string | null; rg: string | null; matricula: string | null; cargo: string | null;
  dataAdmissao: string | null; setor: { id: string; nome: string } | null; sstFuncoes: unknown[];
  episStatus: { epi: { id: string }; obrigatorio: boolean; quantidade: number; entregaVigente: { data: string; vencimentoUso: string | null } | null }[];
  sstEpiEntregas: {
    id: string; epiId: string; tipo: string; data: string; vencimentoUso: string | null; tamanho?: string | null;
    quantidade: number; motivo: string | null; epi: { nome: string; ca: string | null };
    ficha: { id: string; numero: number; documentoId: string | null } | null;
  }[];
};

export default function EntregaEpiDialog({ open, onOpenChange, epis, colabs, lk, colaboradorFixo, epiInicialId, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; epis: EpiOpt[]; colabs: ColabOpt[]; lk: Lookups;
  /** Aberto a partir da ficha do colaborador: trava o colaborador e esconde o modo lote. */
  colaboradorFixo?: { id: string; nome: string } | null;
  /** EPI já marcado ao abrir (botão "Entregar/Trocar" da ficha do colaborador). */
  epiInicialId?: string | null;
  onSaved: () => void;
}) {
  const [modo, setModo] = useState<"colaborador" | "lote">("colaborador");
  const [data, setData] = useState(hojeISO());
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const episAtivos = useMemo(() => epis.filter((e) => e.ativo), [epis]);

  // ── modo colaborador ──
  const [colabId, setColabId] = useState("");
  const [detalhe, setDetalhe] = useState<DetalheColab | null>(null);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [localPadrao, setLocalPadrao] = useState("");
  const [obs, setObs] = useState("");
  const [ficha, setFicha] = useState<FichaCriada | null>(null);
  const [docAssinado, setDocAssinado] = useState<string | null>(null);
  const [cautela, setCautela] = useState<string | null>(null);
  const [aba, setAba] = useState<"selecao" | "historico">("selecao");
  const [procAberto, setProcAberto] = useState(false);
  // Cadastro do colaborador (o que a cautela imprime) — recarregado sozinho
  // depois de completar, sem refazer as linhas de EPI já marcadas.
  const [cadastro, setCadastro] = useState<ColabCadastro | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const paraCadastro = (d: DetalheColab | null): ColabCadastro | null => d ? { id: d.id, nome: d.nome, cpf: d.cpf, rg: d.rg, matricula: d.matricula, cargo: d.cargo, dataAdmissao: d.dataAdmissao, setor: d.setor, temFuncao: d.sstFuncoes.length > 0 } : null;
  function recarregarCadastro() {
    if (!colabId) return;
    fetch(`/api/sst/colaboradores/${colabId}`).then((r) => r.json()).then((j) => setCadastro(paraCadastro(j.data ?? null))).catch(() => {});
  }
  const faltando = cadastro ? camposFaltandoCautela(cadastro) : [];

  useEffect(() => {
    if (!open) return;
    setErro(""); setFicha(null); setDocAssinado(null); setObs(""); setData(hojeISO()); setAba("selecao");
    setColabId(colaboradorFixo?.id ?? ""); setDetalhe(null); setLinhas({});
    setLEpiId(""); setLSel({}); setLMotivo(""); setLPrecisa([]); setLTam({});
    if (colaboradorFixo) setModo("colaborador");
    // Só abrir/trocar de colaborador zera o formulário. Depender do objeto
    // colaboradorFixo (recriado a cada render da ficha) zerava as linhas no meio
    // do preenchimento — a lista de EPIs "sumia".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, colaboradorFixo?.id]);

  // Recarrega a cada abertura (não só quando o colaborador muda): reabrir para o
  // mesmo colaborador — sempre o caso na ficha dele — limpava as linhas no
  // reset acima e a lista de EPIs ficava em branco. `vivo` descarta resposta
  // atrasada de uma abertura/colaborador anterior.
  useEffect(() => {
    if (!open) return;
    if (!colabId) { setDetalhe(null); setLinhas({}); setCadastro(null); return; }
    setCadastro(null);
    let vivo = true;
    fetch(`/api/sst/colaboradores/${colabId}`).then((r) => r.json()).then((j) => {
      if (!vivo) return;
      const d: DetalheColab | null = j.data ?? null;
      setDetalhe(d); setCadastro(paraCadastro(d));
      // Pré-marca o que a função exige e ainda não foi entregue (ou venceu).
      const ini: Record<string, Linha> = {};
      for (const e of episAtivos) {
        const req = d?.episStatus.find((s) => s.epi.id === e.id);
        const vig = vigente(d, e.id);
        const vencido = vig?.vencimentoUso ? new Date(vig.vencimentoUso).getTime() < Date.now() : false;
        // Tamanho: o da última entrega desse EPI p/ o colaborador (se ainda existir na grade).
        const ultTam = d?.sstEpiEntregas.filter((x) => x.epiId === e.id && x.tamanho).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]?.tamanho ?? "";
        const tamanho = grade(e).some((i) => i.tamanho === ultTam) ? ultTam : grade(e).length === 1 ? grade(e)[0].tamanho! : "";
        ini[e.id] = { sel: (!!req && (!vig || vencido)) || e.id === epiInicialId, qtd: String(req?.quantidade ?? 1), tipo: vig ? "TROCA" : "ENTREGA", motivo: "", local: "", tamanho };
      }
      setLinhas(ini);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [open, colabId, episAtivos, epiInicialId]);

  function vigente(d: DetalheColab | null, epiId: string) {
    const ult = d?.sstEpiEntregas.filter((x) => x.epiId === epiId).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
    if (!ult || ult.tipo === "DEVOLUCAO") return null;
    return ult;
  }
  /** Retirada antes do fim da vida útil → motivo obrigatório. */
  function antecipada(epiId: string) {
    const v = vigente(detalhe, epiId);
    if (!v?.vencimentoUso) return null;
    return new Date(v.vencimentoUso).getTime() > new Date(`${data}T12:00:00`).getTime() ? v.vencimentoUso : null;
  }
  const setLinha = (id: string, p: Partial<Linha>) => setLinhas((l) => ({ ...l, [id]: { ...l[id], ...p } }));
  const selecionadas = Object.entries(linhas).filter(([, l]) => l.sel);

  // Ordem: exigidos pela função primeiro, depois os demais.
  const episOrdenados = useMemo(() => {
    const req = new Set(detalhe?.episStatus.map((s) => s.epi.id) ?? []);
    return [...episAtivos].sort((a, b) => Number(req.has(b.id)) - Number(req.has(a.id)) || a.nome.localeCompare(b.nome));
  }, [episAtivos, detalhe]);

  async function salvarFicha() {
    if (!colabId) { setErro("Escolha o colaborador."); return; }
    if (selecionadas.length === 0) { setErro("Selecione ao menos um EPI."); return; }
    if (!cadastro) return;
    if (faltando.length > 0) { setErro(`Complete o cadastro antes da entrega (falta: ${faltando.join(", ")}).`); return; }
    const semMotivo = selecionadas.filter(([id, l]) => l.tipo !== "DEVOLUCAO" && antecipada(id) && !l.motivo.trim());
    if (semMotivo.length > 0) { setErro("Há EPI retirado antes do prazo: informe o motivo nas linhas destacadas."); return; }
    const semTamanho = selecionadas.filter(([id, l]) => l.tipo !== "DEVOLUCAO" && grade(episAtivos.find((e) => e.id === id)).length > 1 && !l.tamanho);
    if (semTamanho.length > 0) { setErro("Escolha o tamanho dos EPIs destacados."); return; }
    setSaving(true); setErro("");
    const itens = selecionadas.map(([epiId, l]) => {
      const epi = episAtivos.find((e) => e.id === epiId)!;
      return { epiId, quantidade: Number(l.qtd) || 1, tipo: l.tipo, motivo: l.motivo || null, tamanho: l.tamanho || null, localEstoqueId: temEstoque(epi) ? (l.local || localPadrao || null) : null };
    });
    const res = await fetch("/api/sst/entregas/fichas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: colabId, data, observacoes: obs || null, itens }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro ao registrar"); return; }
    setFicha(j.data); onSaved();
  }
  async function anexarAssinado(documentoId: string | null) {
    setDocAssinado(documentoId);
    if (!ficha) return;
    await fetch(`/api/sst/entregas/fichas/${ficha.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentoId }) });
    onSaved();
  }

  // ── modo lote ──
  const [lEpiId, setLEpiId] = useState("");
  const [lSel, setLSel] = useState<Record<string, boolean>>({});
  const [lLocal, setLLocal] = useState("");
  const [lTipo, setLTipo] = useState("ENTREGA");
  const [lBusca, setLBusca] = useState("");
  const [lMotivo, setLMotivo] = useState("");
  const [lPrecisa, setLPrecisa] = useState<{ colaboradorId: string; ate: string }[]>([]);
  const [lTam, setLTam] = useState<Record<string, string>>({});
  const epiLote = epis.find((e) => e.id === lEpiId);
  const loteComTamanho = grade(epiLote).length > 0;
  async function salvarLote() {
    const ids = Object.entries(lSel).filter(([, v]) => v).map(([k]) => k);
    if (!lEpiId || ids.length === 0) { setErro("Escolha o EPI e ao menos um colaborador."); return; }
    if (grade(epiLote).length > 1 && ids.some((id) => !lTam[id])) { setErro("Escolha o tamanho de cada colaborador selecionado."); return; }
    setSaving(true); setErro("");
    const tamanhos = Object.fromEntries(ids.map((id) => [id, lTam[id] || null]));
    const res = await fetch("/api/sst/entregas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorIds: ids, epiId: lEpiId, tipo: lTipo, quantidade: 1, data, localEstoqueId: lLocal || null, motivo: lMotivo || null, tamanhos }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 422 && j.precisaMotivo) { setLPrecisa(j.precisaMotivo); setErro("Alguns colaboradores ainda estão dentro do prazo deste EPI — informe o motivo da troca antecipada."); return; }
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    onSaved(); onOpenChange(false);
  }

  const nomeColab = colaboradorFixo?.nome ?? colabs.find((c) => c.id === colabId)?.nome ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", ficha ? "sm:max-w-4xl" : "sm:max-w-7xl")}>
        <DialogHeader><DialogTitle>{ficha ? `Ficha de EPI nº ${String(ficha.numero).padStart(4, "0")}` : "Nova entrega de EPI"}</DialogTitle></DialogHeader>

        {ficha ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Entrega registrada para {ficha.colaborador.nome} — {ficha.itens.length} item(ns).</p>
                <p className="text-muted-foreground mt-0.5">Imprima o termo, colha a assinatura e anexe o escaneado aqui (ou depois, na aba Fichas). Sem o termo assinado a ficha fica como pendente.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">1. Imprimir e assinar</p>
                <button type="button" onClick={() => setCautela(ficha.id)} className="inline-flex items-center gap-1.5 text-sm text-info hover:underline"><Printer className="w-4 h-4" /> Abrir termo para impressão</button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">2. Arquivar o termo assinado</p>
                <UploadAnexo tipo="termo-epi" titulo={`Ficha de EPI nº ${String(ficha.numero).padStart(4, "0")} — ${ficha.colaborador.nome}`} colaboradorId={ficha.colaborador.id} value={docAssinado} onChange={anexarAssinado} label="Enviar termo assinado (PDF/foto)" />
              </div>
            </div>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Concluir</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
            {!colaboradorFixo && (
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-sm">
                <button type="button" onClick={() => { setModo("colaborador"); setErro(""); }} className={cn("px-3 py-1.5 rounded-md inline-flex items-center gap-1.5", modo === "colaborador" ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground")}><User className="w-4 h-4" /> Para um colaborador</button>
                <button type="button" onClick={() => { setModo("lote"); setErro(""); }} className={cn("px-3 py-1.5 rounded-md inline-flex items-center gap-1.5", modo === "lote" ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground")}><Users className="w-4 h-4" /> Em lote (um EPI, vários)</button>
              </div>
            )}
              <button type="button" onClick={() => setProcAberto(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted" title="Como registrar um EPI que o colaborador já recebeu">
                <BookOpen className="w-4 h-4" /> Procedimento: EPI já entregue
              </button>
            </div>

            {modo === "colaborador" ? (
              <>
                <div className="grid gap-4 md:grid-cols-[300px_1fr]">
                  {/* Esquerda: dados da entrega */}
                  <div className="space-y-3">
                    <div><Label>Colaborador</Label>
                      {colaboradorFixo ? <Input value={colaboradorFixo.nome} disabled /> :
                        <ComboboxWithCreate value={colabId} onChange={setColabId} allowNone={false} placeholder="Buscar colaborador…" menuMinWidth={520} options={colabs.filter(participaSst).map((c) => ({
                          value: c.id, label: `${c.nome} ${c.funcao?.nome ?? ""}`,
                          // Nome primeiro (não pode ser cortado); a função vem depois, menor.
                          render: () => <span className="block truncate" title={c.funcao?.nome ? `${c.nome} — ${c.funcao.nome}` : c.nome}><span className="font-medium text-foreground">{c.nome}</span>{c.funcao?.nome && <span className="text-xs text-muted-foreground"> · {c.funcao.nome}</span>}</span>,
                        }))} />}
                    </div>
                    <div><Label className="inline-flex items-center gap-1">Data da entrega
                      <InfoHint side="right"><b>EPI já entregue antes (registro retroativo):</b> informe aqui a data em que o colaborador realmente recebeu. A vida útil e o vencimento contam a partir dela, e o termo sai com essa data — imprima, colha a assinatura e anexe. Se entregou em dias diferentes, registre uma entrega para cada data.</InfoHint>
                    </Label><DatePicker value={data} onChange={setData} /></div>
                    {episAtivos.some(temEstoque) && (
                      <div><Label className="inline-flex items-center gap-1">Baixar do estoque
                        <InfoHint side="right"><b>Registro retroativo:</b> se a saída desse EPI já foi lançada no estoque (requisição ou ajuste) ou se ele nunca entrou no sistema, escolha <b>Não baixar</b> — senão o saldo é descontado duas vezes. Só escolha um local se a peça ainda consta no saldo.</InfoHint>
                      </Label>
                        <SelectMenu value={localPadrao} onChange={setLocalPadrao} options={[{ value: "", label: "— Não baixar —" }, ...lk.locais.map((l) => ({ value: l.id, label: l.nome }))]} />
                        <p className="text-[11px] text-muted-foreground mt-1">Local padrão; cada EPI pode baixar de outro local na lista.</p>
                      </div>
                    )}
                    <div><Label>Observações da ficha</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional — aparece no termo impresso" rows={3} /></div>
                    {cadastro && <AvisoCadastroIncompleto faltando={faltando} onCompletar={() => setCadastroAberto(true)} bloqueia="a entrega só pode ser registrada com o cadastro completo" />}
                    {cadastro && <CadastroComplementarDialog open={cadastroAberto} onOpenChange={setCadastroAberto} colaborador={cadastro} onSaved={recarregarCadastro} />}
                  </div>

                  {/* Direita: seleção dos EPIs */}
                  <div className="rounded-lg border border-border min-w-0 flex flex-col">
                    <div className="flex items-center gap-1 px-2 pt-1.5 bg-muted rounded-t-lg border-b border-border text-xs">
                      {([["selecao", `Selecionar EPIs (${selecionadas.length})`], ["historico", `Histórico de entregas${detalhe ? ` (${detalhe.sstEpiEntregas.length})` : ""}`]] as const).map(([k, rot]) => (
                        <button key={k} type="button" onClick={() => setAba(k)} className={cn("px-3 py-1.5 -mb-px rounded-t-md border border-transparent", aba === k ? "bg-card border-border border-b-card text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>{rot}</button>
                      ))}
                      {aba === "selecao" && colabId && <span className="ml-auto pr-1 text-muted-foreground inline-flex items-center gap-1">os exigidos pela função aparecem primeiro
                        <InfoHint side="left">Em <b>registro retroativo</b>, marque só o que de fato foi entregue naquela data. Se o EPI aparece como “em uso” e você registra uma data anterior ao fim da vida útil, o sistema pede o motivo — use, por ex., “registro retroativo”. Confira na aba <b>Histórico de entregas</b> para não lançar em dobro.</InfoHint></span>}
                    </div>
                    {/* Altura fixa: trocar de aba/colaborador não redimensiona o popup. */}
                    <div className="h-[58vh] overflow-y-auto">
                    {!colabId ? (
                      <p className="px-3 py-10 text-sm text-muted-foreground text-center">Escolha o colaborador para ver os EPIs.</p>
                    ) : aba === "historico" ? (
                      <HistoricoEntregas entregas={detalhe?.sstEpiEntregas ?? null} onCautela={setCautela} />
                    ) : (
                    <div className="divide-y divide-border/60">
                      {episOrdenados.map((e) => {
                        const l = linhas[e.id]; if (!l) return null;
                        const req = detalhe?.episStatus.find((s) => s.epi.id === e.id);
                        const vig = vigente(detalhe, e.id);
                        const ate = l.sel && l.tipo !== "DEVOLUCAO" ? antecipada(e.id) : null;
                        const vencido = vig?.vencimentoUso ? new Date(vig.vencimentoUso).getTime() < Date.now() : false;
                        const saldo = saldoLinha(e, l.tamanho);
                        const semSaldo = !!saldo && l.sel && l.tipo !== "DEVOLUCAO" && saldo.valor < (Number(l.qtd) || 1);
                        return (
                          <div key={e.id} className={cn("px-3 py-2", l.sel && "bg-info/5", ((ate && !l.motivo.trim()) || (l.sel && l.tipo !== "DEVOLUCAO" && grade(e).length > 1 && !l.tamanho)) && "bg-warning/5")}>
                            <div className="flex items-center gap-3">
                              <input type="checkbox" className="rounded" checked={l.sel} onChange={(ev) => setLinha(e.id, { sel: ev.target.checked })} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{e.nome}{e.ca ? <span className="text-xs text-muted-foreground"> · CA {e.ca}</span> : null}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {req ? <span className="text-info font-medium">exigido pela função{!req.obrigatorio && " (opcional)"}</span> : "não exigido pela função"}
                                  {" · "}
                                  {!vig ? "nunca entregue" : vencido ? <span className="text-danger">vencido em {fmtData(vig.vencimentoUso)}</span> : vig.vencimentoUso ? `em uso até ${fmtData(vig.vencimentoUso)}` : `entregue em ${fmtData(vig.data)}`}
                                  {e.vidaUtilDias ? ` · vida útil ${e.vidaUtilDias} d` : " · sem prazo definido"}
                                </p>
                              </div>
                              <div className={cn("shrink-0 text-right leading-tight w-[110px]", saldo == null ? "text-muted-foreground" : saldo.valor <= 0 || semSaldo ? "text-danger" : "text-foreground")}
                                title={saldo == null ? "EPI sem item de estoque vinculado" : grade(e).length > 1 ? (e.itens ?? []).map((i) => `${i.tamanho ?? "—"}: ${fmtQtd(i.saldo ?? 0)}`).join("\n") : "Saldo somado em todos os locais"}>
                                {saldo == null ? <span className="text-[11px]">sem estoque</span> : <>
                                  <span className="text-sm font-medium tabular-nums">{fmtQtd(saldo.valor)}</span>
                                  <span className="block text-[10px] text-muted-foreground">em estoque{saldo.rotulo ? ` · ${saldo.rotulo}` : ""}</span>
                                </>}
                              </div>
                              {/* Slots de largura fixa (mesmo vazios) p/ a coluna do saldo alinhar em todas as linhas. */}
                              <div className={cn("shrink-0 flex items-center gap-2", !l.sel && "invisible")} aria-hidden={!l.sel}>
                                <div className="w-[110px]">
                                  <SelectMenu value={l.tipo} onChange={(v) => setLinha(e.id, { tipo: v })} triggerClassName="h-8 w-[110px] text-xs" options={Object.entries(TIPO_ENTREGA).map(([value, label]) => ({ value, label }))} />
                                </div>
                                <div className="w-[104px]">{grade(e).length > 0 && <SelectMenu value={l.tamanho} onChange={(v) => setLinha(e.id, { tamanho: v })} placeholder="Tamanho" title="Tamanho" triggerClassName={cn("h-8 w-[104px] text-xs", !l.tamanho && l.tipo !== "DEVOLUCAO" && grade(e).length > 1 && "border-warning")} options={opcoesTamanho(e)} />}</div>
                                <Input type="number" min={1} value={l.qtd} onChange={(ev) => setLinha(e.id, { qtd: ev.target.value })} className="h-8 w-14 text-xs text-center" title="Quantidade" tabIndex={l.sel ? 0 : -1} />
                                <div className="w-[140px]">{temEstoque(e) && l.tipo !== "DEVOLUCAO" && <SelectMenu value={l.local} onChange={(v) => setLinha(e.id, { local: v })} triggerClassName="h-8 w-[140px] text-xs" options={[{ value: "", label: localPadrao ? "local padrão" : "— sem baixa —" }, ...lk.locais.map((x) => ({ value: x.id, label: x.nome }))]} />}</div>
                              </div>
                            </div>
                            {ate && (
                              <div className="mt-1.5 ml-7 flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                                <span className="text-xs text-warning whitespace-nowrap">Antes do prazo (até {fmtData(ate)}) — motivo obrigatório:</span>
                                <Input value={l.motivo} onChange={(ev) => setLinha(e.id, { motivo: ev.target.value })} placeholder="Ex.: dano, perda, extravio, troca por defeito…" className={cn("h-7 text-xs", !l.motivo.trim() && "border-warning")} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {episAtivos.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum EPI ativo cadastrado.</p>}
                    </div>
                    )}
                    </div>
                  </div>
                </div>
                {erro && <p className="text-sm text-danger">{erro}</p>}
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvarFicha} disabled={saving || !colabId || !cadastro || faltando.length > 0}>{saving ? "Registrando…" : `Registrar e gerar termo${nomeColab ? ` — ${nomeColab.split(" ")[0]}` : ""}`}</Button></DialogFooter>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label>EPI</Label><SelectMenu value={lEpiId} onChange={setLEpiId} placeholder="Selecionar…" options={episAtivos.map((e) => ({ value: e.id, label: e.ca ? `${e.nome} · CA ${e.ca}` : e.nome }))} /></div>
                  <div><Label>Data</Label><DatePicker value={data} onChange={setData} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tipo</Label><SelectMenu value={lTipo} onChange={setLTipo} options={Object.entries(TIPO_ENTREGA).filter(([k]) => k !== "DEVOLUCAO").map(([value, label]) => ({ value, label }))} /></div>
                  {epiLote && temEstoque(epiLote) && <div><Label>Baixar do estoque (local)</Label><SelectMenu value={lLocal} onChange={setLLocal} options={[{ value: "", label: "— Não baixar —" }, ...lk.locais.map((l) => ({ value: l.id, label: l.nome }))]} /></div>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1"><Label>Colaboradores ({Object.values(lSel).filter(Boolean).length} selecionados)</Label>
                    <div className="flex items-center gap-2">
                      <button type="button" className="text-xs text-info hover:underline" onClick={() => setLSel(Object.fromEntries(colabs.filter(participaSst).map((c) => [c.id, true])))}>todos</button>
                      <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setLSel({})}>nenhum</button>
                      {loteComTamanho && epiLote && <SelectMenu value="" onChange={(v) => setLTam(Object.fromEntries(Object.entries(lSel).filter(([, x]) => x).map(([k]) => [k, v])))} placeholder="tamanho p/ todos" triggerClassName="h-7 text-xs w-[140px]" options={opcoesTamanho(epiLote)} />}
                      <input value={lBusca} onChange={(e) => setLBusca(e.target.value)} placeholder="filtrar…" className="text-xs border border-border rounded px-2 py-1 bg-card" />
                    </div></div>
                  <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border/60">
                    {colabs.filter((c) => participaSst(c) && (!lBusca || c.nome.toLowerCase().includes(lBusca.toLowerCase()))).map((c) => {
                      const p = lPrecisa.find((x) => x.colaboradorId === c.id);
                      return (
                        <label key={c.id} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40", p && "bg-warning/5")}>
                          <input type="checkbox" className="rounded" checked={!!lSel[c.id]} onChange={(e) => setLSel({ ...lSel, [c.id]: e.target.checked })} />
                          <span className="flex-1 text-foreground">{c.nome}</span>
                          {p && <span className="text-[11px] text-warning">dentro do prazo até {fmtData(p.ate)}</span>}
                          {loteComTamanho && epiLote && lSel[c.id] && <span onClick={(ev) => ev.preventDefault()}><SelectMenu value={lTam[c.id] ?? ""} onChange={(v) => setLTam((t) => ({ ...t, [c.id]: v }))} placeholder="Tam." triggerClassName={cn("h-7 text-xs w-[80px]", !lTam[c.id] && grade(epiLote).length > 1 && "border-warning")} options={opcoesTamanho(epiLote)} /></span>}
                          <span className="text-xs text-muted-foreground">{c.funcao?.nome ?? "sem função"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {lPrecisa.length > 0 && <div><Label className="text-warning">Motivo da troca antecipada</Label><Input value={lMotivo} onChange={(e) => setLMotivo(e.target.value)} placeholder="Ex.: campanha de troca, lote com defeito…" className="border-warning" /></div>}
                <p className="text-xs text-muted-foreground">Entrega em lote não gera ficha individual — o termo assinado pode ser anexado depois, na ficha de cada colaborador.</p>
                {erro && <p className="text-sm text-danger">{erro}</p>}
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvarLote} disabled={saving}>{saving ? "Registrando…" : "Registrar entregas"}</Button></DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
      <CautelaEpiDialog fichaId={cautela} onClose={() => setCautela(null)} />
      <Dialog open={procAberto} onOpenChange={setProcAberto}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" /> Registrar EPI que o colaborador já recebeu</DialogTitle></DialogHeader>
          <ol className="space-y-3">
            {PROCEDIMENTO_EPI_RETROATIVO.map((p, i) => (
              <li key={p.titulo} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info/10 text-xs font-semibold text-info">{i + 1}</span>
                <div className="text-sm"><p className="font-medium text-foreground">{p.titulo}</p><p className="text-muted-foreground leading-snug">{p.texto}</p></div>
              </li>
            ))}
          </ol>
          <DialogFooter className="items-center">
            <Link href="/documentacao?modulo=sst" target="_blank" className="mr-auto inline-flex items-center gap-1 text-xs text-info hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Ver na Documentação (fluxo completo)</Link>
            <Button onClick={() => setProcAberto(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/** Aba "Histórico de entregas": tudo que o colaborador já recebeu/devolveu, mais recente primeiro. */
function HistoricoEntregas({ entregas, onCautela }: { entregas: DetalheColab["sstEpiEntregas"] | null; onCautela: (fichaId: string) => void }) {
  if (!entregas) return <p className="px-3 py-10 text-sm text-muted-foreground text-center">Carregando…</p>;
  if (entregas.length === 0) return <p className="px-3 py-10 text-sm text-muted-foreground text-center">Nenhuma entrega registrada para este colaborador.</p>;
  // Vigente = última movimentação de cada EPI, se não foi devolução.
  const ultimaPorEpi = new Map<string, string>();
  for (const x of [...entregas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())) if (!ultimaPorEpi.has(x.epiId)) ultimaPorEpi.set(x.epiId, x.id);
  const agora = Date.now();
  return (
    <div>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground border-b border-border">
          <tr>
            <th className="text-left font-medium px-3 py-2">Data</th>
            <th className="text-left font-medium px-2 py-2">EPI</th>
            <th className="text-left font-medium px-2 py-2">Tipo</th>
            <th className="text-left font-medium px-2 py-2">Tam.</th>
            <th className="text-right font-medium px-2 py-2">Qtd</th>
            <th className="text-left font-medium px-2 py-2">Em uso até</th>
            <th className="text-left font-medium px-2 py-2">Ficha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {entregas.map((x) => {
            const vigente = ultimaPorEpi.get(x.epiId) === x.id && x.tipo !== "DEVOLUCAO";
            const vencido = vigente && x.vencimentoUso ? new Date(x.vencimentoUso).getTime() < agora : false;
            return (
              <tr key={x.id} className="align-top hover:bg-muted/40">
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{fmtData(x.data)}</td>
                <td className="px-2 py-1.5">
                  <span className="text-foreground">{x.epi.nome}</span>{x.epi.ca && <span className="text-muted-foreground"> · CA {x.epi.ca}</span>}
                  {x.motivo && <span className="block text-[11px] text-muted-foreground">{x.motivo}</span>}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{TIPO_ENTREGA[x.tipo as keyof typeof TIPO_ENTREGA] ?? x.tipo}</td>
                <td className="px-2 py-1.5">{x.tamanho || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{x.quantidade}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {x.tipo === "DEVOLUCAO" ? <span className="text-muted-foreground">—</span>
                    : !x.vencimentoUso ? <span className="text-muted-foreground">sem prazo</span>
                    : <span className={cn(vigente ? (vencido ? "text-danger font-medium" : "text-success") : "text-muted-foreground")}>{fmtData(x.vencimentoUso)}{vigente && (vencido ? " · vencido" : " · em uso")}</span>}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {x.ficha ? (
                    <button type="button" onClick={() => onCautela(x.ficha!.id)} className="inline-flex items-center gap-1 text-info hover:underline" title={x.ficha.documentoId ? "Termo assinado anexado" : "Termo sem assinatura anexada"}>
                      <Printer className="w-3 h-3" /> nº {String(x.ficha.numero).padStart(4, "0")}
                      {!x.ficha.documentoId && <span className="text-warning">· pendente</span>}
                    </button>
                  ) : <span className="text-muted-foreground">lote</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
