"use client";
import Link from "next/link";
import { useState } from "react";
import type { TableBlock, TableRow } from "@/lib/accounting/sales-table";

const yen = (n: number) => new Intl.NumberFormat("ja-JP").format(n);
const money = (n: number) => (n < 0 ? `-${yen(-n)}` : yen(n));
const kindLabel = (k: TableRow["kind"]) =>
  k === "SALES" ? "売上" : k === "COST" ? "費用" : "差額";
const tone = (k: TableRow["kind"]) =>
  k === "SALES" ? "text-emerald-700" : k === "COST" ? "text-rose-700" : "";

/** 売上管理表の本体。取引先が多くても見やすいよう、取引先ごとに店舗の行を折りたたむ。 */
export function SalesTableView({
  blocks,
  totals,
  shownTotals,
  year,
  params,
}: {
  blocks: TableBlock[];
  totals: TableRow[];
  shownTotals: TableRow[] | null;
  year: string;
  /** 明細へのリンクに引き継ぐ条件（年・費用の数え方・税込／税抜） */
  params: { year: string; basis: string; tax: string };
}) {
  const expandable = blocks.filter((b) => b.stores.length > 0).map((b) => b.id);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const href = (row: TableRow, month: string) =>
    `/accounting/sales-table/detail?${new URLSearchParams({
      ...params,
      month,
      company: row.scope.company,
      store: row.scope.store,
      kind: row.scope.kind,
    })}`;
  const cell = (row: TableRow, value: number, month: string) =>
    value === 0 ? (
      <span className="text-slate-300">0</span>
    ) : row.kind === "PROFIT" ? (
      <span>{money(value)}</span>
    ) : (
      <Link
        href={href(row, month)}
        className="text-sky-700 underline-offset-2 hover:underline"
        title="明細を見る"
      >
        {money(value)}
      </Link>
    );
  const line = (
    row: TableRow,
    key: string,
    first: React.ReactNode,
    extra = "",
  ) => (
    <tr
      key={key}
      className={`border-t border-slate-100 ${row.subtotal ? "bg-slate-50 font-semibold" : ""} ${extra}`}
    >
      <th
        scope="row"
        className="sticky left-0 z-10 max-w-[16rem] truncate whitespace-nowrap bg-inherit px-3 py-1.5 text-left font-normal"
      >
        {first}
      </th>
      <td className={`whitespace-nowrap px-2 py-1.5 ${tone(row.kind)}`}>
        {kindLabel(row.kind)}
      </td>
      {row.months.map((v, i) => (
        <td
          key={i}
          className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums"
        >
          {cell(row, v, `${year}-${String(i + 1).padStart(2, "0")}`)}
        </td>
      ))}
      <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">
        {cell(row, row.total, "")}
      </td>
    </tr>
  );

  const button =
    "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
  return (
    <div className="space-y-3">
      {expandable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            onClick={() => setOpen(new Set(expandable))}
          >
            店舗の行を、すべて開く
          </button>
          <button
            type="button"
            className={button}
            onClick={() => setOpen(new Set())}
          >
            すべて閉じる
          </button>
        </div>
      )}
      <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-20 bg-slate-50 text-xs shadow-[0_1px_0_rgb(226,232,240)]">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-50 px-3 py-2 text-left">
                取引先／店舗
              </th>
              <th className="whitespace-nowrap px-2 py-2 text-left">区分</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-2 text-right">
                  {i + 1}月
                </th>
              ))}
              <th className="whitespace-nowrap px-2 py-2 text-right">合計</th>
            </tr>
          </thead>
          <tbody className="border-b-2 border-slate-300">
            {totals.map((r, i) => line(r, `t-${i}`, r.label))}
            {shownTotals &&
              shownTotals.map((r, i) =>
                line(r, `s-${i}`, "検索結果の合計", "bg-amber-50"),
              )}
          </tbody>
          {blocks.map((b) => {
            const isOpen = open.has(b.id);
            const canOpen = b.stores.length > 0;
            return (
              <tbody key={b.id} className="border-t-2 border-slate-200">
                <tr className="bg-sky-50/60">
                  <th
                    colSpan={15}
                    scope="colgroup"
                    className="sticky left-0 px-3 py-2 text-left font-semibold"
                  >
                    {canOpen ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(b.id)}
                        className="flex items-center gap-2 text-left"
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}
                        >
                          ▶
                        </span>
                        {b.name}
                        <span className="text-xs font-normal text-slate-500">
                          （店舗 {b.stores.length / 2}）
                        </span>
                      </button>
                    ) : (
                      b.name
                    )}
                  </th>
                </tr>
                {b.summary.map((r, i) =>
                  line(r, `${b.id}-s${i}`, canOpen ? "取引先の合計" : "", ""),
                )}
                {isOpen &&
                  b.stores.map((r, i) =>
                    line(r, `${b.id}-d${i}`, r.label, "bg-white"),
                  )}
              </tbody>
            );
          })}
          {blocks.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={15} className="p-8 text-center text-slate-500">
                  該当する取引先はありません。
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
