"use client";

// "Novo a partir de documento" / "Lançar a partir de documento" (docs/processos-prd.md, Fase 1.5 item 2).
// O usuário sobe o PDF (auto de infração, notificação, intimação, ofício) → a IA sugere os campos →
// formulário PRÉ-PREENCHIDO para conferência → só ao confirmar grava processo/andamento/prazo + PDF no GED.
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import { calcularVencimento } from "@/lib/dias-uteis";
import { ESFERAS, PAPEIS_PARTE, TIPOS_ANDAMENTO, TIPOS_PROCESSO, fmtData } from "./comum";
import { useRoteiros } from "./roteiros";

const MAX_BYTES = 4.5 * 1024 * 1024; // limite de corpo da Vercel

type Extracao = {
  tipoSugerido: string | null; tipoDocumento: string | null; titulo: string | null; orgao: string | null; esfera: string | null; numero: string | null;
  dataCiencia: string | null; valor: number | null; assunto: string | null; partes: { papel: string; nome: string; documento: string | null }[];
  prazo: { descricao: string; dias: number; diasUteis: boolean; trecho: string | null } | null; resumo: string | null;
};
type Form = {
  titulo: string; tipo: string; orgao: string; esfera: string; numero: string; valorCausa: string; assunto: string; roteiroId: string;
  dataCiencia: string; andTipo: string; andDescricao: string; docTitulo: string;
  prazoDesc: string; prazoDias: string; diasUteis: boolean; suspensao: boolean; fundamento: string; avisoDias: string;
  partes: { papel: string; nome: string; documento: string }[];
};
const hojeIso = () => new Date().toISOString().slice(0, 10);
const isoValido = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");

function formDe(x: Extracao | null, tipoProcesso?: string): Form {
  const tipo = tipoProcesso ?? (x?.tipoSugerido && TIPOS_PROCESSO[x.tipoSugerido] ? x.tipoSugerido : "ADMINISTRATIVO");
  return {
    titulo: x?.titulo ?? "", tipo, orgao: x?.orgao ?? "", esfera: x?.esfera && ESFERAS[x.esfera] ? x.esfera : "", numero: x?.numero ?? "",
    valorCausa: x?.valor != null ? String(x.valor) : "", assunto: x?.assunto ?? "", roteiroId: "",
    dataCiencia: isoValido(x?.dataCiencia) || hojeIso(), andTipo: x?.prazo ? "EXIGENCIA" : "MOVIMENTACAO",
    andDescricao: [x?.tipoDocumento ? `Recebido: ${x.tipoDocumento}${x.numero ? ` nº ${x.numero}` : ""}` : "", x?.resumo ?? ""].filter(Boolean).join(" — "),
    docTitulo: x?.titulo ?? "",
    prazoDesc: x?.prazo?.descricao ?? "", prazoDias: x?.prazo ? String(x.prazo.dias) : "", diasUteis: x?.prazo?.diasUteis ?? tipo === "JUDICIAL",
    suspensao: tipo === "JUDICIAL", fundamento: x?.prazo?.trecho ?? "", avisoDias: "5",
    partes: (x?.partes ?? []).map((p) => ({ papel: PAPEIS_PARTE[p.papel] ? p.papel : "OUTRO", nome: p.nome, documento: p.documento ?? "" })),
  };
}

export default function DocumentoProcessoDialog({ processo, onFechar, onConcluido }: {
  processo?: { id: string; codigo: string; tipo: string };
  onFechar: () => void;
  onConcluido: (id: string, aviso?: string | null) => void;
}) {
  const novo = !processo;
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [fase, setFase] = useState<"arquivo" | "lendo" | "conferir">("arquivo");
  const [f, setF] = useState<Form>(formDe(null, processo?.tipo));
  const [aviso, setAviso] = useState(""); const [erro, setErro] = useState(""); const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const roteiros = useRoteiros(novo ? f.tipo : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { if (novo) set("roteiroId", ""); }, [f.tipo, novo]);

  function escolher(file: File | undefined) {
    setErro("");
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setErro("Escolha um arquivo PDF."); return; }
    if (file.size > MAX_BYTES) { setErro(`O arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB; o limite é 4,5 MB. Comprima o PDF ou envie só as páginas principais.`); return; }
    setArquivo(file);
  }
  async function ler() {
    if (!arquivo) return;
    setFase("lendo"); setErro(""); setAviso("");
    const fd = new FormData(); fd.append("file", arquivo);
    const res = await fetch("/api/processos/ler-documento", { method: "POST", body: fd }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setAviso(j?.error || "Não foi possível ler o documento. Preencha os campos conferindo o PDF."); setF(formDe(null, processo?.tipo)); setFase("conferir"); return; }
    setF(formDe(j.data ?? null, processo?.tipo));
    if (j.aviso) setAviso(j.aviso);
    setFase("conferir");
  }

  const judicial = (processo?.tipo ?? f.tipo) === "JUDICIAL";
  const vencePrevisto = useMemo(() => {
    const n = Number(f.prazoDias);
    if (!f.prazoDesc.trim() || f.prazoDias === "" || !Number.isFinite(n) || !f.dataCiencia) return null;
    return calcularVencimento(f.dataCiencia, n, { uteis: f.diasUteis, suspensaoForense: judicial && f.suspensao, judicial });
  }, [f.prazoDesc, f.prazoDias, f.dataCiencia, f.diasUteis, f.suspensao, judicial]);

  async function confirmar() {
    if (!arquivo) return;
    if (novo && (!f.titulo.trim() || !f.orgao.trim())) { setErro("Informe título e órgão."); return; }
    if (!f.andDescricao.trim()) { setErro("Descreva o que o documento traz."); return; }
    setSalvando(true); setErro("");
    const dados = {
      ...(processo ? { processoId: processo.id } : {
        processo: { titulo: f.titulo, tipo: f.tipo, orgao: f.orgao, esfera: f.esfera, numero: f.numero, valorCausa: f.valorCausa, assunto: f.assunto, abertoEm: f.dataCiencia },
        partes: f.partes, roteiroId: f.roteiroId || null,
      }),
      dataCiencia: f.dataCiencia,
      andamento: { data: f.dataCiencia, tipo: f.andTipo, descricao: f.andDescricao },
      prazo: f.prazoDesc.trim() && f.prazoDias !== "" ? { descricao: f.prazoDesc, prazoDias: f.prazoDias, diasUteis: f.diasUteis, suspensaoForense: judicial && f.suspensao, fundamento: f.fundamento, avisoDias: f.avisoDias, inicioContagem: f.dataCiencia } : null,
      documento: { titulo: f.docTitulo || f.titulo, numero: f.numero || null },
    };
    const fd = new FormData(); fd.append("file", arquivo); fd.append("dados", JSON.stringify(dados));
    const res = await fetch("/api/processos/a-partir-de-documento", { method: "POST", body: fd }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setSalvando(false);
    if (!res?.ok) { setErro(j?.error || "Erro ao gravar."); return; }
    onConcluido(j.data.id, j.aviso);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{novo ? "Novo processo a partir de documento" : `Lançar a partir de documento — ${processo!.codigo}`}</DialogTitle></DialogHeader>

        {fase === "arquivo" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Envie o PDF do auto de infração, notificação, intimação ou ofício. A IA sugere os campos e você confere antes de gravar — nada é salvo sem a sua confirmação.</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 hover:bg-muted/40"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); escolher(e.dataTransfer.files?.[0]); }}>
              <FileUp className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm">{arquivo ? arquivo.name : "Clique ou arraste o PDF aqui"}</span>
              <span className="text-xs text-muted-foreground">PDF até 4,5 MB</span>
            </button>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
        )}

        {fase === "lendo" && <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /> Lendo o documento… (pode levar até 1 minuto)</div>}

        {fase === "conferir" && (
          <div className="space-y-4">
            {aviso ? <p className="text-sm rounded-lg border border-warning/40 bg-warning/5 text-warning px-3 py-2">{aviso}</p>
              : <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Campos sugeridos pela IA a partir de {arquivo?.name}. Confira com o documento antes de confirmar.</p>}

            {novo && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Processo</h3>
                <div><Label>Título *</Label><Input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><Label>Tipo</Label><SelectMenu value={f.tipo} onChange={(v) => setF((x) => ({ ...x, tipo: v, diasUteis: v === "JUDICIAL" ? true : x.diasUteis, suspensao: v === "JUDICIAL" }))} options={Object.entries(TIPOS_PROCESSO).map(([value, label]) => ({ value, label }))} /></div>
                  <div className="sm:col-span-2"><Label>Órgão / vara *</Label><Input value={f.orgao} onChange={(e) => set("orgao", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><Label>Esfera</Label><SelectMenu value={f.esfera} onChange={(v) => set("esfera", v)} options={[{ value: "", label: "—" }, ...Object.entries(ESFERAS).map(([value, label]) => ({ value, label }))]} /></div>
                  <div><Label>Número do processo/auto</Label><Input value={f.numero} onChange={(e) => set("numero", e.target.value)} /></div>
                  <div><Label>Valor em discussão (R$)</Label><Input inputMode="decimal" value={f.valorCausa} onChange={(e) => set("valorCausa", e.target.value)} /></div>
                </div>
                <div><Label>Assunto</Label><Textarea rows={2} value={f.assunto} onChange={(e) => set("assunto", e.target.value)} /></div>
                {roteiros.length > 0 && (
                  <div><Label>Aplicar roteiro (tarefas padrão)</Label><SelectMenu value={f.roteiroId} onChange={(v) => set("roteiroId", v)} options={[{ value: "", label: "Não aplicar" }, ...roteiros.map((r) => ({ value: r.id, label: `${r.nome} (${r.etapas.length} etapas)` }))]} /></div>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><Label>Partes</Label>
                    <button type="button" className="text-xs text-info hover:underline inline-flex items-center gap-1" onClick={() => set("partes", [...f.partes, { papel: "ORGAO", nome: "", documento: "" }])}><Plus className="w-3 h-3" /> parte</button></div>
                  {f.partes.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-40"><SelectMenu value={p.papel} onChange={(v) => set("partes", f.partes.map((x, k) => (k === i ? { ...x, papel: v } : x)))} options={Object.entries(PAPEIS_PARTE).map(([value, label]) => ({ value, label }))} /></div>
                      <Input className="flex-1" value={p.nome} onChange={(e) => set("partes", f.partes.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} />
                      <Input className="w-40" value={p.documento} placeholder="CPF/CNPJ/OAB" onChange={(e) => set("partes", f.partes.map((x, k) => (k === i ? { ...x, documento: e.target.value } : x)))} />
                      <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => set("partes", f.partes.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Andamento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label>Data da ciência / recebimento</Label><DatePicker value={f.dataCiencia} onChange={(v) => set("dataCiencia", v ?? "")} /></div>
                <div className="sm:col-span-2"><Label>Tipo</Label><SelectMenu value={f.andTipo} onChange={(v) => set("andTipo", v)} options={Object.entries(TIPOS_ANDAMENTO).map(([value, label]) => ({ value, label }))} /></div>
              </div>
              <div><Label>O que o documento traz</Label><Textarea rows={3} value={f.andDescricao} onChange={(e) => set("andDescricao", e.target.value)} /></div>
              <div><Label>Título do documento no GED</Label><Input value={f.docTitulo} onChange={(e) => set("docTitulo", e.target.value)} placeholder={f.titulo || arquivo?.name} /></div>
            </section>

            <section className={`rounded-lg border p-3 space-y-2 ${f.prazoDesc ? "border-warning/40 bg-warning/5" : "border-border"}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prazo de defesa / manifestação</div>
              <Input value={f.prazoDesc} onChange={(e) => set("prazoDesc", e.target.value)} placeholder="Ex.: apresentar impugnação ao auto" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <div><Label className="text-xs">Dias</Label><Input inputMode="numeric" value={f.prazoDias} onChange={(e) => set("prazoDias", e.target.value.replace(/\D/g, ""))} /></div>
                <div><Label className="text-xs">Contagem</Label><SelectMenu value={f.diasUteis ? "U" : "C"} onChange={(v) => set("diasUteis", v === "U")} options={[{ value: "U", label: "Dias úteis" }, { value: "C", label: "Dias corridos" }]} /></div>
                <div><Label className="text-xs">Avisar (dias antes)</Label><Input inputMode="numeric" value={f.avisoDias} onChange={(e) => set("avisoDias", e.target.value)} /></div>
                <div className="text-xs pb-2">{vencePrevisto ? <>Vence em <b>{fmtData(vencePrevisto.toISOString())}</b></> : <span className="text-muted-foreground">sem prazo</span>}</div>
              </div>
              {judicial && <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="rounded" checked={f.suspensao} onChange={(e) => set("suspensao", e.target.checked)} /> Suspender de 20/12 a 20/01 (recesso forense, CPC art. 220)</label>}
              <div><Label className="text-xs">Trecho do documento que fixa o prazo</Label><Textarea rows={2} value={f.fundamento} onChange={(e) => set("fundamento", e.target.value)} /></div>
              <p className="text-[11px] text-muted-foreground">Conta a partir do dia seguinte à ciência; feriados nacionais, do Amapá e de Macapá não contam em dias úteis; vencimento em dia não útil passa para o próximo útil.</p>
            </section>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          {fase === "arquivo" && <Button onClick={ler} disabled={!arquivo}>Ler documento</Button>}
          {fase === "conferir" && <Button onClick={confirmar} disabled={salvando}>{salvando ? "Gravando…" : novo ? "Criar processo" : "Lançar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
