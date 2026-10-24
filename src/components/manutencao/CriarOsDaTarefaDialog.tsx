"use client";

// Abre uma OS da Manutenção a partir de uma tarefa do Projetos (reforma,
// melhoria…). Fluxo guiado: poucos campos obrigatórios (ativo + tipo), o resto
// vem pré-preenchido da tarefa e é editável; a lista de materiais previstos
// nasce vazia. O rodapé resume o que vai acontecer antes de confirmar.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wrench, X } from "lucide-react";
import ModalPortal from "@/components/shared/ModalPortal";
import EscClose from "@/components/shared/EscClose";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AtivoCombobox, DataHora, OPCOES_PRIORIDADE, api, fmtData, juntarDataHora, useManutLookups } from "@/components/manutencao/comum";

export type TarefaParaOS = {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  dataInicio: string | null;
  prazo: string | null;
  membros: { id: string }[];
};

type Produto = { id: string; codigo: string; descricao: string; unidade: string | null };
type MaterialLinha = { key: number; itemId: string; quantidade: string };

/** Prioridade da tarefa (Projetos) → prioridade da OS. */
const PRIORIDADE_TAREFA_OS: Record<string, string> = { URGENTE: "EMERGENCIA", ALTA: "ALTA", MEDIA: "MEDIA", BAIXA: "BAIXA" };

/** Data pura da tarefa (meia-noite UTC) → data+hora local em ISO, sem deslocar o dia. */
const dataTarefa = (iso: string | null, hora: string) => (iso ? juntarDataHora(iso.slice(0, 10), hora) : "");

export default function CriarOsDaTarefaDialog({ tarefa, onFechar, onCriada }: {
  tarefa: TarefaParaOS;
  onFechar: () => void;
  /** OS criada: o cartão recarrega e mostra a OS na seção Manutenção. */
  onCriada: (os: { id: string; numero: string }) => void;
}) {
  const lk = useManutLookups();
  const [f, setF] = useState({
    ativoId: "", tipoId: "", prioridade: PRIORIDADE_TAREFA_OS[tarefa.prioridade] ?? "MEDIA",
    descricao: [tarefa.titulo, tarefa.descricao?.trim()].filter(Boolean).join("\n\n"),
    programadaPara: dataTarefa(tarefa.dataInicio, "07:00"), prazo: dataTarefa(tarefa.prazo, "17:00"),
    equipeId: "", responsavelId: "",
  });
  const [materiais, setMateriais] = useState<MaterialLinha[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/itens?limit=3000").then((r) => r.json()).then((j) => {
      setProdutos((j.data ?? []).map((x: { id: string; codigo: string; descricao: string; unidade?: { sigla: string } | null }) => ({ id: x.id, codigo: x.codigo, descricao: x.descricao, unidade: x.unidade?.sigla ?? null })));
    }).catch(() => {});
  }, []);

  // Sugestões assim que os lookups chegam: tipo "Melhoria" (ADP) e o responsável
  // = colaborador ligado a um membro da tarefa (Colaborador.usuarioId).
  useEffect(() => {
    if (!lk.tipos.length) return;
    setF((atual) => {
      if (atual.tipoId || atual.responsavelId) return atual;
      const melhoria = lk.tipos.find((t) => t.sigla.toUpperCase() === "ADP") ?? lk.tipos.find((t) => t.natureza === "MELHORIA") ?? lk.tipos.find((t) => /melhoria/i.test(t.nome));
      const membros = new Set(tarefa.membros.map((m) => m.id));
      const colab = lk.colaboradores.find((c) => c.usuarioId && membros.has(c.usuarioId));
      return { ...atual, tipoId: melhoria?.id ?? "", responsavelId: colab?.id ?? "" };
    });
  }, [lk.tipos, lk.colaboradores, tarefa.membros]);

  const ativo = useMemo(() => lk.ativos.find((a) => a.id === f.ativoId), [lk.ativos, f.ativoId]);
  const tipo = useMemo(() => lk.tipos.find((t) => t.id === f.tipoId), [lk.tipos, f.tipoId]);
  const materiaisValidos = materiais.filter((m) => m.itemId && Number(m.quantidade.replace(",", ".")) > 0);
  const materiaisIncompletos = materiais.length !== materiaisValidos.length;
  const pronto = !!f.ativoId && !!f.tipoId && !!f.descricao.trim() && !materiaisIncompletos;

  function addMaterial() { setMateriais((m) => [...m, { key: Date.now() + m.length, itemId: "", quantidade: "1" }]); }
  function setMaterial(key: number, patch: Partial<MaterialLinha>) { setMateriais((m) => m.map((x) => (x.key === key ? { ...x, ...patch } : x))); }
  function rmMaterial(key: number) { setMateriais((m) => m.filter((x) => x.key !== key)); }

  async function confirmar() {
    if (!pronto || salvando) return;
    setSalvando(true); setErro("");
    const r = await api<{ id: string; numero: string }>(`/api/projetos/tarefas/${tarefa.id}/ordem-servico`, "POST", {
      ...f, programadaPara: f.programadaPara || null, prazo: f.prazo || null,
      equipeId: f.equipeId || null, responsavelId: f.responsavelId || null,
      materiais: materiaisValidos.map((m) => ({ itemId: m.itemId, quantidade: m.quantidade })),
    });
    setSalvando(false);
    if (!r.ok) { setErro(r.error!); return; }
    onCriada(r.data!);
  }

  // Resumo do que vai acontecer (rodapé).
  const resumo = !ativo
    ? "Escolha o ativo para ver o resumo."
    : `Vai criar uma OS${tipo ? ` (${tipo.nome})` : ""} para ${ativo.tag} ${ativo.nome}` +
      (f.programadaPara ? `, programada ${fmtData(f.programadaPara)}` : "") +
      (f.prazo ? `, prazo ${fmtData(f.prazo)}` : "") +
      (materiaisValidos.length ? `, com ${materiaisValidos.length} ${materiaisValidos.length === 1 ? "material previsto" : "materiais previstos"}` : ", sem materiais previstos") +
      ". A tarefa fica ligada à OS.";

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[9500] flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      >
        <EscClose onClose={onFechar} />
        <div className="bg-card rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[92vh]">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Wrench className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">Criar ordem de serviço</h2>
                <p className="text-xs text-muted-foreground truncate">a partir da tarefa “{tarefa.titulo}”</p>
              </div>
            </div>
            <button onClick={onFechar} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-5 h-5" /></button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            <div>
              <Label>Ativo <span className="text-danger">*</span></Label>
              <AtivoCombobox ativos={lk.ativos} value={f.ativoId} onChange={(v) => setF({ ...f, ativoId: v })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Tipo <span className="text-danger">*</span></Label><SelectMenu value={f.tipoId} onChange={(v) => setF({ ...f, tipoId: v })} placeholder="Escolha…" options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
              <div><Label>Prioridade</Label><SelectMenu value={f.prioridade} onChange={(v) => setF({ ...f, prioridade: v })} options={OPCOES_PRIORIDADE} /></div>
            </div>
            <div>
              <Label>Descrição do serviço <span className="text-danger">*</span></Label>
              <Textarea rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Programada para</Label><DataHora value={f.programadaPara} onChange={(v) => setF({ ...f, programadaPara: v })} /></div>
              <div><Label>Prazo</Label><DataHora value={f.prazo} onChange={(v) => setF({ ...f, prazo: v })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Equipe</Label><SelectMenu value={f.equipeId} onChange={(v) => setF({ ...f, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
              <div><Label>Responsável</Label><ComboboxWithCreate value={f.responsavelId} onChange={(v) => setF({ ...f, responsavelId: v })} allowNone options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} placeholder="—" /></div>
            </div>

            {/* Materiais necessários */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Materiais necessários</p>
                  <p className="text-[11px] text-muted-foreground">Previstos na OS — a saída do almoxarifado continua pela requisição vinculada.</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={addMaterial}><Plus className="w-3.5 h-3.5" /> adicionar</Button>
              </div>
              {materiais.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum material previsto.</p>
              ) : (
                <div className="space-y-1.5">
                  {materiais.map((m) => {
                    const p = produtos.find((x) => x.id === m.itemId);
                    return (
                      <div key={m.key} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <ComboboxWithCreate value={m.itemId} onChange={(v) => setMaterial(m.key, { itemId: v })} options={produtos.map((x) => ({ value: x.id, label: `${x.codigo} — ${x.descricao}` }))} placeholder={produtos.length ? "Busque o produto…" : "Carregando produtos…"} menuMinWidth={420} />
                        </div>
                        <Input inputMode="decimal" value={m.quantidade} onChange={(e) => setMaterial(m.key, { quantidade: e.target.value })} className="w-20 text-right" aria-label="Quantidade" />
                        <span className="text-xs text-muted-foreground w-8 truncate">{p?.unidade ?? ""}</span>
                        <button onClick={() => rmMaterial(m.key)} className="text-muted-foreground hover:text-danger" title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              {materiaisIncompletos && <p className="text-[11px] text-warning">Escolha o produto e a quantidade de cada linha (ou remova a linha).</p>}
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>

          <div className="px-6 py-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-xs text-muted-foreground flex-1">{resumo}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
              <Button onClick={confirmar} disabled={!pronto || salvando} className="gap-1">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />} Criar OS
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
