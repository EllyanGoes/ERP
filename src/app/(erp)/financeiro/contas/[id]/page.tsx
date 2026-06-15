"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, parseDecimal } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, FileDown, Loader2, Plus } from "lucide-react";

type CategoriaOpt = { id: string; nome: string; tipo: "RECEITA" | "DESPESA" };

function hojeInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  useTabTitle(conta?.nome);

  // ── Novo Lançamento (entrada/saída avulsa direto na conta) ──────────────────
  const [novoOpen, setNovoOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroNovo, setErroNovo] = useState("");
  const [novoTipo, setNovoTipo] = useState<"RECEITA" | "DESPESA">("DESPESA");
  const [novoData, setNovoData] = useState(hojeInput());
  const [novoVencimento, setNovoVencimento] = useState("");
  const [novoCompetencia, setNovoCompetencia] = useState("");
  const [novoDescricao, setNovoDescricao] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoCategoriaId, setNovoCategoriaId] = useState("");
  const [novoFavorecido, setNovoFavorecido] = useState("");
  const [novoDetalhamento, setNovoDetalhamento] = useState("");
  const [categorias, setCategorias] = useState<CategoriaOpt[]>([]);
  const [editId, setEditId] = useState<string | null>(null); // null = novo; id = editando avulso
  // Criação rápida de categoria (+ Adicionar categoria)
  const [catNovaOpen, setCatNovaOpen] = useState(false);
  const [catNovaNome, setCatNovaNome] = useState("");
  const [catSalvando, setCatSalvando] = useState(false);

  function carregarCategorias() {
    if (categorias.length === 0) {
      fetch("/api/financeiro/plano-contas")
        .then((r) => r.json())
        .then((j) => setCategorias(Array.isArray(j.flat) ? j.flat : []))
        .catch(() => {});
    }
  }

  function abrirNovo() {
    setErroNovo(""); setEditId(null);
    setNovoTipo("DESPESA");
    setNovoData(hojeInput()); setNovoVencimento(""); setNovoCompetencia("");
    setNovoDescricao(""); setNovoValor(""); setNovoCategoriaId(""); setNovoFavorecido(""); setNovoDetalhamento("");
    setCatNovaOpen(false); setCatNovaNome("");
    setNovoOpen(true);
    carregarCategorias();
  }

  // Edita um lançamento AVULSO (sem vínculo a título). Os ligados a recebimento/
  // pagamento são geridos pelo título — não abrem aqui.
  function abrirEditar(l: ExtratoLinha) {
    if (l.contaReceber || l.contaPagar || l.tipo === "TRANSFERENCIA") return;
    setErroNovo(""); setEditId(l.id);
    setNovoTipo(l.tipo === "RECEITA" ? "RECEITA" : "DESPESA");
    setNovoData(String(l.dataLancamento).slice(0, 10));
    setNovoVencimento(l.dataVencimento ? String(l.dataVencimento).slice(0, 10) : "");
    setNovoCompetencia(l.dataCompetencia ? String(l.dataCompetencia).slice(0, 10) : "");
    setNovoDescricao(l.descricao);
    setNovoValor(String(Number(l.valor)).replace(".", ","));
    setNovoCategoriaId(l.categoriaFinanceiraId ?? "");
    setNovoFavorecido(l.favorecido ?? "");
    setNovoDetalhamento(l.observacoes ?? "");
    setCatNovaOpen(false); setCatNovaNome("");
    setNovoOpen(true);
    carregarCategorias();
  }

  async function criarCategoriaInline() {
    const nome = catNovaNome.trim();
    if (!nome) return;
    setCatSalvando(true);
    try {
      const res = await fetch("/api/financeiro/plano-contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, tipo: novoTipo }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data?.id) {
        const nova: CategoriaOpt = { id: j.data.id, nome, tipo: novoTipo };
        setCategorias((p) => [...p, nova]);
        setNovoCategoriaId(nova.id);
        setCatNovaOpen(false); setCatNovaNome("");
      }
    } finally { setCatSalvando(false); }
  }

  async function excluirLancamento() {
    if (!editId) return;
    if (!confirm("Excluir este lançamento?")) return;
    setSalvando(true); setErroNovo("");
    try {
      const res = await fetch(`/api/financeiro/lancamentos/${editId}`, { method: "DELETE" });
      if (!res.ok) { setErroNovo((await res.json().catch(() => ({}))).error || "Erro ao excluir."); return; }
      setNovoOpen(false);
      carregar();
    } catch { setErroNovo("Erro de conexão."); }
    finally { setSalvando(false); }
  }

  async function salvarNovo() {
    if (!novoDescricao.trim()) { setErroNovo("Informe a descrição."); return; }
    const valorNum = parseDecimal(novoValor);
    if (!(valorNum > 0)) { setErroNovo("Informe um valor maior que zero."); return; }
    setSalvando(true); setErroNovo("");
    try {
      const res = await fetch(
        editId ? `/api/financeiro/lancamentos/${editId}` : "/api/financeiro/lancamentos",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: novoTipo,
            descricao: novoDescricao.trim(),
            valor: valorNum,
            dataLancamento: novoData,
            dataVencimento: novoVencimento || null,
            dataCompetencia: novoCompetencia || null,
            contaBancariaId: params.id,
            categoriaFinanceiraId: novoCategoriaId || null,
            favorecido: novoFavorecido.trim() || null,
            observacoes: novoDetalhamento.trim() || null,
          }),
        },
      );
      if (!res.ok) { setErroNovo((await res.json().catch(() => ({}))).error || "Erro ao salvar."); return; }
      setNovoOpen(false);
      carregar();
    } catch { setErroNovo("Erro de conexão."); }
    finally { setSalvando(false); }
  }

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
              <Button size="sm" onClick={abrirNovo} className="h-9 gap-1.5">
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
                      // Avulso (sem título e não transferência) → clicável para editar.
                      const editavel = !l.contaReceber && !l.contaPagar && l.tipo !== "TRANSFERENCIA";
                      return (
                        <tr
                          key={l.id}
                          className={`border-b border-gray-50 hover:bg-gray-50 ${pedido || editavel ? "cursor-pointer" : ""}`}
                          onClick={pedido ? () => router.push(`/pedidos-venda/${pedido.id}`) : editavel ? () => abrirEditar(l) : undefined}
                          title={editavel ? "Clique para editar" : undefined}
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

      {/* Drawer lateral — Novo / Editar Lançamento */}
      {novoOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => !salvando && setNovoOpen(false)}>
          <div className="h-full w-full max-w-lg bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">{editId ? "Editar Lançamento" : "Novo Lançamento"}</h3>
              <button onClick={() => setNovoOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {erroNovo && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erroNovo}</p>}

              {/* Tipo / Status / Conta */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de Movimentação</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => { setNovoTipo("RECEITA"); setNovoCategoriaId(""); }}
                      className={`h-10 rounded-lg border text-xs font-semibold transition-colors ${novoTipo === "RECEITA" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}>
                      ↑ Entrada
                    </button>
                    <button type="button" onClick={() => { setNovoTipo("DESPESA"); setNovoCategoriaId(""); }}
                      className={`h-10 rounded-lg border text-xs font-semibold transition-colors ${novoTipo === "DESPESA" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}>
                      ↓ Saída
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</label>
                  <div className="h-10 flex items-center px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
                    {novoTipo === "RECEITA" ? "Recebimento" : "Pagamento"}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Conta</label>
                  <div className="h-10 flex items-center px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 truncate">
                    {conta?.nome}
                  </div>
                </div>
              </div>

              {/* Nome / Descrição */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nome / Contato</label>
                  <input value={novoFavorecido} onChange={(e) => setNovoFavorecido(e.target.value)} placeholder="Cliente, fornecedor..."
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Descrição</label>
                  <input value={novoDescricao} onChange={(e) => setNovoDescricao(e.target.value)} placeholder="Ex.: Serviço prestado"
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Datas: Pagamento / Vencimento / Competência */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pagamento</label>
                  <input type="date" value={novoData} onChange={(e) => setNovoData(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Vencimento</label>
                  <input type="date" value={novoVencimento} onChange={(e) => setNovoVencimento(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Competência</label>
                  <input type="date" value={novoCompetencia} onChange={(e) => setNovoCompetencia(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Categoria (+ adicionar) / Valor */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoria</label>
                  <select value={novoCategoriaId} onChange={(e) => setNovoCategoriaId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Selecione uma categoria —</option>
                    {categorias.filter((c) => c.tipo === novoTipo).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  {!catNovaOpen ? (
                    <button type="button" onClick={() => setCatNovaOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                      <Plus className="w-3 h-3" /> Adicionar categoria
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <input autoFocus value={catNovaNome} onChange={(e) => setCatNovaNome(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") criarCategoriaInline(); }}
                        placeholder={`Nova categoria de ${novoTipo === "RECEITA" ? "entrada" : "saída"}`}
                        className="flex-1 h-8 rounded-lg border border-gray-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <Button size="sm" onClick={criarCategoriaInline} disabled={catSalvando || !catNovaNome.trim()} className="h-8 px-2 text-xs">OK</Button>
                      <button type="button" onClick={() => { setCatNovaOpen(false); setCatNovaNome(""); }} className="text-gray-400 hover:text-gray-600 text-sm px-1">×</button>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Valor</label>
                  <input inputMode="decimal" value={novoValor} onChange={(e) => setNovoValor(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00"
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Detalhamento */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Detalhamento (opcional)</label>
                <textarea value={novoDetalhamento} onChange={(e) => setNovoDetalhamento(e.target.value)} rows={2} placeholder="Observações..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total</span>
                <span className={`text-lg font-bold ${novoTipo === "RECEITA" ? "text-emerald-700" : "text-red-600"}`}>
                  {novoTipo === "RECEITA" ? "+" : "−"} {formatBRL(parseDecimal(novoValor) || 0)}
                </span>
              </div>
            </div>

            {/* Rodapé */}
            <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100">
              {editId && (
                <Button variant="outline" onClick={excluirLancamento} disabled={salvando} className="text-red-600 border-red-200 hover:bg-red-50">
                  Excluir
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvarNovo} disabled={salvando} className="font-semibold">
                {salvando ? "Salvando..." : editId ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
