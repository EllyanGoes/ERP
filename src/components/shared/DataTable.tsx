"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender,
  type ColumnDef, type SortingState, type FilterFn,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, ArrowUpDown } from "lucide-react";

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
}

export default function DataTable<T>({ data, columns, searchPlaceholder = "Buscar...", isLoading, onRowClick, globalFilterFn, focusId, getRowId, hideSearch, containerClassName, headerClassName }: DataTableProps<T>) {
  const pathname = usePathname();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Linhas por página: escolha do usuário persistida por tela (padrão do sistema).
  const [pageSize, setPageSize] = usePersistedState<number>(`datatable:${pathname}:linhas`, 20);

  const table = useReactTable({
    data,
    columns,
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
            {table.getFilteredRowModel().rows.length} registro(s)
          </span>
          {seletorLinhas}
        </div>
      </div>
      <div className={cn("rounded-lg border border-border bg-card overflow-x-auto", containerClassName)}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className={cn("hover:bg-transparent border-b border-border", headerClassName)}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-medium text-muted-foreground uppercase tracking-wide py-3">
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
                  {columns.map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
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
                    <TableCell key={cell.id} className="py-3 text-sm text-foreground/80">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
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
