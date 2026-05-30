"use client";

import { useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatCPFCNPJ, formatDate, formatBRL, decimalToNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

type PedidoRow  = { id: string; numero: string; status: string; dataEmissao: Date | string; valorTotal: unknown };
type ContaRow   = { id: string; numero: string; descricao: string; status: string; dataVencimento: Date | string; valorOriginal: unknown; valorPago: unknown };
type ComodatoMov = { id: string; itemId: string; tipo: "SAIDA" | "RETORNO"; quantidade: number; valorUnitario: number; item: { id: string; codigo: string; descricao: string } };

type ClienteDetailProps = {
  cliente: {
    id: string; tipoPessoa: string; razaoSocial: string; nomeFantasia: string | null;
    cpfCnpj: string | null; ie: string | null; email: string | null; telefone: string | null; celular: string | null;
    status: string; observacoes: string | null;
    cep: string | null; logradouro: string | null; numero: string | null;
    complemento: string | null; bairro: string | null; cidade: string | null; estado: string | null;
    pedidosVenda: PedidoRow[];
    contasReceber: ContaRow[];
  };
  comodato: ComodatoMov[];
};

function fmtNum(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || "—"}</p>
    </div>
  );
}

const STATUS_PEDIDO_COLOR: Record<string, string> = {
  ORCAMENTO:    "bg-gray-100 text-gray-600",
  CONFIRMADO:   "bg-blue-100 text-blue-700",
  EM_AGENDAMENTO: "bg-violet-100 text-violet-700",
  CONCLUIDO:      "bg-emerald-100 text-emerald-800",
  CANCELADO:      "bg-red-100 text-red-700",
};

const STATUS_PEDIDO_LABEL: Record<string, string> = {
  ORCAMENTO: "Orçamento", CONFIRMADO: "Confirmado", EM_AGENDAMENTO: "Em Agendamento",
  CONCLUIDO: "Concluído", CANCELADO: "Cancelado",
};

const STATUS_CONTA_COLOR: Record<string, string> = {
  ABERTA:   "bg-blue-100 text-blue-700",
  PAGA:     "bg-green-100 text-green-700",
  VENCIDA:  "bg-red-100 text-red-700",
  CANCELADA:"bg-gray-100 text-gray-500",
  PARCIAL:  "bg-amber-100 text-amber-700",
};

export default function ClienteDetail({ cliente, comodato }: ClienteDetailProps) {
  const [tab, setTab] = useState<"dados" | "pedidos" | "contas" | "comodato">("dados");
  useTabTitle(cliente.nomeFantasia || cliente.razaoSocial);

  const endereco = [
    cliente.logradouro,
    cliente.numero ? `nº ${cliente.numero}` : null,
    cliente.complemento,
    cliente.bairro,
    [cliente.cidade, cliente.estado].filter(Boolean).join("/"),
    cliente.cep,
  ].filter(Boolean).join(", ");

  // Saldo de comodato por item: SAÍDA soma (+), RETORNO subtrai (−).
  // Mantém só itens com saldo diferente de zero.
  const comodatoSaldos = (() => {
    const map = new Map<string, { itemId: string; item: ComodatoMov["item"]; qtd: number; valor: number }>();
    for (const m of comodato) {
      const sign = m.tipo === "SAIDA" ? 1 : -1;
      const cur = map.get(m.itemId) ?? { itemId: m.itemId, item: m.item, qtd: 0, valor: 0 };
      cur.qtd += sign * m.quantidade;
      cur.valor += sign * m.quantidade * m.valorUnitario;
      map.set(m.itemId, cur);
    }
    return Array.from(map.values()).filter((s) => Math.abs(s.qtd) > 0.0001 || Math.abs(s.valor) > 0.0001);
  })();
  const comodatoTotalQtd = comodatoSaldos.reduce((s, x) => s + x.qtd, 0);
  const comodatoTotalValor = comodatoSaldos.reduce((s, x) => s + x.valor, 0);

  const TABS = [
    { key: "dados",    label: "Dados Cadastrais" },
    { key: "pedidos",  label: `Pedidos de Venda (${cliente.pedidosVenda.length})` },
    { key: "contas",   label: `Contas a Receber (${cliente.contasReceber.length})` },
    { key: "comodato", label: `Saldo Comodato (${comodatoSaldos.length})` },
  ] as const;

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── DADOS CADASTRAIS ──────────────────────────────────────────── */}
      {tab === "dados" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-3xl">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificação</p>
          </div>
          <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
            <Field label="Tipo de Pessoa" value={cliente.tipoPessoa === "JURIDICA" ? "Pessoa Jurídica" : "Pessoa Física"} />
            <Field label={cliente.tipoPessoa === "FISICA" ? "CPF" : "CNPJ"} value={formatCPFCNPJ(cliente.cpfCnpj)} />
            <Field label="Razão Social" value={cliente.razaoSocial} />
            <Field label="Nome Fantasia" value={cliente.nomeFantasia} />
            {cliente.tipoPessoa === "JURIDICA" && (
              <Field label="Inscrição Estadual" value={cliente.ie} />
            )}
            <Field label="Status" value={cliente.status === "ATIVO" ? "Ativo" : cliente.status === "INATIVO" ? "Inativo" : "Prospecto"} />
          </div>

          <div className="px-5 py-3 border-t border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contato</p>
          </div>
          <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
            <Field label="E-mail" value={cliente.email} />
            <Field label="Telefone" value={cliente.telefone} />
            <Field label="Celular" value={cliente.celular} />
          </div>

          <div className="px-5 py-3 border-t border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Endereço</p>
          </div>
          <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
            <div className="col-span-2">
              <Field label="Endereço completo" value={endereco || null} />
            </div>
            <Field label="CEP" value={cliente.cep} />
            <Field label="Cidade / Estado" value={[cliente.cidade, cliente.estado].filter(Boolean).join(" / ") || null} />
          </div>

          {cliente.observacoes && (
            <>
              <div className="px-5 py-3 border-t border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Observações</p>
              </div>
              <div className="px-5 py-5">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{cliente.observacoes}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PEDIDOS DE VENDA ──────────────────────────────────────────── */}
      {tab === "pedidos" && (
        <div>
          {cliente.pedidosVenda.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <p className="font-medium">Nenhum pedido de venda</p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/pedidos-venda/novo">Novo Pedido</Link>
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Número</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cliente.pedidosVenda.map((p) => (
                    <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{p.numero}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(p.dataEmissao)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_PEDIDO_COLOR[p.status] ?? "bg-gray-100 text-gray-600")}>
                          {STATUS_PEDIDO_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatBRL(decimalToNumber(p.valorTotal))}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/pedidos-venda/${p.id}`} className="text-blue-500 hover:text-blue-700">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                {cliente.pedidosVenda.length} pedido{cliente.pedidosVenda.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONTAS A RECEBER ──────────────────────────────────────────── */}
      {tab === "contas" && (
        <div>
          {cliente.contasReceber.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <p className="font-medium">Nenhuma conta a receber</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Número</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Descrição</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Vencimento</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Valor</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Pago</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cliente.contasReceber.map((c) => (
                    <tr key={c.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{c.numero}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{c.descricao}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(c.dataVencimento)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_CONTA_COLOR[c.status] ?? "bg-gray-100 text-gray-600")}>
                          {c.status === "ABERTA" ? "Aberta" : c.status === "PAGA" ? "Paga" : c.status === "VENCIDA" ? "Vencida" : c.status === "PARCIAL" ? "Parcial" : c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{formatBRL(decimalToNumber(c.valorOriginal))}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">{formatBRL(decimalToNumber(c.valorPago))}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/contas-receber/${c.id}`} className="text-blue-500 hover:text-blue-700">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                {cliente.contasReceber.length} conta{cliente.contasReceber.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SALDO COMODATO ────────────────────────────────────────────── */}
      {tab === "comodato" && (
        <div>
          {comodatoSaldos.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <p className="font-medium">Nenhum saldo de comodato</p>
              <p className="text-xs mt-1">Este cliente não possui itens em comodato no momento.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Item em Comodato</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Saldo (Qtd)</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comodatoSaldos.map((s) => (
                    <tr key={s.itemId} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-gray-700">
                        <span className="font-mono text-xs font-semibold text-gray-500">{s.item.codigo}</span>
                        {" — "}{s.item.descricao}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{fmtNum(s.qtd)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{formatBRL(s.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-gray-700">Total em comodato</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(comodatoTotalQtd)}</td>
                    <td className="px-4 py-3 text-right">{formatBRL(comodatoTotalValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
