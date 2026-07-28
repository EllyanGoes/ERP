"use client";

// ── Parcelamentos (Contas a Pagar) ───────────────────────────────────────────
// Acompanhamento de TODOS os parcelamentos do CP em uma tela só: cada linha é
// um grupo (grupoParcelamentoId) com fornecedor, progresso pago, saldo e a
// próxima parcela; clicar na linha expande a grade completa de parcelas.
// Tela SÓ de leitura — baixa/edição continua na tela de Contas a Pagar.

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import EmpresaTag from "@/components/shared/EmpresaTag";
import StatusBadge from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  useFilterBar, FilterBarToggle, FilterBarChips, CHIP_TRIGGER, type FiltroChip,
} from "@/components/shared/FilterBar";
import { usePersistedState } from "@/lib/use-persisted-state";
import { formatBRL, formatDate, cn } from "@/lib/utils";
import { Search, ChevronRight, Layers, ListFilter } from "lucide-react";

type Parcela = {
  id: string;
  numero: string;
  parcelaNumero: number | null;
  dataVencimento: string | null;
  valorOriginal: number;
  valorPago: number;
  status: string;
  vencida: boolean;
};

type Parcelamento = {
  grupoId: string;
  empresaId: string;
  fornecedor: string | null;
  descricao: string;
  totalParcelas: number;
  parcelasPagas: number;
  valorTotal: number;
  valorPago: number;
  saldo: number;
  vencidasEmAberto: number;
  situacao: "EM_DIA" | "COM_VENCIDAS" | "QUITADO";
  proximaParcela: { parcelaNumero: number | null; dataVencimento: string | null; valor: number; vencida: boolean } | null;
  ultimaParcela: { parcelaNumero: number | null; dataVencimento: string | null } | null;
  parcelas: Parcela[];
};

type SituacaoFiltro = "TODAS" | "EM_DIA" | "COM_VENCIDAS" | "QUITADO";

const SITUACAO_LABEL: Record<SituacaoFiltro, string> = {
  TODAS: "Todas", EM_DIA: "Em dia", COM_VENCIDAS: "Com vencidas", QUITADO: "Quitados",
};

// Badge de situação do grupo reusando o vocabulário de cores do StatusBadge.
function SituacaoBadge({ situacao }: { situacao: Parcelamento["situacao"] }) {
  if (situacao === "QUITADO") return <StatusBadge status="PAGA" label="Quitado" />;
  if (situacao === "COM_VENCIDAS") return <StatusBadge status="VENCIDA" label="Com vencidas" />;
  return <StatusBadge status="A_VENCER" label="Em dia" />;
}

export default function ParcelamentosPage() {
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  // Filtros persistem por usuário (padrão da casa) — voltar à tela mantém a lente.
  const [busca, setBusca] = usePersistedState<string>("financeiro:parcelamentos:busca", "");
  const [situacao, setSituacao] = usePersistedState<SituacaoFiltro>("financeiro:parcelamentos:situacao", "TODAS");
  const bar = useFilterBar("financeiro:parcelamentos:filtros", ["situacao"]);

  useEffect(() => {
    fetch("/api/financeiro/parcelamentos")
      .then((r) => r.json())
      .then((j) => setParcelamentos(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return parcelamentos.filter((p) => {
      if (situacao !== "TODAS" && p.situacao !== situacao) return false;
      if (!q) return true;
      return (p.fornecedor ?? "").toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q);
    });
  }, [parcelamentos, busca, situacao]);

  const chips: FiltroChip[] = [
    {
      key: "situacao",
      label: "Situação",
      icon: <ListFilter className="w-3.5 h-3.5" />,
      ativo: situacao !== "TODAS",
      limpar: () => setSituacao("TODAS"),
      render: () => (
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as SituacaoFiltro)}
          className={cn(CHIP_TRIGGER, "border border-border bg-card font-medium", situacao !== "TODAS" && "border-blue-300 bg-info/10 text-info")}
          title="Filtrar por situação"
        >
          {(Object.keys(SITUACAO_LABEL) as SituacaoFiltro[]).map((k) => (
            <option key={k} value={k}>{k === "TODAS" ? "Situação: todas" : SITUACAO_LABEL[k]}</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Parcelamentos"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Parcelamentos" }]}
      />
      <div className="px-8 pb-8 space-y-3">
        {/* Toolbar: busca + funil de filtros + contador */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar fornecedor ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <FilterBarToggle bar={bar} chips={chips} />
          <span className="ml-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {filtrados.length} parcelamento{filtrados.length === 1 ? "" : "s"}
          </span>
        </div>
        <FilterBarChips bar={bar} chips={chips} />

        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          {loading ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">Carregando...</p>
          ) : filtrados.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">
              {parcelamentos.length === 0
                ? "Nenhum parcelamento encontrado no Contas a Pagar."
                : "Nenhum parcelamento casa com a busca/filtros."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 font-medium w-8" />
                  <th className="px-4 py-3 font-medium">Fornecedor / Descrição</th>
                  <th className="px-4 py-3 font-medium w-44">Progresso</th>
                  <th className="px-4 py-3 font-medium text-right">Valor total</th>
                  <th className="px-4 py-3 font-medium text-right">Pago</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo</th>
                  <th className="px-4 py-3 font-medium">Próxima parcela</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const aberto = expandido === p.grupoId;
                  const pct = p.totalParcelas > 0 ? Math.min(100, (p.parcelasPagas / p.totalParcelas) * 100) : 0;
                  return [
                    <tr
                      key={p.grupoId}
                      onClick={() => setExpandido(aberto ? null : p.grupoId)}
                      className={cn("border-b border-border cursor-pointer transition-colors", aberto ? "bg-primary/5" : "hover:bg-muted")}
                    >
                      <td className="pl-4 py-3">
                        <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", aberto && "rotate-90")} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{p.fornecedor ?? "—"}</p>
                          <EmpresaTag empresaId={p.empresaId} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-md" title={p.descricao}>{p.descricao}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-muted-foreground mb-1 tabular-nums">
                          {p.parcelasPagas}/{p.totalParcelas} pagas
                          {p.vencidasEmAberto > 0 && (
                            <span className="text-danger font-medium"> · {p.vencidasEmAberto} vencida{p.vencidasEmAberto === 1 ? "" : "s"}</span>
                          )}
                        </p>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", p.situacao === "QUITADO" ? "bg-success" : p.situacao === "COM_VENCIDAS" ? "bg-danger" : "bg-info")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatBRL(p.valorTotal)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-success">{formatBRL(p.valorPago)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatBRL(p.saldo)}</td>
                      <td className="px-4 py-3">
                        {p.proximaParcela ? (
                          <div className={cn("tabular-nums", p.proximaParcela.vencida ? "text-danger font-medium" : "text-foreground/80")}>
                            <p>
                              {p.proximaParcela.dataVencimento ? formatDate(p.proximaParcela.dataVencimento) : "Sem data"}
                              {p.proximaParcela.parcelaNumero != null && (
                                <span className="text-xs text-muted-foreground"> ({p.proximaParcela.parcelaNumero}/{p.totalParcelas})</span>
                              )}
                            </p>
                            <p className="text-xs">{formatBRL(p.proximaParcela.valor)}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><SituacaoBadge situacao={p.situacao} /></td>
                    </tr>,
                    // Detalhe expandido: grade completa das parcelas do grupo.
                    aberto && (
                      <tr key={`${p.grupoId}-det`} className="border-b border-border bg-muted/40">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="rounded-lg border border-border bg-card overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-muted-foreground border-b border-border bg-muted/60">
                                  <th className="px-4 py-2 font-medium">Nº</th>
                                  <th className="px-4 py-2 font-medium">Parcela</th>
                                  <th className="px-4 py-2 font-medium">Vencimento</th>
                                  <th className="px-4 py-2 font-medium text-right">Valor</th>
                                  <th className="px-4 py-2 font-medium text-right">Pago</th>
                                  <th className="px-4 py-2 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.parcelas.map((par) => (
                                  <tr key={par.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                                    <td className="px-4 py-2 text-foreground/80">{par.numero}</td>
                                    <td className="px-4 py-2 tabular-nums">
                                      {par.parcelaNumero != null ? `${par.parcelaNumero}/${p.totalParcelas}` : "—"}
                                    </td>
                                    <td className={cn("px-4 py-2 tabular-nums", par.vencida && "text-danger font-medium")}>
                                      {par.dataVencimento ? formatDate(par.dataVencimento) : "Sem data"}
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums">{formatBRL(par.valorOriginal)}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{par.valorPago > 0 ? formatBRL(par.valorPago) : "—"}</td>
                                    <td className="px-4 py-2">
                                      {/* Vencida é derivado (não é status do banco) — mesma lente da tela de CP */}
                                      <StatusBadge status={par.vencida ? "VENCIDA" : par.status} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {p.ultimaParcela?.dataVencimento && (
                            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5" />
                              Última parcela em {formatDate(p.ultimaParcela.dataVencimento)}
                            </p>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
