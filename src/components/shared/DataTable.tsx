"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender,
  type ColumnDef, type SortingState, type FilterFn, type Row,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, ArrowUpDown } from "lucide-react";
import ColumnConfigurator from "@/components/shared/ColumnConfigurator";

const LINHAS_OPCOES = [10, 20, 50, 100, 200];

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  // Filtro de busca customizado (ex.: casar CPF/CNPJ ignorando pontuação).
  globalFilterFn?: FilterFn<T>;
  // Rastreabilidade: id da linha a destacar (rola até ela, vai pra página dela e
  // pisca o destaque). Requer getRowId para casar a linha pelo id do registro.
  focusId?: string | null;
  getRowId?: (row: T) => string;
  // Esconde a busca interna — a tela renderiza a busca na própria barra de
  // filtros e entrega `data` já filtrado.
  hideSearch?: boolean;
  // Classe extra no container da tabela (ex.: sombra para destacar do fundo).
  containerClassName?: string;
  // Classe extra na linha de cabeçalho (ex.: bg-muted no padrão das listagens).
  headerClassName?: string;
  // Habilita o botão "Colunas" (reordenar/ocultar, persistido por tela).
  columnConfig?: boolean;
  // Substantivo do contador de linhas (singular; pluraliza com "s").
  // Ex.: "título" → "101 títulos". Padrão: "registro".
  itemLabel?: string;
  // Agrupamento nativo (opcional): retorna o grupo de cada linha. Quando
  // definido, a tabela insere cabeçalhos de grupo e ordena as linhas por grupo
  // (mantendo o sort de coluna dentro do grupo). null desativa por linha.
  groupBy?: (row: T) => GroupInfo | null;
  // Conteúdo do cabeçalho de grupo (recebe as linhas COMPLETAS do grupo, não só
  // as da página). Padrão: rótulo + contagem.
  renderGroupHeader?: (info: { key: string; label: string; rows: T[] }) => React.ReactNode;
}

export type GroupInfo = { key: string; label: string; ordem?: number | string };

// Id estável de uma coluna do tanstack (id explícito ou accessorKey).
function colId<T>(c: ColumnDef<T>): string {
  return c.id ?? String((c as { accessorKey?: string }).accessorKey ?? "");
}

export default function DataTable<T>({ data, columns, searchPlaceholder = "Buscar...", isLoading, onRowClick, globalFilterFn, focusId, getRowId, hideSearch, containerClassName, headerClassName, columnConfig, itemLabel = "registro", groupBy, renderGroupHeader }: DataTableProps<T>) {
  const pathname = usePathname();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Linhas por página: escolha do usuário persistida por tela (padrão do sistema).
  const [pageSize, setPageSize] = usePersistedState<number>(`datatable:${pathname}:linhas`, 20);

  // ── Configuração de colunas (ordem + visibilidade), persistida por tela ────
  // Configuráveis = colunas com header de texto; as demais (ex.: ações, header
  // vazio) são fixas: sempre visíveis, mantidas ao final na ordem original.
  const configuraveis = columns.filter((c) => colId(c) && typeof c.header === "string" && c.header);
  const fixas = columns.filter((c) => !configuraveis.includes(c));
  const allColIds = configuraveis.map(colId);
  const [colOrder, setColOrder] = usePersistedState<string[]>(`datatable:${pathname}:col-ordem`, allColIds);
  const [colVis, setColVis] = usePersistedState<Record<string, boolean>>(`datatable:${pathname}:col-vis`, {});
  // Ordem efetiva: a persistida (só ids que ainda existem) + colunas novas no fim.
  const ordemEfetiva = [
    ...colOrder.filter((id) => allColIds.includes(id)),
    ...allColIds.filter((id) => !colOrder.includes(id)),
  ];
  const visiveisOrdenadas = ordemEfetiva
    .filter((id) => colVis[id] !== false)
    .map((id) => configuraveis.find((c) => colId(c) === id))
    .filter((c): c is ColumnDef<T> => !!c);
  const colunasAtivas = columnConfig
    // Nunca renderizar tabela sem colunas de dados (tudo oculto → mostra todas).
    ? [...(visiveisOrdenadas.length > 0 ? visiveisOrdenadas : configuraveis), ...fixas]
    : columns;

  const table = useReactTable({
    data,
    columns: colunasAtivas,
    state: { sorting, globalFilter },
    ...(globalFilterFn ? { globalFilterFn } : {}),
    ...(getRowId ? { getRowId: (orig: T) => getRowId(orig) } : {}),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Sem auto-reset: um router.refresh (pagar, editar…) não volta p/ a página 1.
    // Quando o universo de linhas encolhe, o clamp abaixo corrige o índice.
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize } },
  });

  // Aplica a escolha de linhas por página (idempotente — só quando muda de fato,
  // para não recriar o estado de paginação a cada render).
  const curPageSize = table.getState().pagination.pageSize;
  useEffect(() => {
    if (curPageSize !== pageSize) table.setPageSize(pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, curPageSize]);

  // Página atual persistida POR ROTA (padrão do sistema: voltar para a tela
  // devolve o usuário à página em que estava). O valor salvo é capturado no
  // mount ANTES de qualquer gravação e aplicado quando os dados chegam (para
  // clampar contra o total real; em telas async os dados chegam depois).
  const pagKey = `erp:datatable-pagina:${pathname}`;
  const pagSalva = useRef(0);
  const pagRestaurada = useRef(false);
  useEffect(() => {
    try { pagSalva.current = Math.max(0, Number(sessionStorage.getItem(pagKey)) || 0); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (pagRestaurada.current || data.length === 0) return;
    pagRestaurada.current = true;
    if (pagSalva.current > 0) table.setPageIndex(Math.min(pagSalva.current, Math.max(0, table.getPageCount() - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const pageIndex = table.getState().pagination.pageIndex;
  useEffect(() => {
    if (!pagRestaurada.current) return;
    try { sessionStorage.setItem(pagKey, String(pageIndex)); } catch { /* ignore */ }
  }, [pagKey, pageIndex]);
  // Clamp: busca/refresh podem encolher o total de páginas.
  const pageCount = table.getPageCount();
  useEffect(() => {
    const max = Math.max(0, pageCount - 1);
    if (pageIndex > max) table.setPageIndex(max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount, pageIndex]);

  // Destaca e rola até a linha alvo (vinda de um link de rastreabilidade).
  useEffect(() => {
    if (!focusId || !getRowId) return;
    const rows = table.getSortedRowModel().rows;
    const idx = rows.findIndex((r) => r.id === focusId);
    if (idx < 0) return;
    const pageSize = table.getState().pagination.pageSize;
    table.setPageIndex(Math.floor(idx / pageSize));
    setHighlightId(focusId);
    const tScroll = setTimeout(() => {
      document.querySelector(`[data-rowid="${CSS.escape(focusId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    const tClear = setTimeout(() => setHighlightId(null), 4500);
    return () => { clearTimeout(tScroll); clearTimeout(tClear); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, data]);

  // ── Agrupamento nativo (só quando groupBy é fornecido) ────────────────────
  // Reordena as linhas (já filtradas/ordenadas) por grupo e pagina a lista
  // achatada por pageIndex/pageSize — os cabeçalhos de grupo entram no render.
  const pageIndexCur = table.getState().pagination.pageIndex;
  const pageSizeCur = table.getState().pagination.pageSize;
  const sortedRows = table.getSortedRowModel().rows;
  const grupos = groupBy ? (() => {
    const keyRows = new Map<string, Row<T>[]>();
    const keyLabel = new Map<string, string>();
    const keyOrdem = new Map<string, string | number>();
    for (const r of sortedRows) {
      const g = groupBy(r.original) ?? { key: "—", label: "—" };
      if (!keyRows.has(g.key)) { keyRows.set(g.key, []); keyLabel.set(g.key, g.label); keyOrdem.set(g.key, g.ordem ?? g.label); }
      keyRows.get(g.key)!.push(r);
    }
    const ordered = Array.from(keyRows.keys()).sort((a, b) => {
      const oa = keyOrdem.get(a)!, ob = keyOrdem.get(b)!;
      return (typeof oa === "number" && typeof ob === "number") ? oa - ob : String(oa).localeCompare(String(ob), "pt-BR");
    });
    const flat = ordered.flatMap((k) => keyRows.get(k)!);
    return { keyRows, keyLabel, pageRows: flat.slice(pageIndexCur * pageSizeCur, pageIndexCur * pageSizeCur + pageSizeCur) };
  })() : null;

  // Renderiza uma linha de dados (reusada no modo normal e no agrupado).
  const renderRow = (row: Row<T>) => (
    <TableRow
      key={row.id}
      data-rowid={row.id}
      className={`border-b border-border transition-colors ${highlightId === row.id ? "bg-primary/15 ring-2 ring-inset ring-primary" : onRowClick ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted"}`}
      onClick={onRowClick ? (e) => {
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        onRowClick(row.original);
      } : undefined}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cn(
            "py-3 text-sm text-foreground/80",
            (cell.column.columnDef.meta as { className?: string; tdClass?: string } | undefined)?.className,
            (cell.column.columnDef.meta as { className?: string; tdClass?: string } | undefined)?.tdClass,
            (cell.column.columnDef.meta as { stickyRight?: boolean } | undefined)?.stickyRight &&
              "sticky right-0 z-10 bg-card shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)]",
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );

  const linhaVazia = (
    <TableRow>
      <TableCell colSpan={colunasAtivas.length} className="text-center py-12 text-muted-foreground">
        Nenhum registro encontrado
      </TableCell>
    </TableRow>
  );

  const seletorLinhas = (
    <select
      value={pageSize}
      onChange={(e) => setPageSize(Number(e.target.value))}
      className="h-8 rounded-md border border-border bg-card px-1.5 text-xs text-muted-foreground"
      title="Linhas por página"
    >
      {LINHAS_OPCOES.map((n) => <option key={n} value={n}>{n} por página</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Barra superior: busca à esquerda (quando visível) e o seletor de linhas
          por página no canto superior direito da tabela. */}
      <div className="flex items-center gap-2">
        {!hideSearch && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {table.getFilteredRowModel().rows.length} {itemLabel}{table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
          </span>
          {seletorLinhas}
          {columnConfig && (
            <ColumnConfigurator
              columns={configuraveis.map((c) => ({
                id: colId(c),
                label: String(c.header),
              }))}
              order={ordemEfetiva}
              onOrderChange={setColOrder}
              visibility={colVis}
              onVisibilityChange={(id, visible) => setColVis((prev) => ({ ...prev, [id]: visible }))}
              onShowAll={() => setColVis({})}
            />
          )}
        </div>
      </div>
      <div className={cn("rounded-lg border border-border bg-card overflow-x-auto", containerClassName)}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className={cn("hover:bg-transparent border-b border-border", headerClassName)}>
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "text-xs font-medium text-muted-foreground uppercase tracking-wide py-3",
                      (header.column.columnDef.meta as { className?: string; thClass?: string } | undefined)?.className,
                      (header.column.columnDef.meta as { className?: string; thClass?: string } | undefined)?.thClass,
                      // Coluna congelada à direita (ex.: ações ⋮) — precisa de fundo
                      // opaco igual ao do cabeçalho p/ o conteúdo não vazar por baixo.
                      (header.column.columnDef.meta as { stickyRight?: boolean } | undefined)?.stickyRight &&
                        "sticky right-0 z-10 bg-muted shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)]",
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {colunasAtivas.map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : grupos ? (
              // ── Modo agrupado: cabeçalho de grupo + linhas, paginado ──────────
              grupos.pageRows.length ? (() => {
                const out: React.ReactNode[] = [];
                let prev: string | null = null;
                for (const row of grupos.pageRows) {
                  const g = groupBy!(row.original) ?? { key: "—", label: "—" };
                  if (g.key !== prev) {
                    prev = g.key;
                    const rowsG = (grupos.keyRows.get(g.key) ?? []).map((r) => r.original);
                    out.push(
                      <TableRow key={`grp-${g.key}`} className="bg-muted hover:bg-muted border-y border-border">
                        <TableCell colSpan={colunasAtivas.length} className="py-2">
                          {renderGroupHeader ? renderGroupHeader({ key: g.key, label: g.label, rows: rowsG }) : (
                            <span className="font-semibold text-sm text-foreground">{g.label}<span className="text-xs font-normal text-muted-foreground"> · {rowsG.length}</span></span>
                          )}
                        </TableCell>
                      </TableRow>,
                    );
                  }
                  out.push(renderRow(row));
                }
                return out;
              })() : linhaVazia
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(renderRow)
            ) : (
              linhaVazia
            )}
          </TableBody>
        </Table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{table.getFilteredRowModel().rows.length} registros</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
