"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import CreateDrawer from "@/components/shared/CreateDrawer";
import LancamentoForm from "@/components/financeiro/LancamentoForm";
import { formatBRL, formatDate } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, FileDown, Loader2, Plus } from "lucide-react";

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
  categoriaFinanceira: { id: string; nome: string } | null;
  categoriaFinanceiraId: string | null;
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
  extrato: ExtratoLinha[];
};

export default function ExtratoContaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [conta, setConta] = useState<Conta | null>(null);
  const [loading, setLoading] = useState(true);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
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
        head: [["Data", "Descrição", "Cliente / Contato", "Categoria", "Entradas", "Saídas", "Saldo"]],
        body: conta.extrato.map((l) => {
          const v = Number(l.valor);
          return [
            formatDate(l.dataLancamento),
            l.descricao,
            contatoLinha(l) === "—" ? "" : contatoLinha(l),
            l.categoriaFinanceira?.nome ?? "",
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
          <p className="text-sm text-gray-400 py-10 text-center">Carregando...</p>
        ) : !conta ? (
          <p className="text-sm text-gray-400 py-10 text-center">Conta não encontrada.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
                <p className="text-sm font-medium opacity-75">Saldo inicial</p>
                <p className="text-2xl font-bold mt-1">{formatBRL(Number(conta.saldoInicial))}</p>
              </div>
              <div className={`rounded-xl p-4 ${conta.saldoAtual >= 0 ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
                <p className="text-sm font-medium opacity-75">{de || ate ? "Saldo do período" : "Saldo atual"}</p>
                <p className="text-2xl font-bold mt-1">{formatBRL(conta.saldoAtual)}</p>
              </div>
              <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
                <p className="text-sm font-medium opacity-75">Lançamentos</p>
                <p className="text-2xl font-bold mt-1">{conta.extrato.length}</p>
              </div>
            </div>

            {/* Filtro de período + PDF */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                De
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                Até
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              {(de || ate) && (
                <Button variant="outline" size="sm" onClick={() => { setDe(""); setAte(""); }} className="h-9">Limpar</Button>
              )}
              <div className="flex-1" />
              <Button size="sm" onClick={() => setNovoOpen(true)} className="h-9 gap-1.5">
                <Plus className="w-4 h-4" /> Novo Lançamento
              </Button>
              <Button variant="outline" size="sm" onClick={baixarPdf} disabled={gerandoPdf || conta.extrato.length === 0} className="h-9 gap-1.5">
                {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Baixar PDF
              </Button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Extrato</h2>
              </div>
              {conta.extrato.length === 0 ? (
                <p className="px-6 py-10 text-sm text-gray-400 text-center">Nenhum lançamento no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
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
                    {conta.extrato.map((l) => {
                      const v = Number(l.valor);
                      const pedido = l.contaReceber?.pedidoVenda;
                      const titulo = l.contaReceber?.numero || l.contaPagar?.numero;
                      return (
                        <tr
                          key={l.id}
                          className={`border-b border-gray-50 hover:bg-gray-50 ${pedido ? "cursor-pointer" : ""}`}
                          onClick={pedido ? () => router.push(`/pedidos-venda/${pedido.id}`) : undefined}
                        >
                          <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{formatDate(l.dataLancamento)}</td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1.5 text-gray-900">
                              {l.tipo === "RECEITA" ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                                : l.tipo === "DESPESA" ? <ArrowDownLeft className="w-3.5 h-3.5 text-red-500" />
                                : <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />}
                              {descricaoLimpa(l)}
                            </span>
                            {titulo && <span className="ml-2 font-mono text-xs text-gray-400">{titulo}</span>}
                            {pedido && (
                              <Link
                                href={`/pedidos-venda/${pedido.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                              >
                                {pedido.numero} <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            )}
                          </td>
                          <td className="px-6 py-3 text-gray-600">{contatoLinha(l)}</td>
                          <td className="px-6 py-3 text-gray-500">{l.categoriaFinanceira?.nome ?? "—"}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-emerald-700">
                            {v > 0 ? formatBRL(v) : "—"}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-red-600">
                            {v < 0 ? formatBRL(-v) : "—"}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-semibold text-gray-900">{formatBRL(l.saldoCorrente)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <Link href="/financeiro/contas" className="text-sm text-blue-600 hover:underline">← Voltar para contas</Link>
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
          />
        </CreateDrawer>
      )}
    </div>
  );
}
