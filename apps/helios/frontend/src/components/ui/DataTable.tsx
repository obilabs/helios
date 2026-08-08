import { useState, useRef, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  RowSelectionState,
  Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import './DataTable.css';

export { createColumnHelper };
export type { ColumnDef, Row };

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  onRowClick?: (row: T) => void;
  enableVirtualization?: boolean;
  enableColumnResizing?: boolean;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enableRowSelection?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
  rowHeight?: number;
  maxHeight?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  // Column visibility
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  // Row selection
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  // Global filter
  globalFilter?: string;
  onGlobalFilterChange?: (filter: string) => void;
  // Unique row ID
  getRowId?: (row: T) => string;
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  enableVirtualization = false,
  enableColumnResizing = true,
  enableSorting = true,
  enableFiltering = false,
  enableRowSelection = false,
  enablePagination = false,
  pageSize = 25,
  rowHeight = 48,
  maxHeight = '600px',
  emptyMessage = 'No data available',
  isLoading = false,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  globalFilter,
  onGlobalFilterChange,
  getRowId,
}: DataTableProps<T>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Internal state (used when external state not provided)
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalColumnVisibility, setInternalColumnVisibility] = useState<VisibilityState>({});
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('');

  // Use external or internal state
  const effectiveColumnVisibility = columnVisibility ?? internalColumnVisibility;
  const effectiveRowSelection = rowSelection ?? internalRowSelection;
  const effectiveGlobalFilter = globalFilter ?? internalGlobalFilter;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: internalSorting,
      columnFilters: internalColumnFilters,
      columnVisibility: effectiveColumnVisibility,
      rowSelection: effectiveRowSelection,
      globalFilter: effectiveGlobalFilter,
    },
    onSortingChange: setInternalSorting,
    onColumnFiltersChange: setInternalColumnFilters,
    onColumnVisibilityChange: (updater) => {
      const newValue = typeof updater === 'function' ? updater(effectiveColumnVisibility) : updater;
      if (onColumnVisibilityChange) {
        onColumnVisibilityChange(newValue);
      } else {
        setInternalColumnVisibility(newValue);
      }
    },
    onRowSelectionChange: (updater) => {
      const newValue = typeof updater === 'function' ? updater(effectiveRowSelection) : updater;
      if (onRowSelectionChange) {
        onRowSelectionChange(newValue);
      } else {
        setInternalRowSelection(newValue);
      }
    },
    onGlobalFilterChange: onGlobalFilterChange ?? setInternalGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    columnResizeMode: enableColumnResizing ? 'onChange' : undefined,
    enableRowSelection,
    getRowId: getRowId ?? ((row: any) => row.id),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  const { rows } = table.getRowModel();

  // Virtual scrolling setup
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    enabled: enableVirtualization,
  });

  const virtualRows = enableVirtualization ? rowVirtualizer.getVirtualItems() : null;
  const totalSize = enableVirtualization ? rowVirtualizer.getTotalSize() : 0;

  // Calculate column sizes for CSS
  const columnSizeVars = useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: Record<string, number> = {};
    for (const header of headers) {
      colSizes[`--header-${header.id}-size`] = header.getSize();
      colSizes[`--col-${header.column.id}-size`] = header.column.getSize();
    }
    return colSizes;
  }, [table.getState().columnSizing]);

  // Handle row click
  const handleRowClick = useCallback(
    (row: Row<T>) => {
      if (onRowClick) {
        onRowClick(row.original);
      }
    },
    [onRowClick]
  );

  // Render loading state
  if (isLoading) {
    return (
      <div className="data-table-loading">
        <div className="loading-spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  // Render empty state
  if (data.length === 0) {
    return (
      <div className="data-table-empty">
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="data-table-wrapper">
      <div
        ref={tableContainerRef}
        className="data-table-container"
        style={{ maxHeight, ...columnSizeVars } as React.CSSProperties}
      >
        <table className="data-table">
          <thead className="data-table-header">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`data-table-th ${header.column.getCanSort() ? 'sortable' : ''}`}
                    style={{
                      width: `calc(var(--header-${header.id}-size) * 1px)`,
                      minWidth: header.column.columnDef.minSize,
                      maxWidth: header.column.columnDef.maxSize,
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="th-content">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="sort-indicator">
                          {{
                            asc: <ChevronUp size={14} />,
                            desc: <ChevronDown size={14} />,
                          }[header.column.getIsSorted() as string] ?? <ChevronsUpDown size={12} className="sort-inactive" />}
                        </span>
                      )}
                    </div>
                    {/* Column resizer */}
                    {enableColumnResizing && (
                      <div
                        className={`column-resizer ${header.column.getIsResizing() ? 'resizing' : ''}`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody
            className="data-table-body"
            style={
              enableVirtualization
                ? {
                    height: `${totalSize}px`,
                    position: 'relative',
                  }
                : undefined
            }
          >
            {enableVirtualization && virtualRows
              ? virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      className={`data-table-row ${onRowClick ? 'clickable' : ''} ${row.getIsSelected() ? 'selected' : ''}`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                      }}
                      onClick={() => handleRowClick(row)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="data-table-td"
                          style={{
                            width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                            minWidth: cell.column.columnDef.minSize,
                            maxWidth: cell.column.columnDef.maxSize,
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`data-table-row ${onRowClick ? 'clickable' : ''} ${row.getIsSelected() ? 'selected' : ''}`}
                    style={{ height: `${rowHeight}px` }}
                    onClick={() => handleRowClick(row)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="data-table-td"
                        style={{
                          width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                          minWidth: cell.column.columnDef.minSize,
                          maxWidth: cell.column.columnDef.maxSize,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {enablePagination && (
        <div className="data-table-pagination">
          <div className="pagination-info">
            <span>Rows per page:</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="pagination-status">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}{' '}
            of {table.getFilteredRowModel().rows.length}
          </div>
          <div className="pagination-controls">
            <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              «
            </button>
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              ‹
            </button>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              ›
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility: Selection checkbox column
export function createSelectionColumn<T>(): ColumnDef<T, any> {
  return {
    id: 'select',
    size: 40,
    minSize: 40,
    maxSize: 40,
    enableResizing: false,
    enableSorting: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        className="row-checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="row-checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };
}

// Utility: Actions column
export function createActionsColumn<T>(
  renderActions: (row: T) => React.ReactNode
): ColumnDef<T, any> {
  return {
    id: 'actions',
    size: 48,
    minSize: 48,
    maxSize: 48,
    enableResizing: false,
    enableSorting: false,
    header: () => null,
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>{renderActions(row.original)}</div>
    ),
  };
}
