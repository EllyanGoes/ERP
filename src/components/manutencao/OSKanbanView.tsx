"use client";

// Visão Quadro das OS — colunas por status (padrão do kanban de Projetos, HTML5
// drag & drop). Soltar o cartão noutra coluna executa a AÇÃO do motor da OS
// (planejar, iniciar/retomar/devolver, pausar/aguardar, encerrar, concluir);
// transição inválida avisa e não move. Atualização otimista com reversão.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Clock, MapPin, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AvatarUsuario } from "@/components/projetos/comum";
import { DataHora, PrioridadeTxt, StatusOSBadge, api, brl, fmtData, fmtDataHora } from "./comum";
import {
  ACAO_LABEL, ACOES_COM_MOTIVO, ACOES_PCM_TELA, COLUNAS_OS, DESTINO_ACAO, PRIORIDADE_BORDA,
  acoesParaColuna, colunaDoStatus, custoTotalOS, osAtrasada,
  type AcaoOSTela, type OSResumo,
} from "./os-quadro";

type Props = {
  ordens: OSResumo[];
  podeValidar: boolean;
  onAbrir: (id: string) => void;
  onAtualizarLocal: (id: string, patch: Partial<OSResumo>) => void;
  onRecarregar: () => void;
  onAviso: (msg: string) => void;
};

/** Diálogo da transição: motivo, fim da parada, programação ou escolha pausa/espera. */
type Pendente = { os: OSResumo; acoes: AcaoOSTela[]; acao: AcaoOSTela; motivo: string; fimParada: string; programadaPara: string };

export default function OSKanbanView({ ordens, podeValidar, onAbrir, onAtualizarLocal, onRecarregar, onAviso }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);

  const porColuna = (key: string) => {
    const col = COLUNAS_OS.find((c) => c.key === key)!;
    return ordens
      .filter((o) => col.status.includes(o.status))
      .sort((a, b) => key === "CONCLUIDA"
        ? (b.concluidaEm ?? "").localeCompare(a.concluidaEm ?? "")
        : ordemPrioridade(a.prioridade) - ordemPrioridade(b.prioridade) || (a.prazo ?? a.programadaPara ?? "9").localeCompare(b.prazo ?? b.programadaPara ?? "9"));
  };

  // Executa a ação com atualização otimista; erro da API (pendências de
  // encerramento, permissão…) reverte o cartão e vira aviso.
  async function executar(os: OSResumo, acao: AcaoOSTela, extra: { motivo?: string; fimParada?: string; programadaPara?: string } = {}) {
    const anterior = { status: os.status };
    onAtualizarLocal(os.id, { status: DESTINO_ACAO[acao] });
    const r = await api(`/api/pcm/os/${os.id}/acao`, "POST", {
      acao, motivo: extra.motivo ?? "", fimParada: extra.fimParada || null, programadaPara: extra.programadaPara || null,
    });
    if (!r.ok) {
      onAtualizarLocal(os.id, anterior);
      onAviso(`${os.numero}: ${r.error}`);
      return;
    }
    onRecarregar();
  }

  function soltar(colunaKey: string) {
    const os = ordens.find((o) => o.id === dragId);
    setDragId(null); setDropCol(null);
    if (!os || colunaDoStatus(os.status) === colunaKey) return;
    const { acoes, erro } = acoesParaColuna(os.status, colunaKey);
    if (!acoes.length) { onAviso(`${os.numero}: ${erro}`); return; }
    const permitidas = acoes.filter((a) => podeValidar || !ACOES_PCM_TELA.includes(a));
    if (!permitidas.length) { onAviso(`${os.numero}: só o PCM (permissão Validar OS) pode ${ACAO_LABEL[acoes[0]].toLowerCase()}.`); return; }
    const acao = permitidas[0];
    const precisaDialog = permitidas.length > 1 || ACOES_COM_MOTIVO.includes(acao) || acao === "planejar"
      || (acao === "encerrar" && !!os.paradaInicio && !os.paradaFim);
    if (precisaDialog) {
      setPendente({ os, acoes: permitidas, acao, motivo: "", fimParada: "", programadaPara: os.programadaPara ?? "" });
      return;
    }
    executar(os, acao);
  }

  function confirmar() {
    if (!pendente) return;
    const { os, acao, motivo, fimParada, programadaPara } = pendente;
    if (ACOES_COM_MOTIVO.includes(acao) && !motivo.trim()) return;
    setPendente(null);
    executar(os, acao, { motivo, fimParada, programadaPara });
  }

  const arrastando = dragId ? ordens.find((o) => o.id === dragId) : null;

  return (
    <div className="flex items-start gap-3 px-3 py-3 h-full overflow-x-auto">
      {COLUNAS_OS.map((col) => {
        const lista = porColuna(col.key);
        // Coluna que aceita o cartão em arraste fica realçada; a inválida apaga.
        const valida = arrastando && colunaDoStatus(arrastando.status) !== col.key ? acoesParaColuna(arrastando.status, col.key).acoes.length > 0 : null;
        return (
          <div
            key={col.key}
            className={cn(
              "w-[272px] shrink-0 bg-muted/60 rounded-xl border border-border flex flex-col max-h-full transition-opacity",
              valida === false && "opacity-50",
              dropCol === col.key && valida && "ring-2 ring-info/50",
            )}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropCol(col.key); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol((c) => (c === col.key ? null : c)); }}
            onDrop={(e) => { e.preventDefault(); soltar(col.key); }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 shrink-0">
              <span className={cn("w-2 h-2 rounded-full", col.cor)} />
              <span className="font-semibold text-sm text-foreground truncate">{col.label}</span>
              <span className="text-xs text-muted-foreground">{lista.length}</span>
            </div>
            <div className="flex-1 min-h-[3rem] overflow-y-auto px-2 pb-2 space-y-2">
              {lista.map((o) => <CartaoOS key={o.id} o={o} arrastando={dragId === o.id} onAbrir={onAbrir}
                onDragStart={() => setDragId(o.id)} onDragEnd={() => { setDragId(null); setDropCol(null); }} />)}
              {lista.length === 0 && <p className="text-xs text-muted-foreground/70 text-center py-4">Nenhuma OS</p>}
            </div>
          </div>
        );
      })}

      {/* Mini-diálogo da transição (motivo / fim da parada / programação) */}
      <Dialog open={!!pendente} onOpenChange={(v) => !v && setPendente(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{pendente ? `${pendente.os.numero} — ${ACAO_LABEL[pendente.acao]}` : ""}</DialogTitle></DialogHeader>
          {pendente && (
            <div className="space-y-3">
              {pendente.acoes.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {pendente.acoes.map((a) => (
                    <button key={a} type="button" onClick={() => setPendente({ ...pendente, acao: a })}
                      className={cn("text-xs px-2.5 py-1 rounded-full border", pendente.acao === a ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>
                      {ACAO_LABEL[a]}
                    </button>
                  ))}
                </div>
              )}
              {pendente.acao === "planejar" && <div><Label>Programar para</Label><DataHora value={pendente.programadaPara} onChange={(v) => setPendente({ ...pendente, programadaPara: v })} /></div>}
              {pendente.acao === "encerrar" && pendente.os.paradaInicio && !pendente.os.paradaFim && (
                <div>
                  <Label>O ativo voltou a funcionar em</Label>
                  <DataHora value={pendente.fimParada} onChange={(v) => setPendente({ ...pendente, fimParada: v })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Parado desde {fmtDataHora(pendente.os.paradaInicio)}.</p>
                </div>
              )}
              {ACOES_COM_MOTIVO.includes(pendente.acao) && (
                <div><Label>Motivo</Label><Textarea rows={3} autoFocus value={pendente.motivo} onChange={(e) => setPendente({ ...pendente, motivo: e.target.value })} /></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendente(null)}>Voltar</Button>
            <Button onClick={confirmar} disabled={!!pendente && ACOES_COM_MOTIVO.includes(pendente.acao) && !pendente.motivo.trim()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ordemPrioridade = (p: string) => ({ EMERGENCIA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 } as Record<string, number>)[p] ?? 4;

function CartaoOS({ o, arrastando, onAbrir, onDragStart, onDragEnd }: {
  o: OSResumo; arrastando: boolean; onAbrir: (id: string) => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const atrasada = osAtrasada(o);
  const ref = o.prazo ?? o.programadaPara;
  const custo = custoTotalOS(o);
  const espera = ["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"].includes(o.status);
  const motivo = espera ? o.eventos?.[0]?.detalhe : null;
  return (
    <div
      draggable
      // setData é obrigatório p/ o drag iniciar em alguns navegadores
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={() => onAbrir(o.id)}
      className={cn(
        "relative bg-card rounded-lg border border-border border-l-4 px-3 py-2 shadow-sm cursor-pointer hover:border-blue-400 transition-colors",
        PRIORIDADE_BORDA[o.prioridade] ?? "border-l-border",
        arrastando && "opacity-40",
        o.status === "CONCLUIDA" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold text-foreground">{o.numero}</span>
        <span className="text-muted-foreground" title={o.tipo.nome}>{o.tipo.sigla}</span>
        {o.planoId && <span className="text-[10px] px-1 rounded bg-info/10 text-info">plano</span>}
        <span className="ml-auto"><PrioridadeTxt p={o.prioridade} /></span>
      </div>
      <div className="mt-1 text-sm text-foreground leading-snug">
        {o.ativo ? <><span className="text-xs text-muted-foreground">{o.ativo.tag}</span> {o.ativo.nome}</> : <span className="text-muted-foreground inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{o.localTexto ?? "Sem ativo"}</span>}
        {o.paradaInicio && !o.paradaFim && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">parado</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2" title={o.descricao}>{o.descricao}</p>
      {espera && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusOSBadge s={o.status} />
          {motivo && <span className="text-[11px] text-muted-foreground truncate max-w-full" title={motivo}>{motivo}</span>}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
        {o.status === "CONCLUIDA" ? (
          <span className="text-success">concluída {fmtData(o.concluidaEm)}</span>
        ) : ref && (
          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md", atrasada ? "bg-danger/15 text-danger font-semibold" : "text-muted-foreground")}>
            <Clock className="w-3 h-3" /> {fmtData(ref)}{atrasada && " · atrasada"}
          </span>
        )}
        {o.equipe && <span className="inline-flex items-center gap-1 text-muted-foreground truncate max-w-[8rem]" title={o.equipe.nome}><Users className="w-3 h-3" />{o.equipe.nome}</span>}
        {custo > 0 && <span className="text-muted-foreground tabular-nums">{brl(custo)}</span>}
        {o.apontamentos.length > 0 && (
          <span className="ml-auto flex items-center gap-1" title={`Em execução: ${o.apontamentos.map((a) => a.nome).join(", ")}`}>
            <Timer className="w-3 h-3 text-warning" />
            <span className="flex -space-x-1">{o.apontamentos.slice(0, 3).map((a, i) => <AvatarUsuario key={i} nome={a.nome} size="sm" />)}</span>
            {o.apontamentos.length === 1 && <span className="text-muted-foreground truncate max-w-[5rem]">{o.apontamentos[0].nome.split(" ")[0]}</span>}
          </span>
        )}
        {o.apontamentos.length === 0 && o.responsavel && (
          <span className="ml-auto" title={`Responsável: ${o.responsavel.nome}`}><AvatarUsuario nome={o.responsavel.nome} size="sm" title={`Responsável: ${o.responsavel.nome}`} /></span>
        )}
      </div>
    </div>
  );
}
