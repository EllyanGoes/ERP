"use client";

// ── Parcelamentos (Contas a Pagar) ───────────────────────────────────────────
// Acompanhamento de TODOS os parcelamentos do CP em uma tela só: cada linha é
// um grupo (grupoParcelamentoId) com fornecedor, progresso pago, saldo e a
// próxima parcela; clicar na linha abre o POPUP com a grade de parcelas.
// Tela SÓ de leitura — baixa/edição continua na tela de Contas a Pagar.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/shared/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import EmpresaTag from "@/components/shared/EmpresaTag";
import StatusBadge from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useFilterBar, FilterBarToggle, FilterBarChips, CHIP_TRIGGER, type FiltroChip,
} from "@/components/shared/FilterBar";
import { usePersistedState, useSessionState } from "@/lib/use-persisted-state";
import { formatBRL, formatDate, cn } from "@/lib/utils";
import { Search, Layers, ListFilter, ChevronLeft, ChevronRight } from "lucide-react";

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
  origem: { label: string; ref: string | null; deId: string | null };
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
  const router = useRouter();
  // Recorte por MÊS (padrão CP): parcelamentos com parcela no mês + carry-over
  // vencido em aberto; "TODOS" desliga. Abre no mês corrente.
  const [mes, setMes] = useSessionState<string>("financeiro:parcelamentos:mes", () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const mudarMes = (delta: number) => setMes((m) => {
    if (m === "TODOS") return m;
    const [a, mm] = m.split("-").map(Number);
    const d = new Date(a, mm - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [loading, setLoading] = useState(true);
  // Parcelamento clicado → popup com a grade completa das parcelas.
  const [detalhe, setDetalhe] = useState<Parcelamento | null>(null);

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
    // Recorte de mês: fica quem tem parcela EM ABERTO no mês selecionado ou
    // vencida antes dele (carry-over) — mesmo espírito do Contas a Pagar.
    const passaMes = (p: Parcelamento): boolean => {
      if (mes === "TODOS") return true;
      const ini = `${mes}-01`, fim = `${mes}-31`;
      return p.parcelas.some((par) => {
        if (par.status !== "ABERTA" && par.status !== "PARCIAL") return false;
        const iso = par.dataVencimento ? par.dataVencimento.slice(0, 10) : "";
        return !iso || iso <= fim; // do mês, vencida antes ou sem data
      }) && p.parcelas.some((par) => {
        const iso = par.dataVencimento ? par.dataVencimento.slice(0, 10) : "";
        return (iso >= ini && iso <= fim) || (par.vencida && (par.status === "ABERTA" || par.status === "PARCIAL"));
      });
    };
    return parcelamentos.filter((p) => {
      if (situacao !== "TODAS" && p.situacao !== situacao) return false;
      if (!passaMes(p)) return false;
      if (!q) return true;
      return (p.fornecedor ?? "").toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q);
    });
  }, [parcelamentos, busca, situacao, mes]);

  // SALDO de todos os parcelamentos (imune a filtros) — bloco ao lado do mês.
  const saldoTotal = useMemo(() => parcelamentos.reduce((s, p) => s + p.saldo, 0), [parcelamentos]);

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


  // Colunas no MESMO padrão da planilha do CP (DataTable).
  const colunas: ColumnDef<Parcelamento>[] = [
    { id: "fornecedor", header: "Fornecedor / Descrição", cell: ({ row }) => (
      <div>
        <div className="flex items-center gap-2">
          <EmpresaTag empresaId={row.original.empresaId} />
          <p className="font-medium text-foreground">{row.original.fornecedor ?? "—"}</p>
        </div>
        <p className="text-xs text-muted-foreground truncate max-w-md" title={row.original.descricao}>{row.original.descricao}</p>
      </div>
    ) },
    { id: "progresso", header: "Progresso", cell: ({ row }) => {
      const p = row.original;
      const pct = p.totalParcelas > 0 ? Math.min(100, (p.parcelasPagas / p.totalParcelas) * 100) : 0;
      return (
        <div className="w-40">
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
        </div>
      );
    } },
    { id: "origem", header: "Origem", accessorFn: (p) => p.origem.label, cell: ({ row }) => {
      const o = row.original.origem;
      if (o.deId) {
        return (
          <button type="button" className="font-mono text-xs font-semibold text-info hover:underline"
            onClick={(e) => { e.stopPropagation(); router.push(`/suprimentos/conferencias/${o.deId}`); }}
            title="Abrir o Documento de Entrada">
            {o.ref}
          </button>
        );
      }
      return <span className="text-muted-foreground">{o.ref ?? o.label}</span>;
    } },
    { id: "valorTotal", header: "Valor total", accessorFn: (p) => p.valorTotal, meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums">{formatBRL(row.original.valorTotal)}</span> },
    { id: "pago", header: "Pago", accessorFn: (p) => p.valorPago, meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums text-success">{formatBRL(row.original.valorPago)}</span> },
    { id: "saldo", header: "Saldo", accessorFn: (p) => p.saldo, meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums font-semibold">{formatBRL(row.original.saldo)}</span> },
    { id: "proxima", header: "Próxima parcela", accessorFn: (p) => p.proximaParcela?.dataVencimento ?? "", cell: ({ row }) => {
      const p = row.original;
      if (!p.proximaParcela) return <span className="text-muted-foreground">—</span>;
      return (
        <div className={cn("tabular-nums", p.proximaParcela.vencida ? "text-danger font-medium" : "text-foreground/80")}>
          <p>
            {p.proximaParcela.dataVencimento ? formatDate(p.proximaParcela.dataVencimento) : "Sem data"}
            {p.proximaParcela.parcelaNumero != null && (
              <span className="text-xs text-muted-foreground"> ({p.proximaParcela.parcelaNumero}/{p.totalParcelas})</span>
            )}
          </p>
          <p className="text-xs">{formatBRL(p.proximaParcela.valor)}</p>
        </div>
      );
    } },
    { id: "situacao", header: "Situação", accessorFn: (p) => p.situacao,
      cell: ({ row }) => <SituacaoBadge situacao={row.original.situacao} /> },
  ];


  // Blocos de TOTAIS (padrão CP): parcelas em aberto VENCIDAS e as A VENCER no
  // mês corrente — contagem + saldo, na barra da tabela (toolbarLeft). São
  // CLICÁVEIS como no CP: alternam o filtro de situação (clicar de novo limpa).
  const blocosTotais = (() => {
    let vencidasQtd = 0, vencidasVal = 0, mesQtd = 0, mesVal = 0;
    const ini = mes === "TODOS" ? "" : `${mes}-01`;
    const fim = mes === "TODOS" ? "9999" : `${mes}-31`;
    for (const g of parcelamentos) {
      for (const par of g.parcelas) {
        if (par.status !== "ABERTA" && par.status !== "PARCIAL") continue;
        const saldo = Math.max(0, par.valorOriginal - par.valorPago);
        if (par.vencida) { vencidasQtd++; vencidasVal += saldo; continue; }
        const iso = par.dataVencimento ? par.dataVencimento.slice(0, 10) : "";
        if (iso >= ini && iso <= fim) { mesQtd++; mesVal += saldo; }
      }
    }
    const toggle = (s: SituacaoFiltro) => setSituacao((cur) => (cur === s ? "TODAS" : s));
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => toggle("COM_VENCIDAS")} title="Filtrar parcelamentos com parcelas vencidas"
          className={cn("inline-flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-1.5 transition-shadow hover:bg-danger/20 cursor-pointer", situacao === "COM_VENCIDAS" && "ring-2 ring-danger")}>
          <span className="text-xs font-medium text-danger">Vencidas · {vencidasQtd}</span>
          <span className="text-sm font-bold text-danger tabular-nums">{formatBRL(vencidasVal)}</span>
        </button>
        <button type="button" onClick={() => toggle("EM_DIA")} title="Filtrar parcelamentos em dia"
          className={cn("inline-flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-1.5 transition-shadow hover:bg-sky-500/20 cursor-pointer", situacao === "EM_DIA" && "ring-2 ring-sky-500")}>
          <span className="text-xs font-medium text-sky-700 dark:text-sky-300">A vencer · {mesQtd}</span>
          <span className="text-sm font-bold text-sky-700 dark:text-sky-300 tabular-nums">{formatBRL(mesVal)}</span>
        </button>
      </div>
    );
  })();

  return (
    <div>
      <div className="px-8 pt-4 pb-8 space-y-2">
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
          {/* Navegador de MÊS (padrão CP): clicar no rótulo alterna Todos ↔ atual. */}
          <div className="inline-flex items-center h-9 rounded-lg border border-border bg-card overflow-hidden shrink-0">
            <button type="button" onClick={() => mudarMes(-1)} disabled={mes === "TODOS"}
              className="h-full px-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" title="Mês anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button"
              onClick={() => setMes((m) => m === "TODOS"
                ? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
                : "TODOS")}
              title="Mês do vencimento das parcelas — inclui o vencido em aberto. Clique para alternar Todos ↔ mês atual."
              className="h-full px-2 min-w-[6.5rem] text-xs font-medium text-foreground hover:bg-muted capitalize">
              {mes === "TODOS" ? "Todos os meses" : (() => {
                const [a, m] = mes.split("-").map(Number);
                return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              })()}
            </button>
            <button type="button" onClick={() => mudarMes(1)} disabled={mes === "TODOS"}
              className="h-full px-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" title="Próximo mês">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {/* SALDO de todos os parcelamentos — não muda com mês/filtros. */}
          <div className="inline-flex items-center gap-2 h-9 rounded-lg bg-muted px-3 shrink-0"
            title="Saldo em aberto de todos os parcelamentos (não muda com mês/filtros)">
            <span className="text-xs font-medium text-foreground">Saldo</span>
            <span className="text-sm font-bold text-foreground tabular-nums">{formatBRL(saldoTotal)}</span>
          </div>
          <div className="flex-1" />
          {/* Funil à direita (padrão CP): mostra/esconde os chips de filtro. */}
          <FilterBarToggle bar={bar} chips={chips} />
        </div>
        <FilterBarChips bar={bar} chips={chips} />

        {loading ? (
          <p className="px-6 py-10 text-sm text-muted-foreground text-center">Carregando...</p>
        ) : (
          /* Mesma planilha do Contas a Pagar (DataTable): colunas configuráveis,
             ordenação pelo cabeçalho, paginação persistida. Sem coluna de seta —
             clicar na LINHA abre o popup do parcelamento. */
          <DataTable
            data={filtrados}
            columns={colunas}
            hideSearch
            columnConfig
            itemLabel="parcelamento"
            toolbarLeft={blocosTotais}
            containerClassName="shadow-md rounded-xl"
            headerClassName="bg-muted"
            getRowId={(x) => x.grupoId}
            onRowClick={(x) => setDetalhe(x)}
          />
        )}
      </div>

      {/* POPUP do parcelamento: grade completa das parcelas do grupo. */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="w-[min(60rem,calc(100vw-2rem))] sm:max-w-none max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{detalhe?.fornecedor ?? "—"}</span>
              <EmpresaTag empresaId={detalhe?.empresaId} />
              {detalhe && <SituacaoBadge situacao={detalhe.situacao} />}
            </DialogTitle>
            {detalhe && (
              <p className="text-sm text-muted-foreground">
                {detalhe.descricao} · {detalhe.parcelasPagas}/{detalhe.totalParcelas} pagas · saldo {formatBRL(detalhe.saldo)}
                {" · "}Origem: {detalhe.origem.label}
                {detalhe.origem.deId ? (
                  <>
                    {" "}
                    <button type="button" className="font-mono text-xs font-semibold text-info hover:underline align-baseline"
                      onClick={() => router.push(`/suprimentos/conferencias/${detalhe.origem.deId}`)}>
                      {detalhe.origem.ref}
                    </button>
                  </>
                ) : detalhe.origem.ref ? ` · ${detalhe.origem.ref}` : null}
              </p>
            )}
          </DialogHeader>
          {detalhe && (
            <>
              <div className="rounded-lg border border-border overflow-hidden">
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
                    {detalhe.parcelas.map((par) => (
                      <tr key={par.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2">
                          {/* Nº clicável: abre o título na tela de Contas a Pagar (?abrir=id). */}
                          <button type="button" className="font-mono text-xs font-semibold text-info hover:underline"
                            onClick={() => router.push(`/contas-pagar?abrir=${par.id}`)}>
                            {par.numero}
                          </button>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {par.parcelaNumero != null ? `${par.parcelaNumero}/${detalhe.totalParcelas}` : "—"}
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
              {detalhe.ultimaParcela?.dataVencimento && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Última parcela em {formatDate(detalhe.ultimaParcela.dataVencimento)}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
