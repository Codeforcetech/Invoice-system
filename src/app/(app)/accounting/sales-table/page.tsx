import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import type { Basis } from "@/lib/accounting/monthly";
import {
  buildSalesTable,
  salesTableLines,
  SALES_TABLE_LIMIT,
} from "@/lib/accounting/sales-table";
import { companiesWithStores } from "@/lib/stores";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { SalesTableView } from "@/components/accounting/sales-table-view";

/** 1ページに出す取引先の数。取引先が多い事業所でも、表が長くなりすぎないようにする。 */
const PAGE_SIZE = 30;

export default async function SalesTablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("APPROVER");
  const sp = await searchParams;
  const get = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : "";
  const year = /^20\d{2}$/.test(get("year"))
    ? get("year")
    : japanToday().slice(0, 4);
  const basis: Basis = get("basis") === "incurred" ? "incurred" : "paid";
  const mode = get("tax") === "net" ? "net" : "gross";
  const query = get("q").trim().slice(0, 60);
  const sort = get("sort") === "name" ? "name" : "sales";
  const showAll = get("all") === "1";
  const label = mode === "gross" ? "税込" : "税抜";
  const [{ lines, truncated }, companies] = await Promise.all([
    salesTableLines(prisma, ws, year, basis),
    companiesWithStores(prisma, ws.ownerId),
  ]);
  const table = buildSalesTable(lines, companies, {
    mode,
    query,
    sort,
    showAll,
  });
  const pages = Math.max(1, Math.ceil(table.blocks.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(get("page")) || 1));
  const shown = table.blocks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const q = (over: Record<string, string> = {}) => {
    const base: Record<string, string> = { year, basis, tax: mode, sort };
    if (query) base.q = query;
    if (showAll) base.all = "1";
    return new URLSearchParams({ ...base, ...over }).toString();
  };
  const link = (over: Record<string, string>) =>
    `/accounting/sales-table?${q(over)}`;

  return (
    <PageShell maxWidth="full">
      <SectionHeader
        variant="page"
        title="売上管理表"
        description="取引先ごとの、月別の売上と費用です。数字を押すと、その明細が開きます。"
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
                className={`mt-1 w-28 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              取引先を探す
              <input
                name="q"
                type="search"
                defaultValue={query}
                maxLength={60}
                placeholder="取引先の名前"
                className={`mt-1 w-56 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              並び順
              <select
                name="sort"
                defaultValue={sort}
                className={`mt-1 ${selectClass}`}
              >
                <option value="sales">売上の多い順</option>
                <option value="name">名前順</option>
              </select>
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
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="all"
                value="1"
                defaultChecked={showAll}
              />
              データのない取引先も出す
            </label>
            <button className={`rounded-xl ${appButtonVariants.primary}`}>
              表示する
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <AppButtonLink
              href={link({ year: String(Number(year) - 1), page: "1" })}
              variant="secondary"
            >
              ← {Number(year) - 1}年
            </AppButtonLink>
            <AppButtonLink
              href={link({ year: String(Number(year) + 1), page: "1" })}
              variant="secondary"
            >
              {Number(year) + 1}年 →
            </AppButtonLink>
            <a
              href={`/api/accounting/sales-table-csv?${q()}`}
              className={`rounded-xl ${appButtonVariants.secondary}`}
            >
              CSVで出力（全取引先）
            </a>
          </div>
        </CardSection>
      </Card>

      {truncated && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          件数が多いため、一部の明細が含まれていません（上限：請求書・支払いなど、それぞれ年間
          {SALES_TABLE_LIMIT.toLocaleString("ja-JP")}
          件）。数字が足りない可能性があります。
        </p>
      )}
      <p className="text-xs leading-6 text-slate-500">
        金額は{label}
        ・円。売上は「入金された月」で数えます。店舗は、請求書の明細と支払いの登録で選びます。取引先の指定がないものは、「取引先の指定なし」にまとめて出ます。{" "}
        {table.blocks.length}社を表示
        {!showAll && table.hiddenEmpty > 0
          ? `（データのない${table.hiddenEmpty}社は、出していません）`
          : ""}
        {query ? `（「${query}」で絞り込み中）` : ""}
      </p>

      <SalesTableView
        blocks={shown}
        totals={table.totals}
        shownTotals={table.shownTotals}
        year={year}
        params={{ year, basis, tax: mode }}
      />

      {pages > 1 && (
        <nav
          aria-label="ページ送り"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-slate-500">
            {page} / {pages} ページ（{PAGE_SIZE}社ずつ）
          </span>
          {page > 1 && (
            <Link
              href={link({ page: String(page - 1) })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
            >
              ← 前の{PAGE_SIZE}社
            </Link>
          )}
          {page < pages && (
            <Link
              href={link({ page: String(page + 1) })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
            >
              次の{PAGE_SIZE}社 →
            </Link>
          )}
        </nav>
      )}
    </PageShell>
  );
}
