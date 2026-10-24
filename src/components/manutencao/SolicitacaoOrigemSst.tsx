"use client";

// Ponte SST → Manutenção: botão "Abrir solicitação de manutenção" (inspeção não
// conforme / incidente com máquina) e o selo da SS/OS já ligada ao registro.
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SelectMenu from "@/components/shared/SelectMenu";
import { useSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";
import { Wrench } from "lucide-react";
import { AtivoCombobox, OPCOES_PRIORIDADE, StatusOSBadge, api, useManutLookups } from "./comum";

export type SsVinculada = {
  id: string;
  numero: string;
  status: string;
  ordem: { id: string; numero: string; status: string } | null;
};

const STATUS_SS: Record<string, { label: string; cls: string }> = {
  ABERTA: { label: "aguardando triagem", cls: "bg-warning/10 text-warning border-warning/30" },
  CONVERTIDA: { label: "virou OS", cls: "bg-info/10 text-info border-info/30" },
  ANEXADA: { label: "anexada a OS", cls: "bg-info/10 text-info border-info/30" },
  RECUSADA: { label: "recusada", cls: "bg-muted text-muted-foreground border-border" },
};

/** Selos das SS/OS já abertas para o registro (com link quando o usuário tem o módulo Manutenção). */
export function SolicitacoesVinculadas({ lista, className }: { lista: SsVinculada[]; className?: string }) {
  const { canAccess } = useSession();
  const pcm = canAccess("pcm");
  if (lista.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
      {lista.map((s) => {
        const st = STATUS_SS[s.status] ?? { label: s.status, cls: "bg-muted text-foreground border-border" };
        return (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            {pcm ? <Link href="/pcm/solicitacoes" className="font-mono font-medium text-info hover:underline">{s.numero}</Link> : <span className="font-mono font-medium">{s.numero}</span>}
            <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full border", st.cls)}>{st.label}</span>
            {s.ordem && (
              <>
                <span className="text-muted-foreground">→</span>
                {pcm ? <Link href={`/pcm/os/${s.ordem.id}`} className="font-mono font-medium text-info hover:underline">{s.ordem.numero}</Link> : <span className="font-mono font-medium">{s.ordem.numero}</span>}
                <StatusOSBadge s={s.ordem.status} />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

type Props = {
  origem: "SST_INSPECAO" | "SST_INCIDENTE";
  origemId: string;
  /** ativo da Manutenção ligado à máquina do SST (pré-selecionado) */
  ativoId?: string | null;
  descricaoInicial: string;
  /** já existe SS viva para o registro → botão some */
  vinculadas: SsVinculada[];
  onCriada: () => void;
  size?: "sm" | "default";
};

/** Botão + diálogo que abre a SS com origem no SST. */
export function AbrirSolicitacaoSst({ origem, origemId, ativoId, descricaoInicial, vinculadas, onCriada, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  if (vinculadas.some((s) => s.status !== "RECUSADA")) return null;
  return (
    <>
      <Button size={size} variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Wrench className="w-3.5 h-3.5" /> Abrir solicitação de manutenção
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Solicitação de manutenção</DialogTitle></DialogHeader>
          {open && (
            <Formulario
              origem={origem} origemId={origemId} ativoId={ativoId ?? ""} descricaoInicial={descricaoInicial}
              onCancelar={() => setOpen(false)}
              onCriada={() => { setOpen(false); onCriada(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Formulario({ origem, origemId, ativoId: ativoInicial, descricaoInicial, onCancelar, onCriada }: {
  origem: string; origemId: string; ativoId: string; descricaoInicial: string; onCancelar: () => void; onCriada: () => void;
}) {
  const lk = useManutLookups();
  const [f, setF] = useState({ ativoId: ativoInicial, descricao: descricaoInicial, ativoParado: false, prioridade: "" });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!f.descricao.trim()) { setErro("Descreva o problema."); return; }
    setSaving(true); setErro("");
    const r = await api("/api/sst/solicitacao-manutencao", "POST", { origem, origemId, ...f, ativoId: f.ativoId || null, prioridade: f.prioridade || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error || "Erro ao abrir a solicitação."); return; }
    onCriada();
  }

  return (
    <>
      <div className="space-y-3">
        <div>
          <Label>Equipamento</Label>
          <AtivoCombobox ativos={lk.ativos} value={f.ativoId} onChange={(v) => setF({ ...f, ativoId: v })} allowNone placeholder="Sem equipamento cadastrado (vai o local)" />
          {!f.ativoId && <p className="text-[11px] text-muted-foreground mt-1">Sem equipamento, a solicitação leva a máquina/local do registro do SST.</p>}
        </div>
        <div><Label>O que precisa ser feito</Label><Textarea rows={5} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.ativoParado} onChange={(e) => setF({ ...f, ativoParado: e.target.checked })} /> A máquina está parada</label>
        <div><Label>Urgência</Label><SelectMenu value={f.prioridade} onChange={(v) => setF({ ...f, prioridade: v })} options={[{ value: "", label: "Deixar o PCM decidir" }, ...OPCOES_PRIORIDADE]} /></div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>{saving ? "Enviando…" : "Abrir solicitação"}</Button>
      </DialogFooter>
    </>
  );
}
