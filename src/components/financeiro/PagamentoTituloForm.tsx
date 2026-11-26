"use client";

// Formulário de PAGAMENTO de um título a pagar (baixa) — modo rápido para o dia
// a dia do financeiro. Não depende do Dialog: o Contas a Pagar o embute no
// modal "Registrar Pagamento", e ele pode ir para outro painel sem mudança.
//
// Payload = o mesmo do PATCH /api/contas-pagar/[id] (baixarTitulo). Semântica
// do servidor (src/lib/baixa-titulo.ts):
//   • cada linha de `pagamentos` vira um lançamento de caixa; juros+multa
//     entram SOMADOS na 1ª linha → caixa = Σ linhas + juros + multa;
//   • quitação do título = Σ linhas + taxa retida (valorTaxa) — a taxa não sai
//     do caixa (pagou MENOS e quitou).
// Daí o modo rápido: o usuário digita o que SAIU do caixa (Valor pago) e a tela
// deriva o resto — acima do saldo vira juros/multa (a 1ª linha cai para o
// saldo, o encargo volta no lançamento); abaixo, pagamento parcial ou DESCONTO
// (valorTaxa = diferença com a natureza travada "descontos-recebidos" → o
// contábil credita Descontos Obtidos).
import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Plus, Trash2, X, ChevronDown, ChevronRight, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import PagamentosInput, {
  type FormaOpt, type ContaOpt, type LinhaPagamento,
  novaLinhaPagamento, parseValorBR, contaPadraoParaForma, pagamentoContaInvalida,
  contaCaixaPadrao, contaEhCaixa, temContaBanco, formaEhDinheiro,
} from "@/components/pedidos-venda/PagamentosInput";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn, formatBRL } from "@/lib/utils";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "100" → "100,00" ao sair de um campo de valor (formato BR).
export const fmtCampoBR = (s: string) => (s.trim() === "" ? "" : fmtBR(parseValorBR(s)));

// ── Naturezas da taxa/tarifa retida ─────────────────────────────────────────
// Grupo 6 do plano hierárquico (6.01 Juros … 6.06 IOF), em ordem de código.
// Empresa sem plano com código cai nas travadas (tarifa bancária, taxa de cartão).
export type TaxaNaturezaOpt = { id: string; nome: string; codigo?: string | null; sistema?: boolean; sistemaChave?: string | null };
const CHAVES_TAXA_PAGAR = ["tarifa-bancaria", "taxa-cartao"] as const;
export function filtrarTaxaNaturezas(arr: TaxaNaturezaOpt[]): TaxaNaturezaOpt[] {
  const grupo6 = arr
    .filter((n) => n.codigo?.startsWith("6."))
    .sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? ""));
  if (grupo6.length > 0) return grupo6;
  return CHAVES_TAXA_PAGAR
    .map((ch) => arr.find((n) => n.sistema === true && n.sistemaChave === ch))
    .filter((n): n is TaxaNaturezaOpt => !!n);
}
// Default da taxa no pagar: 6.02 (tarifa bancária) — por chave travada; senão a 1ª.
export function taxaNaturezaDefault(arr: TaxaNaturezaOpt[]): TaxaNaturezaOpt | undefined {
  return arr.find((n) => n.sistemaChave === "tarifa-bancaria") ?? arr[0];
}
export const rotuloNatureza = (n: { codigo?: string | null; nome: string }) => `${n.codigo ? `${n.codigo} ` : ""}${n.nome}`;

// ── Última forma/conta usada pelo usuário (preferência persistida) ──────────
export type UltimaContaPagar = { forma: string; contaBancariaId: string } | null;
export function useUltimaContaPagar() {
  return usePersistedState<UltimaContaPagar>("financeiro:pagar:ultimaConta", null);
}

/** Forma + conta iniciais: forma prevista do título (exceto permuta) → última
 *  usada pelo usuário → vazio. A conta segue a forma (dinheiro → Caixa;
 *  eletrônica → banco, nunca o Caixa quando há banco). */
export function formaContaInicial(
  prevista: { nome: string; tipo?: string | null } | null | undefined,
  ultima: UltimaContaPagar,
  formas: FormaOpt[],
  contas: ContaOpt[],
): { forma: string; conta: string } {
  const contaValida = (id: string | undefined, forma: string) =>
    !!id && contas.some((c) => c.id === id && c.ativo !== false && !c.compensacao) &&
    // conta lembrada no Caixa só vale para dinheiro (ou se não há banco)
    (formaEhDinheiro(forma, formas) || !temContaBanco(contas) || !contaEhCaixa(id, contas));
  const formaAtiva = (nome: string) => formas.some((f) => f.nome === nome && f.ativo !== false && f.tipo !== "PERMUTA");
  if (prevista && prevista.tipo !== "PERMUTA" && prevista.nome) {
    // Dinheiro → Caixa; eletrônica → o último banco usado (se válido) ou o padrão.
    const conta = !formaEhDinheiro(prevista.nome, formas) && ultima && contaValida(ultima.contaBancariaId, prevista.nome)
      ? ultima.contaBancariaId
      : contaPadraoParaForma(prevista.nome, formas, contas);
    return { forma: prevista.nome, conta };
  }
  if (ultima && formaAtiva(ultima.forma)) {
    return {
      forma: ultima.forma,
      conta: contaValida(ultima.contaBancariaId, ultima.forma) ? ultima.contaBancariaId : contaPadraoParaForma(ultima.forma, formas, contas),
    };
  }
  return { forma: "", conta: contaPadraoParaForma("", formas, contas) };
}

/** Forma + conta numa linha (mesmas regras do PagamentosInput: a conta segue a
 *  forma; eletrônica no Caixa fica vermelha). Permuta nunca aparece. */
export function FormaContaPicker({
  forma, conta, onChange, formas, contas, menuMinWidth = 320, destacarInvalida = true,
}: {
  forma: string; conta: string;
  onChange: (v: { forma: string; conta: string }) => void;
  formas: FormaOpt[]; contas: ContaOpt[];
  menuMinWidth?: number; destacarInvalida?: boolean;
}) {
  const formasOpts = formas.filter((f) => f.ativo !== false && f.tipo !== "PERMUTA");
  const contasOpts = contas.filter((c) => c.ativo !== false && !c.compensacao);
  const temCaixa = contasOpts.some((c) => c.tipo === "CAIXA" || c.id === "caixa-geral");
  const invalida = destacarInvalida && temContaBanco(contas) && !formaEhDinheiro(forma, formas) && (!conta || contaEhCaixa(conta, contas));
  function trocarForma(nova: string) {
    let c = conta;
    if (formaEhDinheiro(nova, formas)) c = contaCaixaPadrao(contas);
    else if (contaEhCaixa(conta, contas)) c = temContaBanco(contas) ? "" : conta;
    onChange({ forma: nova, conta: c });
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
      <ComboboxWithCreate
        value={forma}
        onChange={trocarForma}
        placeholder="— Forma —"
        noneLabel="Forma"
        menuMinWidth={menuMinWidth}
        triggerClassName="h-9 rounded-lg w-full min-w-0"
        options={[
          ...formasOpts.map((f) => ({ value: f.nome, label: f.nome })),
          ...(forma && !formasOpts.some((f) => f.nome === forma) ? [{ value: forma, label: forma }] : []),
        ]}
      />
      <ComboboxWithCreate
        value={conta}
        onChange={(v) => onChange({ forma, conta: v })}
        allowNone={false}
        placeholder="Conta de pagamento"
        className="min-w-0"
        menuMinWidth={menuMinWidth}
        triggerClassName={cn("h-9 rounded-lg w-full min-w-0", invalida && "border-red-400 bg-danger/10 text-danger")}
        options={[
          ...(!temCaixa ? [{ value: "caixa-geral", label: "Caixa Geral", group: "Contas da empresa" }] : []),
          ...contasOpts.filter((c) => !c.ehTerceiro).map((c) => ({ value: c.id, label: c.nome, group: "Contas da empresa" })),
          ...contasOpts.filter((c) => c.ehTerceiro).map((c) => ({ value: c.id, label: c.nome, group: "Contas de terceiros" })),
        ]}
      />
    </div>
  );
}

/** Mensagem da trava de roteamento (forma eletrônica saindo do Caixa). */
export function erroContaInvalida(forma: string, conta: string, formas: FormaOpt[], contas: ContaOpt[]): string | null {
  const ruim = pagamentoContaInvalida([novaLinhaPagamento(forma, conta, "1")], formas, contas);
  return ruim ? `Selecione a conta bancária de origem para "${ruim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem sair do Caixa em Dinheiro.` : null;
}

// ── Tipos de entrada ────────────────────────────────────────────────────────
export type TituloPagamento = {
  id: string;
  numero: string;
  valorOriginal: number;
  valorPago: number;
  formaPagamentoPrevista?: { nome: string; tipo?: string | null } | null;
  naturezas?: { naturezaFinanceiraId: string; detalhamento: string | null; valor: number }[];
  naturezaFinanceiraId?: string | null;
  centroCustoId?: string | null;
};
export type CentroOpt = { id: string; codigo: string; nome: string; grupoCentroCusto?: { nome: string } | null };

type RateioLinha = { key: string; naturezaFinanceiraId: string; detalhamento: string; valor: string };

// Limite prático do upload (proxy de blob em produção aceita ~4,5 MB por envio).
const MAX_ANEXO = 4.5 * 1024 * 1024;

export default function PagamentoTituloForm({
  titulo, formas, contas, naturezas, onNaturezaCriada, centros, taxaNaturezas, descontoNatureza,
  onPago, onCancelar,
}: {
  titulo: TituloPagamento;
  formas: FormaOpt[];
  contas: ContaOpt[];
  naturezas: NaturezaOpt[];
  onNaturezaCriada?: (n: NaturezaOpt) => void;
  centros: CentroOpt[];
  /** Naturezas elegíveis para a taxa/tarifa retida (grupo 6 / travadas). */
  taxaNaturezas: TaxaNaturezaOpt[];
  /** Natureza travada "descontos-recebidos" da empresa (null = não semeada). */
  descontoNatureza?: TaxaNaturezaOpt | null;
  onPago: () => void;
  onCancelar: () => void;
}) {
  const valOrig = titulo.valorOriginal;
  const saldo = r2(titulo.valorOriginal - titulo.valorPago);
  const [ultima, setUltima] = useUltimaContaPagar();

  // ── Modo rápido ───────────────────────────────────────────────────────────
  const [dataPag, setDataPag] = useState(() => new Date().toISOString().split("T")[0]);
  const ini = formaContaInicial(titulo.formaPagamentoPrevista, ultima, formas, contas);
  const [forma, setForma] = useState(ini.forma);
  const [conta, setConta] = useState(ini.conta);
  // Formas/contas chegam por fetch no pai: se o form montou antes, completa a
  // sugestão quando elas chegam (sem sobrescrever o que o usuário escolheu).
  const sugeriu = useRef(formas.length > 0 && contas.length > 0);
  useEffect(() => {
    if (sugeriu.current || formas.length === 0 || contas.length === 0) return;
    sugeriu.current = true;
    const s = formaContaInicial(titulo.formaPagamentoPrevista, ultima, formas, contas);
    if (!forma) setForma(s.forma);
    if (!conta) setConta(s.conta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formas, contas]);
  const [valor, setValor] = useState(() => (saldo > 0 ? fmtBR(saldo) : ""));
  const [tipoAcrescimo, setTipoAcrescimo] = useState<"juros" | "multa">("juros");
  const [tipoFalta, setTipoFalta] = useState<"parcial" | "desconto">("parcial");

  // ── Mais opções: taxa retida + dividir em várias formas ───────────────────
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [taxa, setTaxa] = useState("");
  const [dividir, setDividir] = useState(false);
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([]);

  // ── Classificação (rateio por natureza + centro do título) ────────────────
  const [rateio, setRateio] = useState<RateioLinha[]>(() =>
    titulo.naturezas && titulo.naturezas.length
      ? titulo.naturezas.map((n) => ({ key: crypto.randomUUID(), naturezaFinanceiraId: n.naturezaFinanceiraId, detalhamento: n.detalhamento ?? "", valor: fmtBR(n.valor) }))
      : [{ key: crypto.randomUUID(), naturezaFinanceiraId: titulo.naturezaFinanceiraId ?? "", detalhamento: "", valor: valOrig > 0 ? fmtBR(valOrig) : "" }],
  );
  const [centroId, setCentroId] = useState(titulo.centroCustoId ?? "");
  const faltaClassificacaoInicial = !rateio.some((l) => l.naturezaFinanceiraId) || !centroId;
  // Abre sozinha (com aviso) quando falta natureza ou centro.
  const [classAberta, setClassAberta] = useState(faltaClassificacaoInicial);
  const [classAuto] = useState(faltaClassificacaoInicial);

  const [anexo, setAnexo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const vTaxa = Math.max(0, parseValorBR(taxa));
  const caixa = r2(dividir ? linhas.reduce((s, l) => s + parseValorBR(l.valor), 0) : parseValorBR(valor));
  // Quitação = caixa (sem acréscimo) + taxa retida; diferença contra o saldo.
  const diff = r2(caixa + vTaxa - saldo);
  const acrescimo = caixa > 0 && diff > 0.005 ? diff : 0;
  const falta = caixa > 0 && diff < -0.005 ? -diff : 0;
  const vJuros = acrescimo > 0 && tipoAcrescimo === "juros" ? acrescimo : 0;
  const vMulta = acrescimo > 0 && tipoAcrescimo === "multa" ? acrescimo : 0;
  const descontoDisponivel = !!descontoNatureza;
  const vDesconto = falta > 0 && tipoFalta === "desconto" && descontoDisponivel ? falta : 0;
  const encargosTotal = r2(vJuros + vMulta + vTaxa + vDesconto);

  // Encargos POR DENTRO do título: a 1ª linha da classificação ABSORVE a
  // diferença (título − demais linhas − encargos), como antes — a soma continua
  // batendo com o valor do título. Só reage a MUDANÇA dos encargos (não mexe no
  // rateio carregado ao abrir).
  const encargosAnt = useRef(encargosTotal);
  useEffect(() => {
    if (Math.abs(encargosAnt.current - encargosTotal) < 0.005) return;
    encargosAnt.current = encargosTotal;
    setRateio((prev) => {
      if (prev.length === 0) return prev;
      const outras = prev.slice(1).reduce((s, l) => s + parseValorBR(l.valor), 0);
      const alvo = Math.max(0, r2(valOrig - outras - encargosTotal));
      const fmt = fmtBR(alvo);
      if (prev[0].valor === fmt) return prev;
      return prev.map((l, i) => (i === 0 ? { ...l, valor: fmt } : l));
    });
  }, [encargosTotal, valOrig]);

  const centroOptions = useMemo(() => [...centros]
    .sort((a, b) => (a.grupoCentroCusto?.nome ?? "ZZZ").localeCompare(b.grupoCentroCusto?.nome ?? "ZZZ") || a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
    .map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}`, group: c.grupoCentroCusto?.nome ?? "Sem grupo" })), [centros]);

  // Taxa manual: ao digitar, o Valor pago acompanha (saldo − taxa) enquanto o
  // usuário não tiver mexido nele.
  function mudarTaxa(nova: string) {
    if (!dividir) {
      const esperadoAntes = r2(saldo - vTaxa);
      if (Math.abs(parseValorBR(valor) - esperadoAntes) < 0.005) {
        const v = r2(saldo - Math.max(0, parseValorBR(nova)));
        setValor(v > 0 ? fmtBR(v) : "");
      }
    }
    setTaxa(nova);
  }

  function abrirDividir() {
    setLinhas([novaLinhaPagamento(forma, conta, valor)]);
    setDividir(true);
  }
  function juntar() {
    const l0 = linhas[0];
    if (l0) { setForma(l0.forma); setConta(l0.contaBancariaId); }
    setValor(caixa > 0 ? fmtBR(caixa) : "");
    setDividir(false);
  }

  // ── Envio ─────────────────────────────────────────────────────────────────
  async function confirmar() {
    setErro(null);
    const base: LinhaPagamento[] = dividir ? linhas : [novaLinhaPagamento(forma, conta, valor)];
    const validas = base.filter((l) => parseValorBR(l.valor) > 0);
    if (validas.length === 0) { setErro("Informe o valor pago."); return; }
    if (validas.some((l) => !l.forma)) { setErro("Escolha a forma de pagamento."); return; }
    const contaRuim = pagamentoContaInvalida(validas, formas, contas);
    if (contaRuim) {
      setErro(`Selecione a conta bancária de origem para "${contaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem sair do Caixa em Dinheiro.`);
      return;
    }
    if (parseValorBR(taxa) < 0) { setErro("A taxa não pode ser negativa."); return; }
    if (vDesconto > 0 && vTaxa > 0) {
      setErro("Desconto e taxa/tarifa retida não podem ir na mesma baixa — registre a taxa como parte do desconto ou pague em duas baixas.");
      return;
    }
    // Classificação OBRIGATÓRIA: natureza (ao menos uma linha) e centro de custo.
    if (!rateio.some((l) => l.naturezaFinanceiraId)) { setClassAberta(true); setErro("Informe a natureza financeira na Classificação."); return; }
    if (!centroId) { setClassAberta(true); setErro("Informe o centro de custo na Classificação."); return; }
    const rateioValido = rateio.filter((l) => l.naturezaFinanceiraId && parseValorBR(l.valor) > 0);
    if (rateioValido.length > 0) {
      const soma = r2(rateioValido.reduce((s, l) => s + parseValorBR(l.valor), 0));
      const bateSozinha = Math.abs(soma - valOrig) <= 0.05;
      const bateComEncargos = encargosTotal > 0.005 && Math.abs(soma + encargosTotal - valOrig) <= 0.05;
      if (!bateSozinha && !bateComEncargos) {
        setClassAberta(true);
        setErro(`A soma da classificação (${formatBRL(soma + encargosTotal)}, com encargos) deve bater com o valor do título (${formatBRL(valOrig)}).`);
        return;
      }
    }
    if (anexo && anexo.size > MAX_ANEXO) { setErro("Comprovante muito grande (máx. 4,5 MB)."); return; }

    // Linhas do servidor: acréscimo sai da 1ª linha (o servidor devolve juros/
    // multa somados nela) — o caixa sai exatamente o valor digitado.
    const pagamentos = validas.map((l) => ({ forma: l.forma || null, contaBancariaId: l.contaBancariaId || null, valor: parseValorBR(l.valor) }));
    if (acrescimo > 0) {
      if (pagamentos[0].valor - acrescimo < 0.01) {
        setErro("O acréscimo (juros/multa) precisa caber na 1ª forma de pagamento.");
        return;
      }
      pagamentos[0] = { ...pagamentos[0], valor: r2(pagamentos[0].valor - acrescimo) };
    }
    const valorTaxa = r2(vTaxa + vDesconto);
    const taxaNaturezaId = vDesconto > 0
      ? descontoNatureza!.id
      : vTaxa > 0 ? (taxaNaturezaDefault(taxaNaturezas)?.id ?? null) : null;

    setSaving(true);
    const res = await fetch(`/api/contas-pagar/${titulo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagamentos, dataPagamento: dataPag, valorMulta: vMulta, valorJuros: vJuros,
        valorTaxa, taxaNaturezaId,
        naturezas: rateioValido.length
          ? rateioValido.map((l) => ({ naturezaFinanceiraId: l.naturezaFinanceiraId, detalhamento: l.detalhamento.trim() || null, valor: parseValorBR(l.valor) }))
          : undefined,
        // Classificação editada na baixa vai para o TÍTULO.
        centroCustoId: centroId || null,
      }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setSaving(false);
      setErro((res ? (await res.json().catch(() => ({}))).error : null) ?? "Erro ao pagar.");
      return;
    }
    // Lembra a forma/conta usada (pré-preenche o próximo pagamento).
    setUltima({ forma: validas[0].forma, contaBancariaId: validas[0].contaBancariaId });
    // Comprovante (opcional) — sobe depois da baixa ok, na rota de anexos.
    if (anexo) {
      const fd = new FormData();
      fd.append("file", anexo);
      const up = await fetch(`/api/contas-pagar/${titulo.id}/anexos`, { method: "POST", body: fd }).catch(() => null);
      if (!up || !up.ok) {
        const msg = up ? (await up.json().catch(() => ({}))).error : null;
        alert(`Pagamento registrado, mas o comprovante não foi anexado${msg ? `: ${msg}` : ""}. Anexe pelo detalhe do título.`);
      }
    }
    setSaving(false);
    onPago();
  }

  // ── Resumo da classificação ───────────────────────────────────────────────
  const natsSel = rateio.filter((l) => l.naturezaFinanceiraId);
  const rotNat = (id: string) => { const n = naturezas.find((x) => x.id === id); return n ? rotuloNatureza(n) : "Natureza"; };
  const resumoNat = natsSel.length === 0 ? null
    : natsSel.length === 1 ? rotNat(natsSel[0].naturezaFinanceiraId)
    : `${rotNat(natsSel[0].naturezaFinanceiraId)} + ${natsSel.length - 1}`;
  const centroSel = centros.find((c) => c.id === centroId);
  const classOk = natsSel.length > 0 && !!centroId;

  const permuta = titulo.formaPagamentoPrevista?.tipo === "PERMUTA";
  const toggleCls = (on: boolean) => cn(
    "h-7 px-2.5 text-xs font-medium transition-colors",
    on ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted",
  );

  return (
    <div className="space-y-4">
      {permuta && (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-300/50 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
          Título previsto como <b>permuta</b> — quite pelo <b>Encontro de Contas</b> (motivo Permuta),
          que liquida o CP e o CR do parceiro no mesmo lançamento. A baixa abaixo vale para
          pagamento em dinheiro/banco.
        </div>
      )}

      {/* ── Modo rápido: data · forma + conta · valor pago ─────────────── */}
      <div className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_9rem]">
        <div>
          <Label className="text-xs">Data</Label>
          <DatePicker value={dataPag} onChange={(v) => setDataPag(v)} className="mt-1 w-full" />
        </div>
        <div className="min-w-0">
          <Label className="text-xs">Forma e conta</Label>
          <div className="mt-1">
            {dividir ? (
              <div className="h-9 flex items-center px-3 rounded-lg bg-muted text-sm text-muted-foreground">
                {linhas.length} forma{linhas.length !== 1 ? "s" : ""} — abaixo
              </div>
            ) : (
              <FormaContaPicker
                forma={forma} conta={conta}
                onChange={(v) => { setForma(v.forma); setConta(v.conta); }}
                formas={formas} contas={contas}
                destacarInvalida={parseValorBR(valor) > 0}
              />
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs">Valor pago</Label>
          {dividir ? (
            <div className="mt-1 h-9 flex items-center justify-end px-2 rounded-lg bg-muted text-sm font-mono">{fmtBR(caixa)}</div>
          ) : (
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={(e) => setValor(fmtCampoBR(e.target.value))}
              placeholder="0,00"
              className="mt-1 h-9 text-right font-mono"
            />
          )}
        </div>
      </div>

      {/* ── Valor diferente do saldo ──────────────────────────────────── */}
      {acrescimo > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span className="text-warning font-medium">Acréscimo {formatBRL(acrescimo)}</span>
          <span className="text-xs text-muted-foreground">como</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button type="button" className={toggleCls(tipoAcrescimo === "juros")} onClick={() => setTipoAcrescimo("juros")}>Juros</button>
            <button type="button" className={toggleCls(tipoAcrescimo === "multa")} onClick={() => setTipoAcrescimo("multa")}>Multa</button>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">Título {formatBRL(saldo)} + {tipoAcrescimo} {formatBRL(acrescimo)}</span>
        </div>
      )}
      {falta > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm">
          <span className="text-info font-medium">Faltam {formatBRL(falta)}</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button type="button" className={toggleCls(tipoFalta === "parcial")} onClick={() => setTipoFalta("parcial")}>Pagamento parcial</button>
            <button
              type="button"
              className={cn(toggleCls(tipoFalta === "desconto"), !descontoDisponivel && "opacity-40 cursor-not-allowed")}
              disabled={!descontoDisponivel}
              title={descontoDisponivel ? "O título quita; a diferença vira Desconto obtido" : "A natureza travada de Descontos Recebidos não existe nesta empresa"}
              onClick={() => setTipoFalta("desconto")}
            >
              Desconto
            </button>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {tipoFalta === "desconto" && vDesconto > 0
              ? <>Quita o título · desconto obtido {formatBRL(vDesconto)}</>
              : <>Título fica parcial · saldo {formatBRL(falta)}</>}
          </span>
        </div>
      )}

      {/* ── Mais opções (recolhido) ───────────────────────────────────── */}
      <div>
        <button type="button" onClick={() => setMaisOpcoes((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          {maisOpcoes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Mais opções
          {(vTaxa > 0 || dividir) && <span className="ml-1 rounded-full bg-info/15 px-1.5 text-[10px] text-info">em uso</span>}
        </button>
        {maisOpcoes && (
          <div className="mt-2 space-y-3 rounded-lg border border-border px-3 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2 items-end">
              <p className="text-[11px] text-muted-foreground">
                <b>Taxa/tarifa retida</b>: o título quita pelo valor pago + taxa; a taxa não sai do caixa
                {(() => { const d = taxaNaturezaDefault(taxaNaturezas); return d ? <> e vai para <b>{rotuloNatureza(d)}</b></> : null; })()}.
              </p>
              <div>
                <Label className="text-xs">Taxa/tarifa (R$)</Label>
                <Input value={taxa} onChange={(e) => mudarTaxa(e.target.value)} onBlur={(e) => setTaxa(fmtCampoBR(e.target.value))} placeholder="0,00" className="mt-1 h-9 text-right font-mono" />
              </div>
            </div>
            {dividir ? (
              <div className="space-y-1">
                <PagamentosInput
                  linhas={linhas}
                  setLinhas={setLinhas}
                  formas={formas}
                  contas={contas}
                  total={Math.max(0, r2(saldo - vTaxa))}
                  menuMinWidth={340}
                  contaPlaceholder="Conta de pagamento"
                />
                <button type="button" onClick={juntar} className="text-xs text-muted-foreground hover:text-foreground">Voltar para uma forma só</button>
              </div>
            ) : (
              <button type="button" onClick={abrirDividir} className="inline-flex items-center gap-1 text-xs text-info font-medium">
                <Plus className="w-3.5 h-3.5" /> Dividir pagamento
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Classificação: resumo; grade só ao alterar (ou se faltar algo) ── */}
      {!classAberta ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">{resumoNat ?? "Sem natureza"}</span>
            <span className="text-muted-foreground/60"> · </span>
            <span className="text-muted-foreground">{centroSel ? `${centroSel.codigo} - ${centroSel.nome}` : "Sem centro de custo"}</span>
            {classOk && <Check className="inline w-3.5 h-3.5 ml-1.5 text-success" />}
          </span>
          <button type="button" onClick={() => setClassAberta(true)} className="shrink-0 text-xs font-medium text-info hover:underline">alterar</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classificação</Label>
            <button type="button" onClick={() => setRateio((p) => [...p, { key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" }])} className="inline-flex items-center gap-1 text-xs text-info font-medium">
              <Plus className="w-3.5 h-3.5" /> Adicionar natureza
            </button>
          </div>
          {classAuto && !classOk && (
            <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Este título está sem {natsSel.length === 0 ? "natureza" : "centro de custo"} — complete a classificação para pagar.
            </p>
          )}
          <div className="grid grid-cols-[1.2fr_1fr_1fr_6.5rem_auto] gap-2 text-[11px] text-muted-foreground">
            <span>Natureza <span className="text-red-500">*</span></span><span>Centro de custo <span className="text-red-500">*</span></span><span>Detalhamento</span><span className="text-right">Valor</span><span className="w-7" />
          </div>
          {rateio.map((l, i) => (
            <div key={l.key} className="grid grid-cols-[1.2fr_1fr_1fr_6.5rem_auto] gap-2 items-center">
              <NaturezaCombobox
                value={l.naturezaFinanceiraId}
                onChange={(id) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, naturezaFinanceiraId: id } : x)))}
                naturezas={naturezas}
                defaultTipo="SAIDA"
                allowCreate
                onCreated={onNaturezaCriada}
              />
              {i === 0 ? (
                <ComboboxWithCreate
                  value={centroId}
                  onChange={setCentroId}
                  options={centroOptions}
                  placeholder="Centro de custo…"
                  noneLabel="Sem centro de custo"
                  triggerClassName="h-9"
                  menuMinWidth={340}
                />
              ) : (
                <span className="text-xs text-muted-foreground/40 px-2" title="O centro de custo é do título inteiro (definido na 1ª linha)">〃</span>
              )}
              <Input value={l.detalhamento} onChange={(e) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, detalhamento: e.target.value } : x)))} placeholder="Detalhamento (opcional)" className="h-9 min-w-0" />
              <Input value={l.valor} onChange={(e) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, valor: e.target.value } : x)))} onBlur={(e) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, valor: fmtCampoBR(e.target.value) } : x)))} placeholder="0,00" className="h-9 text-right font-mono min-w-0" />
              <button type="button" onClick={() => setRateio((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={rateio.length <= 1} className="p-1.5 rounded text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 disabled:opacity-30">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {/* ENCARGOS refletidos automaticamente (somente leitura) — espelho do
              que a contabilização grava nas naturezas travadas. */}
          {(() => {
            const buscaChave = (ch: string) => taxaNaturezas.find((n) => n.sistemaChave === ch);
            const encargos = [
              { rot: "Juros da baixa", v: vJuros, nat: buscaChave("juros-pagos") },
              { rot: "Multa da baixa", v: vMulta, nat: buscaChave("multa-paga") },
              { rot: "Taxa/tarifa retida", v: vTaxa, nat: taxaNaturezaDefault(taxaNaturezas) },
              { rot: "Desconto obtido", v: vDesconto, nat: descontoNatureza ?? undefined },
            ].filter((e) => e.v > 0);
            return encargos.map((e) => (
              <div key={e.rot} className="grid grid-cols-[1.2fr_1fr_1fr_6.5rem_auto] gap-2 items-center opacity-80">
                <span className="h-9 flex items-center px-2 rounded-md bg-muted text-sm truncate" title="Classificação automática do encargo">
                  {e.nat ? rotuloNatureza(e.nat) : "Natureza travada do sistema"}
                </span>
                <span className="text-xs text-muted-foreground/40 px-2">〃</span>
                <span className="h-9 flex items-center px-2 rounded-md bg-muted text-sm text-muted-foreground">{e.rot} (automático)</span>
                <span className="h-9 flex items-center justify-end px-2 rounded-md bg-muted text-sm font-mono">{fmtBR(e.v)}</span>
                <span className="w-7" />
              </div>
            ));
          })()}
          {(() => {
            const somaEdit = rateio.reduce((s, l) => s + parseValorBR(l.valor), 0);
            const soma = r2(somaEdit + encargosTotal);
            const bate = Math.abs(soma - valOrig) <= 0.05;
            return (
              <div className={cn("flex items-center justify-between rounded-lg px-3 py-2", bate ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                <span className="text-xs font-semibold uppercase tracking-wide">Soma da classificação</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatBRL(soma)} / {formatBRL(valOrig)} {bate ? "✓" : `· diferença ${formatBRL(soma - valOrig)}`}
                </span>
              </div>
            );
          })()}
          <p className="text-[11px] text-muted-foreground">
            Natureza e centro de custo são <b>obrigatórios</b>; o centro vale para o título inteiro. Juros, multa, taxa e desconto entram <b>automaticamente</b> e a 1ª linha absorve o valor deles para a soma continuar batendo com o título.
          </p>
        </div>
      )}

      {/* ── Comprovante (opcional) ────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { setAnexo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {anexo ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 max-w-full">
            <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{anexo.name}</span>
            <button type="button" onClick={() => setAnexo(null)} className="text-muted-foreground hover:text-danger" title="Remover comprovante"><X className="w-3.5 h-3.5" /></button>
          </span>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Paperclip className="w-3.5 h-3.5" /> Anexar comprovante
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancelar} disabled={saving}>Cancelar</Button>
        <Button onClick={confirmar} disabled={saving || caixa <= 0}>
          {saving ? "Salvando..." : `Confirmar pagamento${caixa > 0 ? ` · ${formatBRL(caixa)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}
