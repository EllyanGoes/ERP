"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreateDrawer from "@/components/shared/CreateDrawer";
import LancamentoForm from "@/components/financeiro/LancamentoForm";
import DateRangePicker from "@/components/shared/DateRangePicker";
import { Autoria } from "@/components/shared/Autoria";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, FileDown, Loader2, Plus, Search, X } from "lucide-react";

type EmpresaContato = { razaoSocial: string; nomeFantasia: string | null };
type ExtratoLinha = {
  id: string;
  tipo: "RECEITA" | "DESPESA" | "TRANSFERENCIA";
  descricao: string;
  valor: string | number;
  dataLancamento: string;
  saldoCorrente: number;
  favorecido: string | null;
  observacoes: string | null;
  dataVencimento: string | null;
  dataCompetencia: string | null;
  naturezaFinanceira: { id: string; nome: string } | null;
  naturezaFinanceiraId: string | null;
  contaReceber: { id: string; numero: string; cliente: EmpresaContato | null; pedidoVenda: { id: string; numero: string } | null } | null;
  contaPagar: { id: string; numero: string; fornecedor: EmpresaContato | null } | null;
};
function contatoLinha(l: ExtratoLinha): string {
  return (
    l.favorecido ||
    (l.contaReceber?.cliente && (l.contaReceber.cliente.nomeFantasia || l.contaReceber.cliente.razaoSocial)) ||
    (l.contaPagar?.fornecedor && (l.contaPagar.fornecedor.nomeFantasia || l.contaPagar.fornecedor.razaoSocial)) ||
    "—"
  );
}

// O número do título e do pedido já aparecem como chips na linha; remove-os da
// descrição para não repetir a mesma informação.
function descricaoLimpa(l: ExtratoLinha): string {
  const codigos = [l.contaReceber?.numero, l.contaPagar?.numero, l.contaReceber?.pedidoVenda?.numero].filter(Boolean) as string[];
  let d = l.descricao;
  for (const c of codigos) d = d.split(c).join("");
  return d.replace(/\s{2,}/g, " ").replace(/\s*—\s*$/, "").replace(/^\s*—\s*/, "").trim() || l.descricao;
}
type Conta = {
  id: string;
  nome: string;
  saldoInicial: string | number;
  saldoAtual: number;
  banco: { id: string; nome: string } | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  extrato: ExtratoLinha[];
};

export default function ExtratoContaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [conta, setConta] = useState<Conta | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = usePersistedState<{ from: string; to: string }>(
    `financeiro:conta:${params.id}:periodo`,
    { from: "", to: "" },
  );
  const [busca, setBusca] = usePersistedState<string>(`financeiro:conta:${params.id}:busca`, "");
  const [fluxo, setFluxo] = usePersistedState<"TODOS" | "ENTRADA" | "SAIDA">(
    `financeiro:conta:${params.id}:fluxo`,
    "TODOS",
  );
  const de = periodo.from;
  const ate = periodo.to;
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [aviso, setAviso] = useState("");
  useTabTitle(conta?.nome);

  const carregar = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (de) qs.set("de", de);
    if (ate) qs.set("ate", `${ate}T23:59:59`);
    fetch(`/api/financeiro/contas/${params.id}?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => setConta(j.data ?? null))
      .finally(() => setLoading(false));
  }, [params.id, de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  // Filtro local: busca por descrição/contato/título e também por valor
  // ("90", "1.250,50", "R$ 45" — normaliza vírgula/pontos p/ comparar).
  const extratoFiltrado = useMemo(() => {
    if (!conta) return [];
    const q = busca.trim().toLowerCase();
    const qValor = q.replace(/^r\$\s*/, "").replace(/\./g, "").replace(",", ".");
    const buscaValor = /^\d+(\.\d{1,2})?$/.test(qValor) ? qValor : "";
    return conta.extrato.filter((l) => {
      const v = l.tipo === "DESPESA" ? -Number(l.valor) : Number(l.valor);
      if (fluxo === "ENTRADA" && v <= 0) return false;
      if (fluxo === "SAIDA" && v >= 0) return false;
      if (!q) return true;
      const texto = [
        l.descricao,
        contatoLinha(l),
        l.naturezaFinanceira?.nome,
        l.contaReceber?.numero,
        l.contaPagar?.numero,
        l.contaReceber?.pedidoVenda?.numero,
      ].filter(Boolean).join(" ").toLowerCase();
      if (texto.includes(q)) return true;
      return !!buscaValor && Number(l.valor).toFixed(2).includes(buscaValor);
    });
  }, [conta, busca, fluxo]);

  async function baixarPdf() {
    if (!conta) return;
    setGerandoPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const M = 12;

      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(37, 99, 235);
      doc.text("Extrato da Conta", M, 16);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text(`${conta.nome}${conta.banco?.nome ? ` — ${conta.banco.nome}` : ""}`, M, 22);
      const periodo = de || ate
        ? `Período: ${de ? formatDate(de) : "início"} a ${ate ? formatDate(ate) : "hoje"}`
        : "Período: completo";
      doc.setFontSize(8.5); doc.setTextColor(100);
      doc.text(periodo, M, 27);
      doc.text(`Emitido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, pageW - M, 27, { align: "right" });

      autoTable(doc, {
        startY: 31,
        head: [["Data", "Descrição", "Cliente / Contato", "Natureza", "Entradas", "Saídas", "Saldo"]],
        body: extratoFiltrado.map((l) => {
          // valor é sempre positivo; a direção (entrada/saída) vem do tipo —
          // mesma convenção do saldo na API (DESPESA = saída).
          const v = l.tipo === "DESPESA" ? -Number(l.valor) : Number(l.valor);
          return [
            formatDate(l.dataLancamento),
            l.descricao,
            contatoLinha(l) === "—" ? "" : contatoLinha(l),
            l.naturezaFinanceira?.nome ?? "",
            v > 0 ? formatBRL(v) : "",
            v < 0 ? formatBRL(-v) : "",
            formatBRL(l.saldoCorrente),
          ];
        }),
        styles: { fontSize: 8, cellPadding: 1.4, textColor: [15, 23, 42] },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 20 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" } },
        margin: { left: M, right: M },
      });

      // @ts-expect-error lastAutoTable é adicionado pelo plugin autotable
      const yt = (doc.lastAutoTable?.finalY ?? 31) + 6;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text(`Saldo do período: ${formatBRL(conta.saldoAtual)}`, pageW - M, yt, { align: "right" });

      doc.save(`extrato-${conta.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } finally {
      setGerandoPdf(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={conta?.nome ?? "Conta"}
        breadcrumbs={[
          { label: "Financeiro" },
          { label: "Contas", href: "/financeiro/contas" },
          { label: conta?.nome ?? "—" },
        ]}
      />
      <div className="px-8 pb-8 space-y-6">
        {loading && !conta ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
        ) : !conta ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Conta não encontrada.</p>
        ) : (
          <>
            {aviso && (
              <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{aviso}</div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl p-4 bg-muted text-foreground">
                <p className="text-sm font-medium opacity-75">Saldo inicial</p>
                <p className="text-2xl font-bold mt-1">{formatBRL(Number(conta.saldoInicial))}</p>
              </div>
              <div className={`rounded-xl p-4 ${conta.saldoAtual >= 0 ? "bg-info/10 text-info" : "bg-danger/10 text-danger"}`}>
                <p className="text-sm font-medium opacity-75">{de || ate ? "Saldo do período" : "Saldo atual"}</p>
                <p className="text-2xl font-bold mt-1">{formatBRL(conta.saldoAtual)}</p>
              </div>
              <div className="rounded-xl p-4 bg-muted text-foreground">
                <p className="text-sm font-medium opacity-75">Lançamentos</p>
                <p className="text-2xl font-bold mt-1">
                  {extratoFiltrado.length}
                  {extratoFiltrado.length !== conta.extrato.length && (
                    <span className="text-sm font-medium opacity-60"> de {conta.extrato.length}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Filtros (período, busca, entrada/saída) + PDF */}
            <div className="flex flex-wrap items-center gap-3">
              <DateRangePicker
                value={{ from: de, to: ate }}
                onChange={(r) => setPeriodo({ from: r.from, to: r.to })}
                placeholder="Período"
              />
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 h-9 text-sm"
                  placeholder="Descrição, contato ou valor..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                {busca && (
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setBusca("")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setFluxo(fluxo === "ENTRADA" ? "TODOS" : "ENTRADA")}
                className={cn(
                  "flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors whitespace-nowrap",
                  fluxo === "ENTRADA"
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
                title="Mostrar só entradas"
              >
                <ArrowUpRight className="w-3.5 h-3.5" /> Entradas
              </button>
              <button
                onClick={() => setFluxo(fluxo === "SAIDA" ? "TODOS" : "SAIDA")}
                className={cn(
                  "flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors whitespace-nowrap",
                  fluxo === "SAIDA"
                    ? "border-danger/40 bg-danger/10 text-danger"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
                title="Mostrar só saídas"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" /> Saídas
              </button>
              <div className="flex-1" />
              <Button size="sm" onClick={() => setNovoOpen(true)} className="h-9 gap-1.5">
                <Plus className="w-4 h-4" /> Novo Lançamento
              </Button>
              <Button variant="outline" size="sm" onClick={baixarPdf} disabled={gerandoPdf || extratoFiltrado.length === 0} className="h-9 gap-1.5">
                {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Baixar PDF
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Extrato</h2>
                <Autoria criadoPor={conta.criadoPor} atualizadoPor={conta.atualizadoPor} className="mt-0.5" />
              </div>
              {extratoFiltrado.length === 0 ? (
                <p className="px-6 py-10 text-sm text-muted-foreground text-center">
                  {conta.extrato.length === 0 ? "Nenhum lançamento no período." : "Nenhum lançamento encontrado com os filtros atuais."}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border bg-muted">
                      <th className="px-6 py-3 font-medium">Data</th>
                      <th className="px-6 py-3 font-medium">Descrição</th>
                      <th className="px-6 py-3 font-medium">Cliente / Contato</th>
                      <th className="px-6 py-3 font-medium">Categoria</th>
                      <th className="px-6 py-3 font-medium text-right">Entradas</th>
                      <th className="px-6 py-3 font-medium text-right">Saídas</th>
                      <th className="px-6 py-3 font-medium text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extratoFiltrado.map((l) => {
                      // valor é sempre positivo; a direção vem do tipo (DESPESA =
                      // saída), igual ao cálculo do saldo na API.
                      const v = l.tipo === "DESPESA" ? -Number(l.valor) : Number(l.valor);
                      const pedido = l.contaReceber?.pedidoVenda;
                      const titulo = l.contaReceber?.numero || l.contaPagar?.numero;
                      return (
                        <tr
                          key={l.id}
                          className={`border-b border-gray-50 hover:bg-muted ${pedido ? "cursor-pointer" : ""}`}
                          onClick={pedido ? () => router.push(`/pedidos-venda/${pedido.id}`) : undefined}
                        >
                          <td className="px-6 py-3 text-muted-foreground whitespace-nowrap">{formatDate(l.dataLancamento)}</td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1.5 text-foreground">
                              {l.tipo === "RECEITA" ? <ArrowUpRight className="w-3.5 h-3.5 text-success" />
                                : l.tipo === "DESPESA" ? <ArrowDownLeft className="w-3.5 h-3.5 text-red-500" />
                                : <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />}
                              {descricaoLimpa(l)}
                            </span>
                            {titulo && <span className="ml-2 font-mono text-xs text-muted-foreground">{titulo}</span>}
                            {pedido && (
                              <Link
                                href={`/pedidos-venda/${pedido.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
                              >
                                {pedido.numero} <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            )}
                          </td>
                          <td className="px-6 py-3 text-muted-foreground">{contatoLinha(l)}</td>
                          <td className="px-6 py-3 text-muted-foreground">{l.naturezaFinanceira?.nome ?? "—"}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-success">
                            {v > 0 ? formatBRL(v) : "—"}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-danger">
                            {v < 0 ? formatBRL(-v) : "—"}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-semibold text-foreground">{formatBRL(l.saldoCorrente)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <Link href="/financeiro/contas" className="text-sm text-info hover:underline">← Voltar para contas</Link>
          </>
        )}
      </div>

      {/* Novo Lançamento — mesmo componente das listas de contas a pagar/receber,
          com a conta do extrato travada e o tipo (Entrada/Saída) selecionável. */}
      {conta && (
        <CreateDrawer
          open={novoOpen}
          onOpenChange={setNovoOpen}
          title="Novo Lançamento"
          width="lg"
          onCreated={() => carregar()}
        >
          <LancamentoForm
            tipo="pagar"
            tipoSelecionavel
            contaFixa={{ id: conta.id, nome: conta.nome }}
            onSaved={(info) => {
              if (info.status === "AGENDAMENTO") {
                setAviso(`Agendamento criado em ${info.tipo === "receber" ? "Contas a Receber" : "Contas a Pagar"} (não entra no saldo até dar baixa).`);
                setTimeout(() => setAviso(""), 6000);
              }
            }}
          />
        </CreateDrawer>
      )}
    </div>
  );
}
