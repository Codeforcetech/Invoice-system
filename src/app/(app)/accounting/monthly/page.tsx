import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import { yen } from "@/lib/accounting/model";
import { shiftMonthText, validMonthText } from "@/lib/accounting/received";
import {
  monthTotals,
  monthlyRows,
  partyTotals,
  pendingInvoices,
  yearMonths,
  type Basis,
  type MonthlyRow,
} from "@/lib/accounting/monthly";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass } from "@/lib/ui/form-classes";

const money = (n: number) => (n < 0 ? `-¥${yen(-n)}` : `¥${yen(n)}`);

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("ADMIN");
  const sp = await searchParams;
  const get = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : "";
  const month = validMonthText(get("month"))
    ? get("month")
    : japanToday().slice(0, 7);
  const basis: Basis = get("basis") === "incurred" ? "incurred" : "paid";
  const mode = get("tax") === "net" ? "net" : "gross";
  const months = yearMonths(month);
  const [yearRows, pending] = await Promise.all([
    monthlyRows(prisma, ws, months[0], months[11], basis),
    pendingInvoices(prisma, ws, month),
  ]);
  const rows = yearRows.filter((r) => r.month === month);
  const sales = rows.filter((r) => r.kind === "SALES");
  const costs = rows.filter((r) => r.kind === "COST");
  const sum = (list: MonthlyRow[]) => list.reduce((n, r) => n + r[mode], 0);
  const totals = monthTotals(yearRows, months, mode);
  const query = (m: string, over: Record<string, string> = {}) =>
    new URLSearchParams({ month: m, basis, tax: mode, ...over }).toString();
  const unknown = rows.filter((r) => r.kind === "COST" && r.taxUnknown).length;
  const csvQuery = new URLSearchParams({ month, basis });
  const label = mode === "gross" ? "税込" : "税抜";

  const table = (list: MonthlyRow[], title: string, dateLabel: string) => (
    <section className="space-y-3">
      <h2 className="font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-slate-500">
          {list.length}件
        </span>
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="p-3">{dateLabel}</th>
              <th className="p-3">取引先</th>
              <th className="p-3">内容</th>
              <th className="p-3">出どころ</th>
              <th className="p-3 text-right">金額（{label}）</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="p-3 whitespace-nowrap">{r.date}</td>
                <td className="p-3 font-medium">
                  {r.href ? (
                    <Link href={r.href} className="text-sky-700">
                      {r.party}
                    </Link>
                  ) : (
                    r.party
                  )}
                </td>
                <td className="p-3">{r.content}</td>
                <td className="p-3">{r.source}</td>
                <td className="p-3 text-right tabular-nums">
                  {money(r[mode])}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  この月の{title}はありません。
                </td>
              </tr>
            )}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="p-3" colSpan={4}>
                  合計
                </td>
                <td className="p-3 text-right tabular-nums">
                  {money(sum(list))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {list.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            取引先ごとの小計
          </summary>
          <table className="mt-3 w-full text-left">
            <tbody>
              {partyTotals(list, mode).map((p) => (
                <tr key={p.party} className="border-t border-slate-100">
                  <td className="p-2">{p.party}</td>
                  <td className="p-2 text-right text-slate-500">{p.count}件</td>
                  <td className="p-2 text-right tabular-nums">
                    {money(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="月ごとの売上と費用"
        description="売上は「入金された月」で数えます。取引先ごとに、月別の売上と費用を確認できます。"
      />
      <Card>
        <CardSection>
          <form className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              何月
              <input
                type="month"
                name="month"
                defaultValue={month}
                required
                className={`mt-1 ${inputClass}`}
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
            <div className="flex gap-2">
              <AppButtonLink
                href={`/accounting/monthly?${query(shiftMonthText(month, -1))}`}
                variant="secondary"
              >
                ← 前の月
              </AppButtonLink>
              <AppButtonLink
                href={`/accounting/monthly?${query(shiftMonthText(month, 1))}`}
                variant="secondary"
              >
                次の月 →
              </AppButtonLink>
            </div>
          </form>
        </CardSection>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["売上", sum(sales), "text-emerald-700"],
          ["費用", sum(costs), "text-rose-700"],
          ["差額", sum(sales) - sum(costs), "text-slate-900"],
        ].map(([name, value, tone]) => (
          <Card key={name as string}>
            <CardSection>
              <p className="text-xs text-slate-500">
                {month.replace("-", "年")}月 ／ {name}（{label}）
              </p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
                {money(value as number)}
              </p>
            </CardSection>
          </Card>
        ))}
      </div>

      {pending.count > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          入金待ちの請求書が {pending.count}件（{label} ¥
          {yen(mode === "gross" ? pending.gross : pending.net)}
          ）あります。入金日を記録すると、入金された月の売上に入ります。
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">{month.slice(0, 4)}年の月別一覧</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="p-3">月</th>
                <th className="p-3 text-right">売上（{label}）</th>
                <th className="p-3 text-right">費用（{label}）</th>
                <th className="p-3 text-right">差額</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr
                  key={t.month}
                  className={`border-t border-slate-100 ${t.month === month ? "bg-sky-50" : ""}`}
                >
                  <td className="p-3">
                    <Link
                      href={`/accounting/monthly?${query(t.month)}`}
                      className="text-sky-700"
                    >
                      {Number(t.month.slice(5))}月
                    </Link>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {money(t.sales)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {money(t.cost)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {money(t.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="p-3">年間</td>
                <td className="p-3 text-right tabular-nums">
                  {money(totals.reduce((n, t) => n + t.sales, 0))}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {money(totals.reduce((n, t) => n + t.cost, 0))}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {money(totals.reduce((n, t) => n + t.profit, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {table(sales, "売上（入金された分）", "入金日")}
      {table(costs, "費用", basis === "paid" ? "支払日" : "発生月")}

      <div className="flex flex-wrap items-center gap-3">
        <a
          className={`rounded-xl ${appButtonVariants.secondary}`}
          href={`/api/accounting/monthly-csv?${csvQuery}`}
        >
          この月をCSVで出力
        </a>
        <a
          className={`rounded-xl ${appButtonVariants.secondary}`}
          href={`/api/accounting/monthly-csv?${csvQuery}&scope=year`}
        >
          {month.slice(0, 4)}年分をCSVで出力
        </a>
      </div>
      <p className="text-xs leading-6 text-slate-500">
        売上：発行済みの請求書のうち入金日が記録されたもの（源泉徴収前の請求額）と、手入力・明細取込の売上。費用：支払管理、承認済みの経費精算、手入力・明細取込の費用。
        税抜は、税込から消費税を割り戻した参考値です。
        {unknown > 0 &&
          ` この月の費用のうち${unknown}件は消費税の区分が未設定のため、税抜＝税込として表示しています。`}
        {basis === "paid" &&
          " 「支払った月」では、まだ支払っていない費用は入りません。"}
      </p>
    </PageShell>
  );
}
