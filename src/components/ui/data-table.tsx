import type { ReactNode } from "react";

/** 一覧テーブル用のラッパー（はみ出し時スクロール・角丸） */
export function DataTableShell(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        props.className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="overflow-x-auto">{props.children}</div>
    </div>
  );
}

export const dataTableHeadCell = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const dataTableCell = "px-4 py-3.5 text-sm text-slate-700";
export const dataTableRow = "border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80";
