"use client";

// Solicitação de Serviço (SS): formulário de abertura (qualquer usuário) e
// triagem do PCM (gerar OS / anexar a OS aberta / recusar). Usados no quadro de
// OS (coluna Solicitações) e na tela "Minhas solicitações".
import { useState } from "react";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AtivoCombobox, DataHora, OPCOES_PRIORIDADE, api, fmtDataHora, useManutLookups } from "@/components/manutencao/comum";

export type SS = {
  id: string; numero: string; descricao: string; status: string; prioridade: string | null; ativoParado: boolean; paradoDesde: string | null;
  localTexto: string | null; solicitanteNome: string | null; createdAt: string; motivoRecusa: string | null; triadoPor: string | null;
  triadoEm?: string | null; origem?: string;
  ativo: { id: string; tag: string; nome: string } | null; ordem: { id: string; numero: string; status: string } | null;
};
export type AcaoTriagem = "converter" | "anexar" | "recusar";

export const STATUS_SS: Record<string, string> = { ABERTA: "Aguardando triagem", CONVERTIDA: "Virou OS", ANEXADA: "Anexada a OS", RECUSADA: "Recusada" };
export const ORIGEM_SS: Record<string, string> = { USUARIO: "Usuário", SST_INSPECAO: "Inspeção SST", SST_INCIDENTE: "Incidente SST", CHECKLIST: "Checklist / QR" };
export const ssUrgente = (s: Pick<SS, "status" | "ativoParado" | "prioridade">) => s.status === "ABERTA" && (s.ativoParado || s.prioridade === "EMERGENCIA");

type NovaSS = { ativoId: string; localTexto: string; descricao: string; ativoParado: boolean; paradoDesde: string; prioridade: string };
const NOVA_VAZIA: NovaSS = { ativoId: "", localTexto: "", descricao: "", ativoParado: false, paradoDesde: "", prioridade: "" };

/** Abertura de SS. `onCriada` recebe a SS gravada. */
export function NovaSolicitacaoDialog({ open, onOpenChange, onCriada }: { open: boolean; onOpenChange: (v: boolean) => void; onCriada: () => void }) {
  const lk = useManutLookups();
  const [nova, setNova] = useState<NovaSS>(NOVA_VAZIA);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (open !== abertoAntes) { setAbertoAntes(open); if (open) { setNova(NOVA_VAZIA); setErro(""); } }

  async function enviar() {
    setSaving(true); setErro("");
    const r = await api("/api/pcm/solicitacoes", "POST", { ...nova, paradoDesde: nova.paradoDesde || null, prioridade: nova.prioridade || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    onOpenChange(false);
    onCriada();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Nova solicitação de manutenção</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Equipamento</Label><AtivoCombobox ativos={lk.ativos} value={nova.ativoId} onChange={(v) => setNova({ ...nova, ativoId: v })} allowNone /></div>
          {!nova.ativoId && <div><Label>Não achou? Diga onde fica</Label><Input value={nova.localTexto} onChange={(e) => setNova({ ...nova, localTexto: e.target.value })} placeholder="Ex.: esteira depois do forno 2" /></div>}
          <div><Label>O que está acontecendo?</Label><Textarea rows={4} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} placeholder="Barulho, vazamento, não liga…" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={nova.ativoParado} onChange={(e) => setNova({ ...nova, ativoParado: e.target.checked })} /> A máquina parou</label>
          {nova.ativoParado && <div><Label>Parada desde <span className="text-muted-foreground font-normal text-xs">(vazio = agora)</span></Label><DataHora value={nova.paradoDesde} onChange={(v) => setNova({ ...nova, paradoDesde: v })} /></div>}
          <div><Label>Urgência</Label><SelectMenu value={nova.prioridade} onChange={(v) => setNova({ ...nova, prioridade: v })} options={[{ value: "", label: "Deixar o PCM decidir" }, ...OPCOES_PRIORIDADE]} /></div>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={enviar} disabled={saving}>{saving ? "Enviando…" : "Enviar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type OSAberta = { id: string; numero: string; descricao: string; ativo: { tag: string; nome: string } | null };
type Triagem = { ativoId: string; tipoId: string; descricao: string; prioridade: string; equipeId: string; responsavelId: string; programadaPara: string; ordemId: string; motivo: string };

/**
 * Triagem da SS pelo PCM. `alvo` aberto = diálogo visível. `onTriada` recebe o
 * id da OS gerada/anexada (null na recusa).
 */
export function TriagemSolicitacaoDialog({ alvo, onFechar, onTriada }: {
  alvo: { ss: SS; acao: AcaoTriagem } | null;
  onFechar: () => void;
  onTriada: (acao: AcaoTriagem, ordemId: string | null) => void;
}) {
  const lk = useManutLookups();
  const [t, setT] = useState<Triagem | null>(null);
  const [abertas, setAbertas] = useState<OSAberta[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [alvoAntes, setAlvoAntes] = useState<typeof alvo>(null);

  // Novo alvo: monta o formulário (sugere o tipo corretivo que conta como falha).
  if (alvo !== alvoAntes) {
    setAlvoAntes(alvo);
    setErro("");
    if (alvo) {
      const { ss, acao } = alvo;
      const corretiva = lk.tipos.find((x) => x.natureza === "CORRETIVA" && x.contaComoFalha);
      setT({ ativoId: ss.ativo?.id ?? "", tipoId: corretiva?.id ?? "", descricao: ss.descricao, prioridade: ss.prioridade ?? (ss.ativoParado ? "ALTA" : ""), equipeId: "", responsavelId: "", programadaPara: "", ordemId: "", motivo: "" });
      setAbertas([]);
      if (acao === "anexar") {
        fetch(`/api/pcm/os?situacao=abertas${ss.ativo ? `&ativoId=${ss.ativo.id}` : ""}`).then((r) => r.json()).then((j) => setAbertas(j.data ?? [])).catch(() => {});
      }
    }
  }

  async function confirmar() {
    if (!alvo || !t) return;
    setSaving(true); setErro("");
    const r = await api<{ ordemId: string | null }>(`/api/pcm/solicitacoes/${alvo.ss.id}`, "POST", { acao: alvo.acao, ...t, programadaPara: t.programadaPara || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    onTriada(alvo.acao, r.data?.ordemId ?? null);
  }

  const ss = alvo?.ss;
  const acao = alvo?.acao;
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{acao === "converter" ? `Gerar OS da ${ss?.numero}` : acao === "anexar" ? `Anexar ${ss?.numero} a uma OS aberta` : `Recusar ${ss?.numero}`}</DialogTitle></DialogHeader>
        {ss && t && <div className="space-y-3">
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <p className="whitespace-pre-wrap text-foreground/90">{ss.descricao}</p>
            <p className="mt-1">{ss.solicitanteNome ?? "—"} · {fmtDataHora(ss.createdAt)}{ss.ativo ? ` · ${ss.ativo.tag} ${ss.ativo.nome}` : ss.localTexto ? ` · ${ss.localTexto}` : ""}</p>
          </div>
          {acao === "converter" && <>
            <div><Label>Ativo</Label><AtivoCombobox ativos={lk.ativos} value={t.ativoId} onChange={(v) => setT({ ...t, ativoId: v })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={t.tipoId} onChange={(v) => setT({ ...t, tipoId: v })} options={lk.tipos.map((x) => ({ value: x.id, label: `${x.sigla} — ${x.nome}` }))} /></div>
              <div><Label>Prioridade</Label><SelectMenu value={t.prioridade} onChange={(v) => setT({ ...t, prioridade: v })} options={[{ value: "", label: "Pela criticidade" }, ...OPCOES_PRIORIDADE]} /></div>
            </div>
            <div><Label>Descrição da OS</Label><Textarea rows={3} value={t.descricao} onChange={(e) => setT({ ...t, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Equipe</Label><SelectMenu value={t.equipeId} onChange={(v) => setT({ ...t, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
              <div><Label>Responsável</Label><ComboboxWithCreate value={t.responsavelId} onChange={(v) => setT({ ...t, responsavelId: v })} allowNone options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="—" /></div>
            </div>
            <div><Label>Programar para</Label><DataHora value={t.programadaPara} onChange={(v) => setT({ ...t, programadaPara: v })} /></div>
            {ss.ativoParado && <p className="text-xs text-danger">A parada informada ({fmtDataHora(ss.paradoDesde)}) entra na OS e marca o ativo como parado.</p>}
          </>}
          {acao === "anexar" && (
            <div><Label>OS em aberto</Label>
              <SelectMenu value={t.ordemId} onChange={(v) => setT({ ...t, ordemId: v })} placeholder={abertas.length ? "Escolha…" : "Nenhuma OS aberta deste ativo"}
                options={abertas.map((o) => ({ value: o.id, label: `${o.numero} · ${o.ativo ? o.ativo.tag : "—"} · ${o.descricao.slice(0, 60)}` }))} />
            </div>
          )}
          {acao === "recusar" && <div><Label>Motivo (o solicitante recebe)</Label><Textarea rows={3} value={t.motivo} onChange={(e) => setT({ ...t, motivo: e.target.value })} /></div>}
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>}
        <DialogFooter><Button variant="outline" onClick={onFechar}>Voltar</Button><Button onClick={confirmar} disabled={saving} variant={acao === "recusar" ? "destructive" : "default"}>{saving ? "Salvando…" : "Confirmar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
