"use client";

// Histórico funcional do colaborador: admissão, demissão, afastamentos (benefício
// INSS, licenças), férias, mudanças de cargo/setor, advertências — com documento
// no GED. Mudanças de função SST entram na linha do tempo (vêm do SST, só leitura).
// Demissão inativa o cadastro e encerra a função SST; afastamento aberto suspende
// as cobranças de SST e, no retorno (>= 30 dias), o SST cobra o ASO de retorno.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CalendarClock, FileText, Loader2, MoreHorizontal, Paperclip, Pencil, Plus, Trash2, UserMinus, UserCheck, Undo2 } from "lucide-react";
import { MOTIVOS_EVENTO, TIPOS_EVENTO } from "@/lib/colaborador-eventos";

type Tipo = keyof typeof TIPOS_EVENTO;
type Evento = { id: string; tipo: Tipo; data: string; dataFim: string | null; motivo: string | null; detalhes: Record<string, string> | null; observacao: string | null; documentoId: string | null; criadoPor: string | null };
type FuncaoSst = { id: string; inicio: string; fim: string | null; funcao: { nome: string } };

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const hoje = () => new Date().toISOString().slice(0, 10);
const dias = (a: string, b?: string | null) => Math.max(0, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 86_400_000));

const COR: Record<Tipo, string> = {
  ADMISSAO: "border-success/30 bg-success/5 text-success",
  DEMISSAO: "border-danger/30 bg-danger/5 text-danger",
  AFASTAMENTO: "border-warning/30 bg-warning/5 text-warning",
  FERIAS: "border-info/30 bg-info/5 text-info",
  MUDANCA_CARGO: "border-border text-foreground",
  MUDANCA_SETOR: "border-border text-foreground",
  ADVERTENCIA: "border-orange-300 bg-orange-500/5 text-orange-700 dark:text-orange-300",
  SUSPENSAO: "border-orange-300 bg-orange-500/5 text-orange-700 dark:text-orange-300",
  OUTRO: "border-border text-muted-foreground",
};
const AVISO: Record<string, string> = { TRABALHADO: "Aviso prévio trabalhado", INDENIZADO: "Aviso prévio indenizado", DISPENSADO: "Aviso prévio dispensado", NAO_SE_APLICA: "Sem aviso prévio" };

export default function HistoricoFuncional({ colaboradorId, nome, onMudou }: { colaboradorId: string; nome: string; onMudou?: () => void }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [funcoes, setFuncoes] = useState<FuncaoSst[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/empresa/colaboradores/${colaboradorId}/eventos`).then((r) => r.json()).catch(() => ({}));
    setEventos(j.data?.eventos ?? []); setFuncoes(j.data?.funcoes ?? []); setLoading(false);
  }, [colaboradorId]);
  useEffect(() => { load(); }, [load]);

  const afastado = eventos.find((e) => e.tipo === "AFASTAMENTO" && new Date(e.data) <= new Date() && (!e.dataFim || new Date(e.dataFim) > new Date()));
  const demissao = eventos.find((e) => e.tipo === "DEMISSAO");

  // Linha do tempo: eventos + mudanças de função SST (só leitura), mais recentes primeiro.
  const linhas = useMemo(() => [
    ...eventos.map((e) => ({ k: `e:${e.id}`, data: e.data, ev: e as Evento | null, fn: null as FuncaoSst | null })),
    ...funcoes.map((f) => ({ k: `f:${f.id}`, data: f.inicio, ev: null, fn: f })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()), [eventos, funcoes]);

  // ── formulário ──
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>("AFASTAMENTO");
  const [data, setData] = useState(hoje());
  const [dataFim, setDataFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState("");
  const [de, setDe] = useState(""); const [para, setPara] = useState("");
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [docAtual, setDocAtual] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  function abrir(t: Tipo, ev?: Evento) {
    setEditId(ev?.id ?? null); setTipo(ev?.tipo ?? t); setData(ev ? ev.data.slice(0, 10) : hoje()); setDataFim(ev?.dataFim ? ev.dataFim.slice(0, 10) : "");
    setMotivo(ev?.motivo ?? (t === "AFASTAMENTO" ? "INSS_DOENCA" : t === "DEMISSAO" ? "SEM_JUSTA_CAUSA" : ""));
    setAviso(ev?.detalhes?.avisoPrevio ?? (t === "DEMISSAO" ? "INDENIZADO" : "")); setDe(ev?.detalhes?.de ?? ""); setPara(ev?.detalhes?.para ?? "");
    setObs(ev?.observacao ?? ""); setArquivo(null); setDocAtual(ev?.documentoId ?? null); setErro(""); setOpen(true);
  }
  const periodo = TIPOS_EVENTO[tipo].periodo;
  const motivos = MOTIVOS_EVENTO[tipo];
  async function salvar() {
    if (!data) { setErro("Informe a data."); return; }
    if (dataFim && dataFim < data) { setErro("A data final não pode ser antes do início."); return; }
    setSalvando(true); setErro("");
    let documentoId = docAtual;
    if (arquivo) {
      const fd = new FormData(); fd.append("file", arquivo); fd.append("titulo", `${TIPOS_EVENTO[tipo].label} — ${nome} — ${fmt(data)}`);
      const up = await fetch(`/api/empresa/colaboradores/${colaboradorId}/eventos/anexo`, { method: "POST", body: fd });
      const ju = await up.json().catch(() => ({}));
      if (!up.ok) { setSalvando(false); setErro(ju.error || "Falha ao enviar o arquivo."); return; }
      documentoId = ju.data.documentoId;
    }
    const detalhes = tipo === "DEMISSAO" ? (aviso ? { avisoPrevio: aviso } : null) : (tipo === "MUDANCA_CARGO" || tipo === "MUDANCA_SETOR") ? { de, para } : null;
    const body = { tipo, data, dataFim: periodo ? (dataFim || null) : null, motivo: motivos ? motivo || null : null, detalhes, observacao: obs, documentoId };
    const res = await fetch(editId ? `/api/empresa/colaboradores/${colaboradorId}/eventos/${editId}` : `/api/empresa/colaboradores/${colaboradorId}/eventos`, {
      method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar."); return; }
    setOpen(false); load(); onMudou?.();
  }
  async function registrarRetorno(e: Evento) {
    await fetch(`/api/empresa/colaboradores/${colaboradorId}/eventos/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataFim: hoje() }) });
    load(); onMudou?.();
  }
  const [del, setDel] = useState<Evento | null>(null);
  async function excluir() {
    if (!del) return;
    setSalvando(true);
    await fetch(`/api/empresa/colaboradores/${colaboradorId}/eventos/${del.id}`, { method: "DELETE" });
    setSalvando(false); setDel(null); load(); onMudou?.();
  }

  return (
    <div className="space-y-4">
      {/* Situação + ações rápidas */}
      <div className="flex flex-wrap items-center gap-2">
        {demissao ? (
          <span className="text-xs font-medium px-2 py-1 rounded-full border border-danger/30 bg-danger/5 text-danger">Desligado em {fmt(demissao.data)}{demissao.motivo ? ` · ${MOTIVOS_EVENTO.DEMISSAO?.[demissao.motivo] ?? demissao.motivo}` : ""}</span>
        ) : afastado ? (
          <span className="text-xs font-medium px-2 py-1 rounded-full border border-warning/30 bg-warning/5 text-warning">Afastado desde {fmt(afastado.data)} ({dias(afastado.data)} dias){afastado.motivo ? ` · ${MOTIVOS_EVENTO.AFASTAMENTO?.[afastado.motivo] ?? afastado.motivo}` : ""}{afastado.dataFim ? ` · retorno previsto ${fmt(afastado.dataFim)}` : ""}</span>
        ) : (
          <span className="text-xs font-medium px-2 py-1 rounded-full border border-success/30 bg-success/5 text-success">Em atividade</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {afastado && !demissao && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => registrarRetorno(afastado)}><UserCheck className="w-4 h-4" /> Registrar retorno hoje</Button>}
          {!afastado && !demissao && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => abrir("AFASTAMENTO")}><CalendarClock className="w-4 h-4" /> Afastamento</Button>}
          {!demissao && <Button size="sm" variant="outline" className="gap-1.5 text-danger hover:text-danger" onClick={() => abrir("DEMISSAO")}><UserMinus className="w-4 h-4" /> Demissão</Button>}
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => abrir("FERIAS")}><Plus className="w-4 h-4" /> Novo evento</Button>
        </div>
      </div>

      {/* Linha do tempo */}
      <div className="bg-card rounded-xl border border-border">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : linhas.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground italic text-center">Nenhum evento registrado. Comece pela admissão.</p>
        ) : (
          <ol className="divide-y divide-border/60">
            {linhas.map((l) => l.fn ? (
              <li key={l.k} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">{fmt(l.fn.inicio)}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground shrink-0">Função SST</span>
                <span className="flex-1 text-foreground">{l.fn.funcao.nome}<span className="text-xs text-muted-foreground">{l.fn.fim ? ` · até ${fmt(l.fn.fim)}` : " · vigente"}</span></span>
              </li>
            ) : (() => {
              const e = l.ev!;
              const t = TIPOS_EVENTO[e.tipo];
              const aberto = t.periodo && !e.dataFim;
              return (
                <li key={l.k} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">{fmt(e.data)}{t.periodo && <><br />{e.dataFim ? `até ${fmt(e.dataFim)}` : <span className="text-warning">em aberto</span>}</>}</span>
                  <span className={cn("text-[11px] px-1.5 py-0.5 rounded border shrink-0", COR[e.tipo])}>{t.label}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-foreground">
                      {e.motivo ? MOTIVOS_EVENTO[e.tipo]?.[e.motivo] ?? e.motivo : null}
                      {e.detalhes?.avisoPrevio && <span className="text-muted-foreground">{e.motivo ? " · " : ""}{AVISO[e.detalhes.avisoPrevio] ?? e.detalhes.avisoPrevio}</span>}
                      {(e.detalhes?.de || e.detalhes?.para) && <span>{e.detalhes.de || "—"} → {e.detalhes.para || "—"}</span>}
                      {t.periodo && <span className="text-xs text-muted-foreground"> · {dias(e.data, e.dataFim)} dia(s)</span>}
                    </span>
                    {e.observacao && <span className="block text-xs text-muted-foreground">{e.observacao}</span>}
                    {e.criadoPor && <span className="block text-[11px] text-muted-foreground/70">registrado por {e.criadoPor}</span>}
                  </span>
                  {e.documentoId ? <Link href={`/documentos/${e.documentoId}`} className="inline-flex items-center gap-1 text-xs text-info hover:underline shrink-0"><FileText className="w-3 h-3" /> documento</Link> : <span className="text-xs text-muted-foreground/60 shrink-0">sem documento</span>}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<button className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0" aria-label="Ações"><MoreHorizontal className="w-4 h-4" /></button>} />
                    <DropdownMenuContent align="end">
                      {aberto && e.tipo === "AFASTAMENTO" && <DropdownMenuItem onClick={() => registrarRetorno(e)}><Undo2 className="w-4 h-4 mr-2" /> Registrar retorno hoje</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => abrir(e.tipo, e)}><Pencil className="w-4 h-4 mr-2" /> Editar</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setDel(e)}><Trash2 className="w-4 h-4 mr-2" /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })())}
          </ol>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Demissão inativa o cadastro e encerra a função SST (o SST passa a cobrar só o ASO demissional). Afastamento em aberto suspende as cobranças de SST; no retorno de afastamento de 30 dias ou mais, o SST cobra o ASO de retorno ao trabalho.</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar evento" : "Novo evento"} — {nome}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={tipo} onChange={(v) => { setTipo(v as Tipo); setMotivo(v === "AFASTAMENTO" ? "INSS_DOENCA" : v === "DEMISSAO" ? "SEM_JUSTA_CAUSA" : ""); }} options={Object.entries(TIPOS_EVENTO).map(([value, t]) => ({ value, label: t.label }))} disabled={!!editId} /></div>
              <div><Label>{periodo ? "Início" : tipo === "DEMISSAO" ? "Data do desligamento" : "Data"}</Label><DatePicker value={data} onChange={setData} /></div>
              {periodo && <div><Label>{tipo === "AFASTAMENTO" ? "Retorno (vazio = em aberto)" : "Fim"}</Label><DatePicker value={dataFim} onChange={setDataFim} /></div>}
            </div>
            {motivos && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{tipo === "DEMISSAO" ? "Tipo de desligamento" : "Motivo"}</Label><SelectMenu value={motivo} onChange={setMotivo} options={Object.entries(motivos).map(([value, label]) => ({ value, label }))} /></div>
                {tipo === "DEMISSAO" && <div><Label>Aviso prévio</Label><SelectMenu value={aviso} onChange={setAviso} options={Object.entries(AVISO).map(([value, label]) => ({ value, label }))} /></div>}
              </div>
            )}
            {(tipo === "MUDANCA_CARGO" || tipo === "MUDANCA_SETOR") && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>De</Label><Input value={de} onChange={(ev) => setDe(ev.target.value)} placeholder={tipo === "MUDANCA_CARGO" ? "Cargo anterior" : "Setor anterior"} /></div>
                <div><Label>Para</Label><Input value={para} onChange={(ev) => setPara(ev.target.value)} placeholder={tipo === "MUDANCA_CARGO" ? "Novo cargo" : "Novo setor"} /></div>
              </div>
            )}
            <div><Label>Observação</Label><Input value={obs} onChange={(ev) => setObs(ev.target.value)} placeholder={tipo === "AFASTAMENTO" ? "Ex.: nº do benefício, CID (se informado), perícia em…" : "Opcional"} /></div>
            <div>
              <Label>Documento (confidencial, vai para o GED)</Label>
              <label className="mt-1 flex items-center gap-2 text-sm text-info cursor-pointer w-fit">
                <Paperclip className="w-4 h-4" /> {arquivo ? arquivo.name : docAtual ? "Substituir documento" : "Anexar arquivo"}
                <input type="file" className="hidden" onChange={(ev) => setArquivo(ev.target.files?.[0] ?? null)} />
              </label>
              <p className="text-[11px] text-muted-foreground">Ex.: atestado, carta de concessão do INSS, aviso prévio, termo de rescisão, advertência assinada.</p>
            </div>
            {tipo === "DEMISSAO" && !editId && <p className="text-xs rounded-lg border border-warning/30 bg-warning/5 text-warning px-3 py-2">Ao salvar: o cadastro fica inativo, a função SST é encerrada nesta data e o SST passa a cobrar o ASO demissional. Confira os EPIs a devolver na ficha de SST.</p>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir evento?" description={del?.tipo === "DEMISSAO" ? "A demissão é desfeita: o cadastro volta a ficar ativo (a função SST não é reaberta). O registro vai para a lixeira." : "O registro vai para a lixeira."} onConfirm={excluir} loading={salvando} confirmLabel="Excluir" />
    </div>
  );
}
