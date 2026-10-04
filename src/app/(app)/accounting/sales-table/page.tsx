import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import { yen } from "@/lib/accounting/model";
import type { Basis } from "@/lib/accounting/monthly";
import {
  buildSalesTable,
  salesTableLines,
  type TableRow,
} from "@/lib/accounting/sales-table";
import { companiesWithStores } from "@/lib/stores";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { selectClass } from "@/lib/ui/form-classes";

const money = (n: number) => (n < 0 ? `-${yen(-n)}` : yen(n));

export default async function SalesTablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("APPROVER");
  const sp = await searchParams;
  const get = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : "";
  const thisYear = japanToday().slice(0, 4);
  const year = /^20\d{2}$/.test(get("year")) ? get("year") : thisYear;
  const basis: Basis = get("basis") === "incurred" ? "incurred" : "paid";
  const mode = get("tax") === "net" ? "net" : "gross";
  const label = mode === "gross" ? "税込" : "税抜";
  const [lines, companies] = await Promise.all([
    salesTableLines(prisma, ws, year, basis),
    companiesWithStores(prisma, ws.ownerId),
  ]);
  const table = buildSalesTable(lines, companies, mode);
  const q = (over: Record<string, string> = {}) =>
    new URLSearchParams({ year, basis, tax: mode, ...over }).toString();
  const detail = (row: TableRow, month: string) =>
    `/accounting/sales-table/detail?${q({
      month,
      company: row.scope.company,
      store: row.scope.store,
      kind: row.scope.kind,
    })}`;
  const kindLabel = (k: TableRow["kind"]) =>
    k === "SALES" ? "売上" : k === "COST" ? "費用" : "差額";
  const tone = (k: TableRow["kind"]) =>
    k === "SALES" ? "text-emerald-700" : k === "COST" ? "text-rose-700" : "";
  const cell = (row: TableRow, value: number, month: string) =>
    value === 0 ? (
      <span className="text-slate-300">0</span>
    ) : row.kind === "PROFIT" ? (
      <span>{money(value)}</span>
    ) : (
      <Link
        href={detail(row, month)}
        className="text-sky-700 underline-offset-2 hover:underline"
        title="明細を見る"
      >
        {money(value)}
      </Link>
    );
  const tr = (row: TableRow, key: string, first?: string) => (
    <tr
      key={key}
      className={`border-t border-slate-100 ${row.subtotal ? "bg-slate-50 font-semibold" : ""}`}
    >
      <th
        scope="row"
        className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-3 py-2 text-left font-normal"
      >
        {first ?? row.label}
      </th>
      <td className={`px-3 py-2 ${tone(row.kind)}`}>{kindLabel(row.kind)}</td>
      {row.months.map((v, i) => (
        <td key={i} className="px-3 py-2 text-right tabular-nums">
          {cell(row, v, `${year}-${String(i + 1).padStart(2, "0")}`)}
        </td>
      ))}
      <td className="px-3 py-2 text-right font-semibold tabular-nums">
        {cell(row, row.total, "")}
      </td>
    </tr>
  );

  return (
    <PageShell maxWidth="full">
      <SectionHeader
        variant="page"
        title="売上管理表"
        description="取引先・店舗ごとの、月別の売上と費用です。数字を押すと、その明細が開きます。"
        action={
          <AppButtonLink href="/accounting/monthly" variant="secondary">
            月ごとの売上と費用
          </AppButtonLink>
        }
      />
      <Card>
        <CardSection>
          <form className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              年
              <input
                name="year"
                type="number"
                min={2000}
                max={2099}
                defaultValue={year}
                className={`mt-1 w-28 ${selectClass}`}
              />
            </label>
            <label className="text-sm">
              費用を数える月
              <select
                name="basis"
                defaultValue={basis}
                className={`mt-1 ${selectClass}`}
              >
                <option value="paid">支払った月（支払日）</option>
                <option value="incurred">発生した月（対象月・日付）</option>
              </select>
            </label>
            <label className="text-sm">
              金額
              <select
                name="tax"
                defaultValue={mode}
                className={`mt-1 ${selectClass}`}
              >
                <option value="gross">税込</option>
                <option value="net">税抜（参考値）</option>
              </select>
            </label>
            <button className={`rounded-xl ${appButtonVariants.primary}`}>
              表示する
            </button>
            <div className="flex flex-wrap gap-2">
              <AppButtonLink
                href={`/accounting/sales-table?${q({ year: String(Number(year) - 1) })}`}
                variant="secondary"
              >
                ← {Number(year) - 1}年
              </AppButtonLink>
              <AppButtonLink
                href={`/accounting/sales-table?${q({ year: String(Number(year) + 1) })}`}
                variant="secondary"
              >
                {Number(year) + 1}年 →
              </AppButtonLink>
              <a
                href={`/api/accounting/sales-table-csv?${q()}`}
                className={`rounded-xl ${appButtonVariants.secondary}`}
              >
                CSVで出力
              </a>
            </div>
          </form>
        </CardSection>
      </Card>

      <p className="text-xs leading-6 text-slate-500">
        金額は{label}
        ・円。売上は「入金された月」で数えます（入金日が記録された請求書）。売上の店舗は請求書の明細で、費用の取引先・店舗は支払いの登録で選びます。取引先の指定がないものは、「取引先の指定なし」にまとめて出ます。
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">
                取引先／店舗
              </th>
              <th className="px-3 py-2 text-left">区分</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} className="px-3 py-2 text-right">
                  {i + 1}月
                </th>
              ))}
              <th className="px-3 py-2 text-right">合計</th>
            </tr>
          </thead>
          {table.blocks.map((b) => (
            <tbody key={b.id} className="border-t-2 border-slate-200">
              <tr className="bg-sky-50/60">
                <th
                  colSpan={15}
                  scope="colgroup"
                  className="sticky left-0 px-3 py-2 text-left font-semibold"
                >
                  {b.name}
                </th>
              </tr>
              {b.rows.map((r, i) => tr(r, `${b.id}-${i}`))}
            </tbody>
          ))}
          <tbody className="border-t-2 border-slate-300">
            {table.totals.map((r, i) => tr(r, `t-${i}`))}
          </tbody>
          {table.blocks.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={15} className="p-8 text-center text-slate-500">
                  {year}年の売上・費用は、まだありません。
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </PageShell>
  );
}
