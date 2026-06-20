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
type ContaContabilResumo = {
  id: string; codigo: string; nome: string; natureza: "DEVEDORA" | "CREDORA"; grupo: "ATIVO" | "PASSIVO"; saldo: number;
  movimentos: { data: Date | string; historico: string; debito: number; credito: number; saldo: number }[];
};

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
  contaContabil?: string | null;
  contasContabeis?: ContaContabilResumo[];
};

function fmtNum(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

const STATUS_PEDIDO_COLOR: Record<string, string> = {
  ORCAMENTO:    "bg-muted text-muted-foreground",
  CONFIRMADO:   "bg-info/15 text-info",
  EM_AGENDAMENTO: "bg-violet-100 dark:bg-violet-500/25 text-violet-700 dark:text-violet-300",
  CONCLUIDO:      "bg-success/15 text-success",
  CANCELADO:      "bg-danger/15 text-danger",
};

const STATUS_PEDIDO_LABEL: Record<string, string> = {
  ORCAMENTO: "Orçamento", CONFIRMADO: "Confirmado", EM_AGENDAMENTO: "Em Agendamento",
  CONCLUIDO: "Concluído", CANCELADO: "Cancelado",
};

const STATUS_CONTA_COLOR: Record<string, string> = {
  ABERTA:   "bg-info/15 text-info",
  PAGA:     "bg-success/15 text-success",
  VENCIDA:  "bg-danger/15 text-danger",
  CANCELADA:"bg-muted text-muted-foreground",
  PARCIAL:  "bg-warning/15 text-warning",
};

export default function ClienteDetail({ cliente, comodato, contaContabil, contasContabeis = [] }: ClienteDetailProps) {
  const [tab, setTab] = useState<"dados" | "pedidos" | "contas" | "comodato" | "razao">("dados");
  useTabTitle(cliente.nomeFantasia || cliente.razaoSocial);

  const contaReceber = contasContabeis.find((c) => c.grupo === "ATIVO");
  const contaMaterial = contasContabeis.find((c) => c.grupo === "PASSIVO");
  const temRazonete = contasContabeis.some((c) => c.movimentos.length > 0);

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
    ...(temRazonete ? [{ key: "razao", label: "Razão Contábil" }] as const : []),
  ] as const;

  return (
    <div>
      {/* Cards de resumo das contas contábeis do cliente (visão rápida) */}
      {(contaReceber || contaMaterial) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {contaReceber && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-[200px]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contas a Receber</p>
              <p className={cn("text-lg font-bold tabular-nums", contaReceber.saldo < -0.005 ? "text-danger" : "text-foreground")}>{formatBRL(contaReceber.saldo)}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{contaReceber.codigo}</p>
            </div>
          )}
          {contaMaterial && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-[200px]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Material a Entregar</p>
              <p className={cn("text-lg font-bold tabular-nums", contaMaterial.saldo < -0.005 ? "text-danger" : "text-foreground")}>{formatBRL(contaMaterial.saldo)}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{contaMaterial.codigo}</p>
            </div>
          )}
        </div>
      )}
      {/* Tab bar */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-blue-600 text-info"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── DADOS CADASTRAIS ──────────────────────────────────────────── */}
      {tab === "dados" && (
        <div className="bg-card rounded-xl border border-border overflow-hidden max-w-3xl">
          <div className="px-5 py-3 border-b border-border bg-muted">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificação</p>
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
            <Field label="Conta Contábil (Clientes a Receber)" value={contaReceber ? `${contaReceber.codigo} — ${contaReceber.nome}` : contaContabil} />
            <Field label="Conta Material a Entregar" value={contaMaterial ? `${contaMaterial.codigo} — ${contaMaterial.nome}` : "—"} />
          </div>

          <div className="px-5 py-3 border-t border-b border-border bg-muted">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contato</p>
          </div>
          <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
            <Field label="E-mail" value={cliente.email} />
            <Field label="Telefone" value={cliente.telefone} />
            <Field label="Celular" value={cliente.celular} />
          </div>

          <div className="px-5 py-3 border-t border-b border-border bg-muted">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</p>
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
              <div className="px-5 py-3 border-t border-b border-border bg-muted">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observações</p>
              </div>
              <div className="px-5 py-5">
                <p className="text-sm text-foreground whitespace-pre-wrap">{cliente.observacoes}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PEDIDOS DE VENDA ──────────────────────────────────────────── */}
      {tab === "pedidos" && (
        <div>
          {cliente.pedidosVenda.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <p className="font-medium">Nenhum pedido de venda</p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/pedidos-venda/novo">Novo Pedido</Link>
              </Button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Número</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cliente.pedidosVenda.map((p) => (
                    <tr key={p.id} className="hover:bg-info/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{p.numero}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(p.dataEmissao)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_PEDIDO_COLOR[p.status] ?? "bg-muted text-muted-foreground")}>
                          {STATUS_PEDIDO_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatBRL(decimalToNumber(p.valorTotal))}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/pedidos-venda/${p.id}`} className="text-blue-500 hover:text-info">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-border bg-muted text-xs text-muted-foreground">
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
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <p className="font-medium">Nenhuma conta a receber</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Número</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Descrição</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Vencimento</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Pago</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cliente.contasReceber.map((c) => (
                    <tr key={c.id} className="hover:bg-info/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{c.numero}</td>
                      <td className="px-4 py-3 text-foreground max-w-[200px] truncate">{c.descricao}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(c.dataVencimento)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_CONTA_COLOR[c.status] ?? "bg-muted text-muted-foreground")}>
                          {c.status === "ABERTA" ? "Aberta" : c.status === "PAGA" ? "Paga" : c.status === "VENCIDA" ? "Vencida" : c.status === "PARCIAL" ? "Parcial" : c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatBRL(decimalToNumber(c.valorOriginal))}</td>
                      <td className="px-4 py-3 text-right text-success font-medium">{formatBRL(decimalToNumber(c.valorPago))}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/contas-receber/${c.id}`} className="text-blue-500 hover:text-info">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-border bg-muted text-xs text-muted-foreground">
                {cliente.contasReceber.length} conta{cliente.contasReceber.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RAZÃO CONTÁBIL ────────────────────────────────────────────── */}
      {tab === "razao" && (
        <div className="space-y-6">
          {contasContabeis.filter((c) => c.movimentos.length > 0).map((c) => (
            <div key={c.id} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{c.codigo}</span>{c.nome}
                </span>
                <Link href={`/contabilidade/razao/${c.id}`} className="text-xs text-info hover:underline inline-flex items-center gap-1">
                  Abrir no Razão <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium w-24">Data</th>
                    <th className="text-left px-4 py-2 font-medium">Descrição</th>
                    <th className="text-right px-4 py-2 font-medium w-28">Débito</th>
                    <th className="text-right px-4 py-2 font-medium w-28">Crédito</th>
                    <th className="text-right px-4 py-2 font-medium w-28">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {c.movimentos.map((m, i) => (
                    <tr key={i} className="hover:bg-info/10">
                      <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap">{formatDate(m.data)}</td>
                      <td className="px-4 py-1.5 text-foreground">{m.historico}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-info">{m.debito ? formatBRL(m.debito) : "—"}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-warning">{m.credito ? formatBRL(m.credito) : "—"}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-medium text-foreground">{formatBRL(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted font-semibold">
                  <tr>
                    <td className="px-4 py-2 text-foreground" colSpan={4}>Saldo final</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBRL(c.saldo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── SALDO COMODATO ────────────────────────────────────────────── */}
      {tab === "comodato" && (
        <div>
          {comodatoSaldos.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <p className="font-medium">Nenhum saldo de comodato</p>
              <p className="text-xs mt-1">Este cliente não possui itens em comodato no momento.</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Item em Comodato</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Saldo (Qtd)</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comodatoSaldos.map((s) => (
                    <tr key={s.itemId} className="hover:bg-info/10 transition-colors">
                      <td className="px-4 py-3 text-foreground">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">{s.item.codigo}</span>
                        {" — "}{s.item.descricao}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{fmtNum(s.qtd)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatBRL(s.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-semibold">
                    <td className="px-4 py-3 text-foreground">Total em comodato</td>
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
