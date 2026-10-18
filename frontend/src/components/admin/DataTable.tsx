import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine } from "lucide-react";
import clsx from "clsx";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Extra classes of the <td> (text color, width...). */
  className?: string;
}

/** Bordered admin table. Its last column is right-aligned (row actions). */
export default function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyText,
  rowClassName = "",
  className = "mt-4",
}: {
  columns: Column<T>[];
  rows: T[];
  /** Shown in a single full-width row when `rows` is empty. */
  emptyText?: string;
  rowClassName?: string;
  className?: string;
}) {
  const last = columns.length - 1;
  return (
    <div className={`${className} overflow-x-auto rounded-xl border border-surface-border`}>
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <tr>
            {columns.map((col, i) => (
              <th key={col.header} className={i === last ? "px-4 py-2.5 text-right" : "px-4 py-2.5"}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={clsx("border-t border-surface-border", rowClassName)}>
              {columns.map((col) => (
                <td key={col.header} className={clsx("px-4 py-2.5", col.className)}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && emptyText && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Right-aligned group of row action buttons. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-1">{children}</div>;
}

export function LoadMoreButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="mt-3 flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-surface-3"
    >
      <ArrowDownToLine size={12} /> {t("admin.actions.loadMore")}
    </button>
  );
}
