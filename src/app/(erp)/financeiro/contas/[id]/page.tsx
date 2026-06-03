"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { formatBRL, formatDate } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight } from "lucide-react";

type ExtratoLinha = {
  id: string;
  tipo: "RECEITA" | "DESPESA" | "TRANSFERENCIA";
  descricao: string;
  valor: string | number;
  dataLancamento: string;
  saldoCorrente: number;
  categoriaFinanceira: { id: string; nome: string } | null;
  contaReceber: { id: string; numero: string } | null;
  contaPagar: { id: string; numero: string } | null;
};
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
  const [conta, setConta] = useState<Conta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/financeiro/contas/${params.id}`)
      .then((r) => r.json())
      .then((j) => setConta(j.data ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div>
      <PageHeader
        title={conta?.nome ?? "Conta"}
        breadcrumbs={[
          { label: "Financeiro" },
          { label: "Contas Bancárias", href: "/financeiro/contas" },
          { label: conta?.nome ?? "—" },
        ]}
      />
      <div className="px-8 pb-8 space-y-6">
        {loading ? (
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
                <p className="text-sm font-medium opacity-75">Saldo atual</p>
                <p className="text-2xl font-bold mt-1">{formatBRL(conta.saldoAtual)}</p>
              </div>
              <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
                <p className="text-sm font-medium opacity-75">Lançamentos</p>
                <p className="text-2xl font-bold mt-1">{conta.extrato.length}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Extrato</h2>
              </div>
              {conta.extrato.length === 0 ? (
                <p className="px-6 py-10 text-sm text-gray-400 text-center">Nenhum lançamento nesta conta.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="px-6 py-3 font-medium">Data</th>
                      <th className="px-6 py-3 font-medium">Descrição</th>
                      <th className="px-6 py-3 font-medium">Categoria</th>
                      <th className="px-6 py-3 font-medium text-right">Valor</th>
                      <th className="px-6 py-3 font-medium text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conta.extrato.map((l) => {
                      const v = Number(l.valor);
                      const titulo = l.contaReceber?.numero || l.contaPagar?.numero;
                      return (
                        <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-6 py-3 text-gray-600">{formatDate(l.dataLancamento)}</td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1.5 text-gray-900">
                              {l.tipo === "RECEITA" ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                                : l.tipo === "DESPESA" ? <ArrowDownLeft className="w-3.5 h-3.5 text-red-500" />
                                : <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />}
                              {l.descricao}
                            </span>
                            {titulo && <span className="ml-2 font-mono text-xs text-gray-400">{titulo}</span>}
                          </td>
                          <td className="px-6 py-3 text-gray-500">{l.categoriaFinanceira?.nome ?? "—"}</td>
                          <td className={`px-6 py-3 text-right tabular-nums font-medium ${v >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {v >= 0 ? "+" : "−"}{formatBRL(Math.abs(v))}
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
    </div>
  );
}
