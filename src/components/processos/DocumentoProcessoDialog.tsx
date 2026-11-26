"use client";

// "Novo a partir de documento" / "Lançar a partir de documento" (docs/processos-prd.md, Fase 1.5 item 2).
// O usuário sobe o PDF (auto de infração, notificação, intimação, ofício) → a IA sugere os campos →
// formulário PRÉ-PREENCHIDO para conferência → só ao confirmar grava processo/andamento/prazo + PDF no GED.
// §8.3: se o documento traz guia/multa a pagar, a conferência mostra o PAGAMENTO (valor, vencimento,
// desconto antecipado, linha digitável) e — para quem tem o Financeiro — "Criar conta a pagar": ao
// confirmar, cria o prazo de pagamento, o título (POST /api/financeiro/titulos, a mesma regra do
// Contas a Pagar), liga um ao outro e anexa o PDF ao título. Nada é criado sem confirmação.
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
import { centroExigidoPelaNatureza } from "@/lib/natureza-centro";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import BeneficiarioCombobox, { type BenTipo } from "@/components/financeiro/BeneficiarioCombobox";
import { fmtCampoBR } from "@/components/financeiro/PagamentoTituloForm";
import { parseValorBR } from "@/components/pedidos-venda/PagamentosInput";
import { ESFERAS, PAPEIS_PARTE, TIPOS_ANDAMENTO, TIPOS_PROCESSO, fmtData } from "./comum";
import { useRoteiros } from "./roteiros";

const MAX_BYTES = 4.5 * 1024 * 1024; // limite de corpo da Vercel

type Extracao = {
  tipoSugerido: string | null; tipoDocumento: string | null; titulo: string | null; orgao: string | null; esfera: string | null; numero: string | null;
  dataCiencia: string | null; valor: number | null; assunto: string | null; partes: { papel: string; nome: string; documento: string | null }[];
  prazo: { descricao: string; dias: number; diasUteis: boolean; trecho: string | null } | null; resumo: string | null;
  pagamento?: { descricao: string | null; valor: number | null; vencimento: string | null; valorComDesconto: number | null; descontoPercentual: number | null; descontoAte: string | null; linhaDigitavel: string | null; trecho: string | null } | null;
};
type NatOpt = NaturezaOpt & { sistemaChave?: string | null; afetaResultado?: boolean; cif?: boolean };
type Form = {
  titulo: string; tipo: string; orgao: string; esfera: string; numero: string; valorCausa: string; assunto: string; roteiroId: string;
  dataCiencia: string; andTipo: string; andDescricao: string; docTitulo: string;
  prazoDesc: string; prazoDias: string; diasUteis: boolean; suspensao: boolean; fundamento: string; avisoDias: string;
  partes: { papel: string; nome: string; documento: string }[];
  // Pagamento (§8.3)
  pagDesc: string; pagValor: string; pagVenc: string; pagDescontoAte: string; pagValorDesc: string; pagPct: string; pagLinha: string; pagTrecho: string;
  criarCp: boolean;
};
const brl = (n: number | null | undefined) => (n == null ? "" : fmtCampoBR(String(n).replace(".", ",")));
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
    pagDesc: x?.pagamento?.descricao ?? (x?.pagamento ? x?.tipoDocumento ?? "Pagamento" : ""), pagValor: brl(x?.pagamento?.valor), pagVenc: isoValido(x?.pagamento?.vencimento),
    pagDescontoAte: isoValido(x?.pagamento?.descontoAte), pagValorDesc: brl(x?.pagamento?.valorComDesconto), pagPct: x?.pagamento?.descontoPercentual != null ? String(x.pagamento.descontoPercentual).replace(".", ",") : "",
    pagLinha: x?.pagamento?.linhaDigitavel ?? "", pagTrecho: x?.pagamento?.trecho ?? "",
    criarCp: false,
  };
}

/** Natureza sugerida para a guia/multa: multa → travada "multa-paga"; taxa/guia/custas → "Impostos e taxas". */
function sugerirNatureza(texto: string, nats: NatOpt[]): string {
  const t = texto.toLowerCase();
  if (/multa|infra[cç][aã]o|auto de/.test(t)) {
    const m = nats.find((n) => n.sistemaChave === "multa-paga") ?? nats.find((n) => /multa/i.test(n.nome));
    if (m) return m.id;
  }
  if (/taxa|dae|darf|gru|guia|custa|emolumento|imposto|tribut|licen/.test(t)) {
    const m = nats.find((n) => /impostos e taxas|taxas/i.test(n.nome)) ?? nats.find((n) => /imposto|tribut/i.test(n.nome));
    if (m) return m.id;
  }
  return "";
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
  // Financeiro (§8.3): só quem tem o módulo vê "Criar conta a pagar".
  const [podeFin, setPodeFin] = useState(false);
  const [nats, setNats] = useState<NatOpt[]>([]);
  const [natId, setNatId] = useState("");
  const [ben, setBen] = useState<{ tipo: BenTipo | null; id: string }>({ tipo: null, id: "" });
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string; doc: string | null }[]>([]);
  const [centros, setCentros] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [centroId, setCentroId] = useState("");
  useEffect(() => {
    if (!podeFin) return;
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json()).then((j) => setNats(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/suprimentos/fornecedores?ativo=1").then((r) => r.json()).then((j) => {
      const l = (Array.isArray(j) ? j : (j.data ?? [])) as { id: string; razaoSocial?: string; nome?: string; cpfCnpj?: string | null }[];
      setFornecedores(l.map((o) => ({ id: o.id, nome: o.razaoSocial ?? o.nome ?? "", doc: o.cpfCnpj ?? null })));
    }).catch(() => {});
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json()).then((j) => setCentros(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, [podeFin]);
  // Natureza sugerida quando a lista chega (escolha continua editável).
  useEffect(() => {
    if (!nats.length || natId || !f.pagDesc) return;
    setNatId(sugerirNatureza(`${f.pagDesc} ${f.andDescricao}`, nats));
  }, [nats, natId, f.pagDesc, f.andDescricao]);
  const natSel = nats.find((n) => n.id === natId);
  const exigeCentro = centroExigidoPelaNatureza(natSel);
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
    setPodeFin(!!j.podeFinanceiro);
    const novoF = formDe(j.data ?? null, processo?.tipo);
    // "Criar conta a pagar" pré-marcado quando o documento traz valor E vencimento do pagamento.
    novoF.criarCp = !!j.podeFinanceiro && parseValorBR(novoF.pagValor) > 0 && !!novoF.pagVenc;
    setF(novoF);
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
    const temPagamento = !!f.pagVenc;
    const valorPag = parseValorBR(f.pagValor);
    if (f.criarCp) {
      if (!(valorPag > 0) || !f.pagVenc) { setErro("Para criar a conta a pagar, informe valor e vencimento do pagamento."); return; }
      if (!natId) { setErro("Escolha a natureza da conta a pagar."); return; }
      if (exigeCentro && !centroId) { setErro("Essa natureza exige centro de custo."); return; }
      if (ben.tipo && !ben.id) { setErro("Selecione o fornecedor ou marque “Sem vínculo”."); return; }
    }
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
      pagamento: temPagamento ? {
        descricao: f.pagDesc || "Pagamento", vencimento: f.pagVenc, avisoDias: f.avisoDias,
        valorPagar: valorPag > 0 ? valorPag : null, valorComDesconto: f.pagValorDesc.trim() ? parseValorBR(f.pagValorDesc) : null,
        descontoPercentual: f.pagPct.trim() ? parseValorBR(f.pagPct) : null, descontoAte: f.pagDescontoAte || null,
      } : null,
    };
    const fd = new FormData(); fd.append("file", arquivo); fd.append("dados", JSON.stringify(dados));
    const res = await fetch("/api/processos/a-partir-de-documento", { method: "POST", body: fd }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setSalvando(false); setErro(j?.error || "Erro ao gravar."); return; }
    const avisos: string[] = j.aviso ? [j.aviso] : [];
    // Conta a pagar (§8.3): mesma rota/regra do Contas a Pagar; liga ao prazo de pagamento e anexa o PDF.
    if (f.criarCp && podeFin) {
      const codigo = j.data.codigo as string;
      const rt = await fetch("/api/financeiro/titulos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "pagar", status: "AGENDAMENTO", beneficiarioTipo: ben.tipo, beneficiarioId: ben.tipo ? ben.id : null,
          descricao: `${f.pagDesc || "Pagamento"} — ${codigo}`, dataVencimento: f.pagVenc, dataEmissao: f.dataCiencia || null, dataCompetencia: f.dataCiencia || null,
          centroCustoId: exigeCentro ? centroId : null, processoId: j.data.id,
          observacoes: f.pagLinha.trim() ? `Linha digitável: ${f.pagLinha.trim()}` : null,
          linhas: [{ naturezaFinanceiraId: natId, valor: valorPag, detalhamento: f.pagDesc || null }],
        }),
      }).catch(() => null);
      const jt = await rt?.json().catch(() => ({}));
      const cpId: string | undefined = jt?.data?.ids?.[0];
      if (!rt?.ok || !cpId) avisos.push(`Processo gravado, mas a conta a pagar não foi criada: ${jt?.error ?? "erro de comunicação"}. Lance pela aba Financeiro.`);
      else {
        if (j.data.prazoPagamentoId) {
          const rl = await fetch(`/api/processos/${j.data.id}/prazos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prazoId: j.data.prazoPagamentoId, acao: "vincular-titulo", contaPagarId: cpId }) }).catch(() => null);
          if (!rl?.ok) avisos.push(`Conta a pagar ${jt.data.numeros[0]} criada, mas não foi ligada ao prazo — ligue em Prazos › editar.`);
        }
        const fd2 = new FormData(); fd2.append("file", arquivo);
        const ra = await fetch(`/api/contas-pagar/${cpId}/anexos`, { method: "POST", body: fd2 }).catch(() => null);
        if (!ra?.ok) avisos.push(`Conta a pagar ${jt.data.numeros[0]} criada, mas o PDF não foi anexado ao título.`);
      }
    }
    setSalvando(false);
    onConcluido(j.data.id, avisos.length ? avisos.join(" ") : null);
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

            <section className={`rounded-lg border p-3 space-y-2 ${f.pagVenc || f.pagValor ? "border-info/40 bg-info/5" : "border-border"}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento (guia, multa, custas)</div>
              <Input value={f.pagDesc} onChange={(e) => set("pagDesc", e.target.value)} placeholder="Ex.: Multa do auto nº 123 / DAE taxa de licença (deixe vazio se não há o que pagar)" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <div><Label className="text-xs">Valor (R$)</Label><Input inputMode="decimal" className="text-right font-mono" value={f.pagValor} onChange={(e) => set("pagValor", e.target.value)} onBlur={(e) => set("pagValor", fmtCampoBR(e.target.value))} /></div>
                <div><Label className="text-xs">Vencimento</Label><DatePicker value={f.pagVenc} onChange={(v) => set("pagVenc", v ?? "")} /></div>
                <div><Label className="text-xs">Desconto até</Label><DatePicker value={f.pagDescontoAte} onChange={(v) => set("pagDescontoAte", v ?? "")} /></div>
                <div><Label className="text-xs">Com desconto (R$)</Label><Input inputMode="decimal" className="text-right font-mono" value={f.pagValorDesc} onChange={(e) => set("pagValorDesc", e.target.value)} onBlur={(e) => set("pagValorDesc", fmtCampoBR(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div><Label className="text-xs">ou desconto (%)</Label><Input inputMode="decimal" className="text-right font-mono" value={f.pagPct} onChange={(e) => set("pagPct", e.target.value)} placeholder="ex.: 30" /></div>
                <div className="sm:col-span-3"><Label className="text-xs">Linha digitável / código de barras</Label><Input className="font-mono text-xs" value={f.pagLinha} onChange={(e) => set("pagLinha", e.target.value)} /></div>
              </div>
              {f.pagTrecho && <p className="text-[11px] text-muted-foreground italic">“{f.pagTrecho}”</p>}
              {(() => { const v = parseValorBR(f.pagValor), c = parseValorBR(f.pagValorDesc); return v > 0 && c > 0 && c < v ? <p className="text-[11px] text-success">Pagando até {f.pagDescontoAte ? fmtData(f.pagDescontoAte) : "a data do desconto"} economiza {(v - c).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.</p> : null; })()}
              {f.pagVenc ? <p className="text-[11px] text-muted-foreground">Vira um prazo de pagamento (com aviso {f.avisoDias || 0} dia(s) antes{f.pagDescontoAte ? " do fim do desconto e" : ""} do vencimento).</p>
                : <p className="text-[11px] text-muted-foreground">Sem vencimento, nenhum prazo de pagamento é criado.</p>}
              {podeFin ? (
                <div className="rounded-md border border-border p-2 space-y-2 bg-card">
                  <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="rounded" checked={f.criarCp} onChange={(e) => set("criarCp", e.target.checked)} /> Criar conta a pagar ligada ao processo e ao prazo</label>
                  {f.criarCp && (<>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><Label className="text-xs">Beneficiário (órgão = sem vínculo)</Label>
                        <BeneficiarioCombobox modo="pagar" tipo={ben.tipo} value={ben.id} onChange={(t, id) => setBen({ tipo: t, id: id ?? "" })} fornecedores={fornecedores} /></div>
                      <div><Label className="text-xs">Natureza</Label><NaturezaCombobox value={natId} onChange={setNatId} naturezas={nats} /></div>
                    </div>
                    {exigeCentro && <div><Label className="text-xs">Centro de custo</Label>
                      <ComboboxWithCreate value={centroId} onChange={setCentroId} options={centros.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))} placeholder="Selecione" /></div>}
                    <p className="text-[11px] text-muted-foreground">O título nasce em aberto (agendado) no Contas a Pagar com o PDF anexado{f.pagLinha.trim() ? " e a linha digitável nas observações" : ""}. Quando for quitado, o prazo de pagamento é cumprido sozinho.</p>
                  </>)}
                </div>
              ) : (f.pagValor || f.pagVenc) ? <p className="text-[11px] text-muted-foreground">A conta a pagar é lançada por quem tem acesso ao Financeiro (aba Financeiro do processo).</p> : null}
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
