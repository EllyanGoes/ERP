"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import BeneficiarioCombobox, { type BenTipo } from "@/components/financeiro/BeneficiarioCombobox";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { centroExigidoPelaNatureza } from "@/lib/natureza-centro";

type Contato = { id: string; razaoSocial: string; doc?: string | null };
type ContaOpt = { id: string; nome: string; tipo?: string; ativo?: boolean };
type Linha = { key: string; naturezaFinanceiraId: string; detalhamento: string; valor: string };

function hojeInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const novaLinha = (): Linha => ({ key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" });

/**
 * "Novo Lançamento" — cria contas a receber/pagar no formato flow-charted-funds:
 * status (Pagamento/Agendamento), conta, contato, datas (pagamento/vencimento/
 * competência) e rateio por natureza financeira (várias linhas). Vira UM título
 * (com as naturezas como rateio gerencial) via POST /api/financeiro/titulos.
 *
 * Dois modos:
 * - Listas (contas a pagar/receber): `tipo` fixo, conta selecionável.
 * - Conta (extrato): `tipoSelecionavel` → Entrada/Saída no próprio form, e
 *   `contaFixa` trava a conta do extrato como destino do recebimento/pagamento.
 */
export default function LancamentoForm({
  tipo,
  contatos = [],
  tipoSelecionavel = false,
  contaFixa,
  onSaved,
}: {
  tipo: "receber" | "pagar";
  contatos?: Contato[];
  tipoSelecionavel?: boolean;
  contaFixa?: { id: string; nome: string };
  /** Disparado após salvar com sucesso (antes do diálogo de confirmação). */
  onSaved?: (info: { status: "AGENDAMENTO" | "PAGAMENTO"; tipo: "receber" | "pagar" }) => void;
}) {
  const [tipoSel, setTipoSel] = useState<"receber" | "pagar">(tipo);
  const isReceber = tipoSel === "receber";
  const [status, setStatus] = useState<"AGENDAMENTO" | "PAGAMENTO">("AGENDAMENTO");
  // Beneficiário polimórfico: CLIENTE (entrada) / FORNECEDOR/COLABORADOR (saída) / null (sem vínculo).
  const [benTipo, setBenTipo] = useState<BenTipo | null>(tipo === "receber" ? "CLIENTE" : "FORNECEDOR");
  const [benId, setBenId] = useState("");
  const [colaboradores, setColaboradores] = useState<Contato[]>([]);
  const [contaBancariaId, setContaBancariaId] = useState(contaFixa?.id ?? "");
  const [descricao, setDescricao] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hojeInput());
  const [dataVencimento, setDataVencimento] = useState(hojeInput());
  const [dataCompetencia, setDataCompetencia] = useState(hojeInput());
  const [dataEmissao, setDataEmissao] = useState(hojeInput());
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [contas, setContas] = useState<ContaOpt[]>(contaFixa ? [contaFixa] : []);
  const [naturezas, setNaturezas] = useState<NaturezaOpt[]>([]);
  const [centroCustoId, setCentroCustoId] = useState("");
  const [centros, setCentros] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  // Valores detalhados (estilo Nibo): centro de custo, retenções, desconto, juros/multa.
  const [detalhado, setDetalhado] = useState(false);
  const [abaDetalhe, setAbaDetalhe] = useState<"centro" | "retencao" | "desconto" | "juros">("centro");
  const [valorJuros, setValorJuros] = useState("");
  const [valorMulta, setValorMulta] = useState("");
  const [valorDesconto, setValorDesconto] = useState("");
  const RETENCAO_VAZIA = { iss: "", irpj: "", csll: "", inss: "", pis: "", cofins: "", outras: "" };
  const [retencoes, setRetencoes] = useState<Record<string, string>>(RETENCAO_VAZIA);
  // Modo conta: as listas de clientes/fornecedores trocam conforme o tipo.
  const [clientes, setClientes] = useState<Contato[]>([]);
  const [fornecedores, setFornecedores] = useState<Contato[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "lançamento", gender: "m",
    onNew: () => {
      setTipoSel(tipo); setStatus("AGENDAMENTO");
      setBenTipo(tipo === "receber" ? "CLIENTE" : "FORNECEDOR"); setBenId("");
      setContaBancariaId(contaFixa?.id ?? ""); setDescricao("");
      setDataPagamento(hojeInput()); setDataVencimento(hojeInput()); setDataCompetencia(hojeInput()); setDataEmissao(hojeInput());
      setLinhas([novaLinha()]); setCentroCustoId(""); setErro(null);
      setDetalhado(false); setAbaDetalhe("centro"); setValorJuros(""); setValorMulta("");
      setValorDesconto(""); setRetencoes(RETENCAO_VAZIA);
    },
  });

  // Contas bancárias (só quando a conta não vem travada pelo extrato).
  useEffect(() => {
    if (contaFixa) { setContas([contaFixa]); setContaBancariaId(contaFixa.id); return; }
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => {
      const cs: ContaOpt[] = Array.isArray(j) ? j : (j.data ?? []);
      setContas(cs);
      setContaBancariaId((cs.find((c) => c.tipo === "CAIXA") ?? cs[0])?.id ?? "");
    }).catch(() => {});
  }, [contaFixa]);

  // Naturezas conforme o tipo (entrada/saída) — refaz ao alternar no modo conta.
  useEffect(() => {
    fetch(`/api/financeiro/naturezas?tipo=${isReceber ? "ENTRADA" : "SAIDA"}&ativo=1`)
      .then((r) => r.json()).then((j) => setNaturezas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, [isReceber]);

  useEffect(() => {
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json())
      .then((j) => setCentros(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, []);

  // Centro (gerencial no título) é exigido quando ALGUMA natureza do rateio é de custo
  // (despesa/CIF). Saída sem material; o razão segue pela natureza. Receita não exige.
  const exigeCentro = !isReceber && linhas.some((l) =>
    centroExigidoPelaNatureza(naturezas.find((n) => n.id === l.naturezaFinanceiraId)));

  // Centro obrigatório → abre os valores detalhados automaticamente (o campo vive lá).
  useEffect(() => {
    if (exigeCentro) setDetalhado(true);
  }, [exigeCentro]);

  // Carrega clientes, fornecedores e colaboradores p/ o seletor de beneficiário.
  useEffect(() => {
    const norm = (j: unknown): Contato[] => {
      const lista = Array.isArray(j) ? j : ((j as { data?: unknown[] })?.data ?? []);
      return (lista as { id: string; razaoSocial?: string; nome?: string; cpfCnpj?: string | null; cpf?: string | null }[])
        .map((o) => ({ id: o.id, razaoSocial: o.razaoSocial ?? o.nome ?? "", doc: o.cpfCnpj ?? o.cpf ?? null }));
    };
    fetch("/api/clientes?limit=1000").then((r) => r.json()).then((j) => setClientes(norm(j))).catch(() => {});
    fetch("/api/suprimentos/fornecedores?ativo=1").then((r) => r.json()).then((j) => setFornecedores(norm(j))).catch(() => {});
    fetch("/api/empresa/colaboradores?ativo=true&daEmpresaAtiva=1").then((r) => r.json()).then((j) => setColaboradores(norm(j))).catch(() => {});
  }, []);

  const valorLinha = (s: string) => { const v = parseDecimal(s); return Number.isFinite(v) ? v : 0; };
  const total = linhas.reduce((s, l) => s + valorLinha(l.valor), 0);
  const pago = status === "PAGAMENTO";
  // Juros/multa/desconto/retenções só num pagamento já realizado (no agendamento
  // entram na baixa). Desconto e retenção reduzem o caixa; o título quita cheio.
  const jurosNum = pago ? valorLinha(valorJuros) : 0;
  const multaNum = pago ? valorLinha(valorMulta) : 0;
  const descontoNum = pago ? valorLinha(valorDesconto) : 0;
  const retidoNum = pago ? Object.values(retencoes).reduce((s, v) => s + valorLinha(v), 0) : 0;
  const totalEfetivo = total + jurosNum + multaNum - descontoNum - retidoNum;

  function up(key: string, campo: keyof Linha, valor: string) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  // Alterna Entrada/Saída (modo conta): muda as naturezas e o tipo de contato.
  function trocarTipo(novo: "receber" | "pagar") {
    setTipoSel(novo);
    setBenTipo(novo === "receber" ? "CLIENTE" : "FORNECEDOR"); setBenId("");
    setLinhas((prev) => prev.map((l) => ({ ...l, naturezaFinanceiraId: "" })));
  }

  async function salvar() {
    setErro(null);
    // Beneficiário é opcional (sem vínculo p/ encargos/receitas sem cadastro).
    if (benTipo && !benId) { setErro("Selecione o beneficiário ou marque 'Sem vínculo'."); return; }
    const linhasValidas = linhas.filter((l) => parseDecimal(l.valor) > 0);
    if (linhasValidas.length === 0) { setErro("Informe ao menos uma natureza com valor."); return; }
    if (linhasValidas.some((l) => !l.naturezaFinanceiraId)) { setErro("Selecione a natureza financeira de todas as linhas com valor."); return; }
    if (exigeCentro && !centroCustoId) { setErro("Centro de custo é obrigatório para natureza de despesa/CIF."); return; }
    if (pago && !contaBancariaId) { setErro("Selecione a conta de destino."); return; }
    if (descontoNum > 0 && retidoNum > 0) { setErro("Use desconto OU retenção de impostos — não os dois no mesmo lançamento."); return; }
    if (descontoNum + retidoNum >= total && total > 0) { setErro("Desconto/retenções não podem ser iguais ou maiores que o total."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/financeiro/titulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: tipoSel, status,
          beneficiarioTipo: benTipo, beneficiarioId: benTipo ? (benId || null) : null,
          contaBancariaId: pago ? contaBancariaId : null,
          descricao: descricao.trim() || null,
          dataPagamento: pago ? dataPagamento : null,
          dataVencimento,
          dataCompetencia,
          dataEmissao,
          centroCustoId: centroCustoId || null,
          valorJuros: jurosNum || 0,
          valorMulta: multaNum || 0,
          valorDesconto: descontoNum || 0,
          retencoes: Object.fromEntries(Object.entries(retencoes).map(([k, v]) => [k, valorLinha(v)])),
          linhas: linhasValidas.map((l) => ({ naturezaFinanceiraId: l.naturezaFinanceiraId, detalhamento: l.detalhamento.trim() || null, valor: parseDecimal(l.valor) })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(j.error ?? "Erro ao salvar."); return; }
      onSaved?.({ status, tipo: tipoSel });
      confirmCreated();
    } catch { setErro("Erro de conexão."); }
    finally { setSalvando(false); }
  }

  const inputCls = "w-full h-10 rounded-lg border border-border px-3 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-5">
      {/* Tipo + Status + Conta */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo de Movimentação</Label>
          {tipoSelecionavel ? (
            <select value={tipoSel} onChange={(e) => trocarTipo(e.target.value as "receber" | "pagar")} className={inputCls}>
              <option value="receber">↑ Entrada</option>
              <option value="pagar">↓ Saída</option>
            </select>
          ) : (
            <div className={`h-10 rounded-lg border px-3 flex items-center gap-1.5 text-sm font-medium ${isReceber ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
              {isReceber ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
              {isReceber ? "Entrada" : "Saída"}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value as "AGENDAMENTO" | "PAGAMENTO")} className={inputCls}>
            <option value="AGENDAMENTO">Agendamento ({isReceber ? "a receber" : "a pagar"})</option>
            <option value="PAGAMENTO">{isReceber ? "Recebimento" : "Pagamento"} (já {isReceber ? "recebido" : "pago"})</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Conta {pago && !contaFixa && <span className="text-red-500">*</span>}</Label>
          {contaFixa ? (
            <div className={`${inputCls} flex items-center text-muted-foreground bg-muted`}>{contaFixa.nome}</div>
          ) : (
            <ComboboxWithCreate
              value={contaBancariaId}
              onChange={setContaBancariaId}
              disabled={!pago}
              placeholder="Selecione"
              noneLabel="Selecione"
              triggerClassName="h-10 rounded-lg"
              menuMinWidth={360}
              options={contas.filter((c) => c.ativo !== false).map((c) => ({ value: c.id, label: c.nome }))}
            />
          )}
        </div>
      </div>

      {/* Nome + Descrição */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Beneficiário <span className="text-muted-foreground">(opcional)</span></Label>
          <BeneficiarioCombobox
            modo={tipoSel}
            tipo={benTipo}
            value={benId}
            onChange={(t, id) => { setBenTipo(t); setBenId(id ?? ""); }}
            clientes={clientes.map((c) => ({ id: c.id, nome: c.razaoSocial, doc: c.doc }))}
            fornecedores={fornecedores.map((c) => ({ id: c.id, nome: c.razaoSocial, doc: c.doc }))}
            colaboradores={colaboradores.map((c) => ({ id: c.id, nome: c.razaoSocial, doc: c.doc }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Descrição <span className="text-muted-foreground">(opcional)</span></Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Serviço prestado" className="h-10 rounded-lg bg-card px-3" />
        </div>
      </div>

      {/* Datas + Total */}
      <div className="grid grid-cols-5 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Emissão</Label>
          <DatePicker value={dataEmissao} onChange={(v) => setDataEmissao(v)} className="w-full" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isReceber ? "Recebimento" : "Pagamento"}</Label>
          <DatePicker value={dataPagamento} onChange={(v) => setDataPagamento(v)} disabled={!pago} className="w-full" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Vencimento</Label>
          <DatePicker value={dataVencimento} onChange={(v) => setDataVencimento(v)} className="w-full" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Competência</Label>
          <DatePicker value={dataCompetencia} onChange={(v) => setDataCompetencia(v)} className="w-full" />
        </div>
        <div className="text-right">
          <Label className="text-xs text-muted-foreground block">
            {totalEfetivo !== total ? (isReceber ? "Total recebido" : "Total pago") : "Total"}
          </Label>
          <span className={`text-lg font-bold tabular-nums ${totalEfetivo > 0 ? "text-foreground" : "text-muted-foreground/60"}`}>{formatBRL(totalEfetivo)}</span>
          {totalEfetivo !== total && (
            <p className="text-[11px] text-muted-foreground">
              {formatBRL(total)}
              {jurosNum + multaNum > 0 && ` + ${formatBRL(jurosNum + multaNum)} juros/multa`}
              {descontoNum > 0 && ` − ${formatBRL(descontoNum)} desconto`}
              {retidoNum > 0 && ` − ${formatBRL(retidoNum)} retido`}
            </p>
          )}
        </div>
      </div>

      {/* Rateio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Naturezas financeiras <span className="text-red-500">*</span></Label>
          <button type="button" onClick={() => setLinhas((p) => [...p, novaLinha()])} className="inline-flex items-center gap-1 text-xs text-info hover:text-info font-medium">
            <Plus className="w-3.5 h-3.5" /> Adicionar natureza
          </button>
        </div>
        {linhas.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2 items-center">
            <NaturezaCombobox
              value={l.naturezaFinanceiraId}
              onChange={(id) => up(l.key, "naturezaFinanceiraId", id)}
              naturezas={naturezas}
              defaultTipo={isReceber ? "ENTRADA" : "SAIDA"}
              allowCreate
              onCreated={(n) => setNaturezas((prev) => [...prev, n])}
            />
            <Input value={l.detalhamento} onChange={(e) => up(l.key, "detalhamento", e.target.value)} placeholder="Detalhamento (opcional)" className="h-9 min-w-0 bg-card" />
            <Input value={l.valor} onChange={(e) => up(l.key, "valor", e.target.value)} placeholder="0,00" className="h-9 text-right font-mono min-w-0 bg-card" />
            <button type="button" onClick={() => setLinhas((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={linhas.length <= 1} className="p-1.5 rounded text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 disabled:opacity-30">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">As naturezas classificam o título (rateio) — a soma é o valor total. Crie/edite naturezas em Financeiro → Naturezas Financeiras.</p>
      </div>

      {/* Valores detalhados (estilo Nibo): centro de custo, retenção de impostos,
          desconto e juros/multa em abas. Centro obrigatório (despesa/CIF) força o
          bloco aberto; retenções e desconto aguardam as naturezas padrão. */}
      <div className="rounded-xl border border-border bg-muted/40">
        <button
          type="button"
          onClick={() => { if (!exigeCentro) setDetalhado((v) => !v); }}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        >
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
              detalhado ? "bg-info" : "bg-muted-foreground/30",
            )}
          >
            <span className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
              detalhado ? "left-[18px]" : "left-0.5",
            )} />
          </span>
          <span className="text-sm font-medium text-foreground">Valores detalhados</span>
          {exigeCentro && <span className="text-[11px] text-muted-foreground">(centro de custo obrigatório p/ despesa/CIF)</span>}
        </button>

        {detalhado && (
          <div className="px-4 pb-4 space-y-3">
            {/* Abas */}
            <div className="flex items-center gap-1 border-b border-border text-sm">
              {([
                ["centro", "Centro de custo"],
                ["retencao", "Retenção de impostos"],
                ["desconto", "Desconto"],
                ["juros", "Juros e multa"],
              ] as const).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAbaDetalhe(id)}
                  className={cn(
                    "px-3 py-2 -mb-px border-b-2 transition-colors whitespace-nowrap",
                    abaDetalhe === id
                      ? "border-info text-foreground font-medium"
                      : "border-transparent text-info hover:text-info/80",
                  )}
                >
                  {rotulo}
                  {id === "centro" && exigeCentro && <span className="text-red-500 ml-0.5">*</span>}
                </button>
              ))}
            </div>

            {abaDetalhe === "centro" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Centro de custo {exigeCentro && <span className="text-red-500">*</span>}
                </Label>
                <ComboboxWithCreate
                  value={centroCustoId}
                  onChange={setCentroCustoId}
                  placeholder="Selecionar centro de custo..."
                  noneLabel="(Nenhum)"
                  triggerClassName="h-10 rounded-lg"
                  menuMinWidth={360}
                  options={centros.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  {exigeCentro
                    ? "Obrigatório para despesa/CIF — classificação gerencial do débito."
                    : "Classificação gerencial do título (opcional)."}
                </p>
              </div>
            )}

            {abaDetalhe === "retencao" && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-3">
                  {(["iss", "irpj", "csll", "inss", "pis", "cofins", "outras"] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{k === "outras" ? "Outras" : k.toUpperCase()}</Label>
                      <Input
                        value={retencoes[k]}
                        onChange={(e) => setRetencoes((p) => ({ ...p, [k]: e.target.value }))}
                        disabled={!pago}
                        placeholder="0,00"
                        className="h-9 text-right font-mono bg-card"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {pago
                    ? isReceber
                      ? "O cliente reteve na fonte: você recebe o líquido e a retenção vira custo (X Retido sobre a Receita)."
                      : "Você reteve na fonte: paga o líquido ao fornecedor e cada imposto gera uma GUIA a pagar (vencimento dia 20 do mês seguinte, editável)."
                    : "Disponível só no já pago/recebido."}
                </p>
              </div>
            )}

            {abaDetalhe === "desconto" && (
              <div className="space-y-2">
                <div className="w-48 space-y-1">
                  <Label className="text-xs text-muted-foreground">Valor</Label>
                  <Input
                    value={valorDesconto}
                    onChange={(e) => setValorDesconto(e.target.value)}
                    disabled={!pago}
                    placeholder="0,00"
                    className="h-9 text-right font-mono bg-card"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {pago
                    ? `${isReceber ? "Recebe" : "Paga"} MENOS e o título quita pelo total — classificado como Descontos ${isReceber ? "Concedidos" : "Recebidos"}. Não combina com retenção no mesmo lançamento.`
                    : "Disponível só no já pago/recebido — num agendamento, o desconto é informado na baixa."}
                </p>
              </div>
            )}

            {abaDetalhe === "juros" && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Juros</Label>
                    <Input value={valorJuros} onChange={(e) => setValorJuros(e.target.value)} disabled={!pago} placeholder="0,00" className="h-9 text-right font-mono bg-card" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Multas</Label>
                    <Input value={valorMulta} onChange={(e) => setValorMulta(e.target.value)} disabled={!pago} placeholder="0,00" className="h-9 text-right font-mono bg-card" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {pago
                    ? `Somam ao valor ${isReceber ? "recebido" : "pago"} (o principal do título continua sendo a soma das naturezas).`
                    : "Disponível só no já pago/recebido — num agendamento, os juros e a multa são informados na baixa do título."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {erro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{erro}</p>}

      <Button onClick={salvar} disabled={salvando} className="w-full">
        {salvando ? "Salvando..." : "Adicionar"}
      </Button>
      {dialog}
    </div>
  );
}
