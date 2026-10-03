"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  EXPENSE_CATEGORIES,
  japanToday,
  expenseStatus,
  expenseSummary,
  type ExpenseRow,
} from "@/lib/expenses/model";
import { shiftMonth, resolveSalesFilters } from "@/lib/dashboard/sales";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
export function ExpensesView({ rows }: { rows: ExpenseRow[] }) {
  const sp = useSearchParams(),
    today = japanToday(),
    current = today.slice(0, 7);
  const [from, setFrom] = useState(current),
    [to, setTo] = useState(current);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(sp.get("status") ?? "ALL");
  const [page, setPage] = useState(1);
  const period = resolveSalesFilters({ fromMonth: from, toMonth: to });
  const scoped = rows.filter(
    (r) =>
      (!category || r.category === category) &&
      (!query ||
        `${r.supplier} ${r.description}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())),
  );
  const summary = expenseSummary(scoped, period.from, period.to, today);
  const periodMode = !["UNPAID", "OVERDUE", "SOON"].includes(status);
  const filtered = (periodMode ? summary.inPeriod : scoped).filter((r) =>
    status === "UNPAID"
      ? !r.paidDate
      : status === "PAID"
        ? Boolean(r.paidDate)
        : status === "OVERDUE"
          ? expenseStatus(r, today) === "OVERDUE"
          : status === "SOON"
            ? summary.dueSoon.some((s) => s.id === r.id)
            : true,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    activePage = Math.min(page, pages);
  const visible = filtered.slice((activePage - 1) * 20, activePage * 20);
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = shiftMonth(period.to, i - 11);
    return {
      month,
      amount: scoped
        .filter((r) => r.costMonth === month)
        .reduce((sum, r) => sum + r.amount, 0),
    };
  });
  const maximum = Math.max(1, ...months.map((m) => m.amount));
  const categories = EXPENSE_CATEGORIES.map((name) => ({
    name,
    amount: summary.inPeriod
      .filter((r) => r.category === name)
      .reduce((sum, r) => sum + r.amount, 0),
  }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const changeStatus = (value: string) => {
    setStatus(value);
    setPage(1);
  };
  return (
    <PageShell maxWidth="full">
      <SectionHeader
        variant="page"
        title="支払管理"
        description="いくら使ったか、いつ支払うかを、ひとつの場所で。"
        action={
          <AppButtonLink href="/expenses/new">＋ 支払いを登録</AppButtonLink>
        }
      />
      {sp.get("saved") === "1" && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          支払情報を保存しました。
        </p>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
        金額は税込・実際に支払う金額です。コストは「対象月」、支払実績は「支払日」で集計します。銀行振込や自動引き落としは行いません。
      </div>
      <section
        aria-label="集計条件"
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-wrap gap-2">
          {[
            { label: "今月", from: current },
            { label: "今年", from: `${current.slice(0, 4)}-01` },
            { label: "過去12か月", from: shiftMonth(current, -11) },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setFrom(p.from);
                setTo(current);
                setPage(1);
              }}
              className={`min-h-11 rounded-lg px-4 text-sm ${from === p.from && to === current ? "bg-[#183d44] text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium">
            開始月
            <input
              type="month"
              min="2000-01"
              max="2099-12"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <label className="text-xs font-medium">
            終了月
            <input
              type="month"
              min="2000-01"
              max="2099-12"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <label className="text-xs font-medium">
            費目
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className={`mt-2 ${selectClass}`}
            >
              <option value="">すべての費目</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            支払先・内容を検索
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="会社名や支払内容"
              maxLength={150}
              className={`mt-2 ${inputClass}`}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          条件を変えるとすぐに反映します。集計期間：{period.from} 〜 {period.to}
          （最大24か月）
        </p>
        {period.error && (
          <p role="alert" className="mt-3 text-sm text-amber-800">
            {period.error}
          </p>
        )}
      </section>
      <section
        aria-label="支払いのサマリー"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {[
          {
            label: "対象期間のコスト",
            value: summary.cost,
            hint: "費用の対象月で集計・未払いを含む",
          },
          {
            label: "対象期間の支払実績",
            value: summary.paid,
            hint: "実際の支払日で集計",
          },
          {
            label: "未払いの合計",
            value: summary.unpaid,
            hint: "全期間・支払済みの記録がないもの",
          },
          {
            label: "期限超過の未払い",
            value: summary.overdue.reduce((n, r) => n + r.amount, 0),
            hint: `全期間・${summary.overdue.length}件`,
          },
        ].map((m, i) => (
          <div
            key={m.label}
            className={`rounded-2xl border p-4 sm:p-5 ${i === 0 ? "border-[#183d44] bg-[#183d44] text-white" : "border-slate-200 bg-white"}`}
          >
            <p className="text-xs">{m.label}</p>
            <p className="mt-4 break-all text-xl font-semibold tabular-nums sm:text-2xl">
              {yen(m.value)}
            </p>
            <p
              className={`mt-3 text-xs leading-5 ${i === 0 ? "text-slate-200" : "text-slate-500"}`}
            >
              {m.hint}
            </p>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => changeStatus("OVERDUE")}
          className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          期限超過 {summary.overdue.length}件を確認 →
        </button>
        <button
          onClick={() => changeStatus("SOON")}
          className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          今日から7日以内 {summary.dueSoon.length}件を確認 →
        </button>
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">月別コストの推移</h2>
          <p className="mt-2 text-xs text-slate-500">
            {months[0].month} 〜 {period.to}
            ・対象月基準。月を押すと一覧を絞り込めます。
          </p>
          <div
            className="mt-5 overflow-x-auto pb-2"
            role="region"
            aria-label="月別コストグラフ。横にスクロールできます"
            tabIndex={0}
          >
            <div className="flex h-48 min-w-[432px] items-end gap-2 border-b border-slate-200">
              {months.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  aria-label={`${m.month} ${yen(m.amount)}の支払いを見る`}
                  title={`${m.month}：${yen(m.amount)}`}
                  onClick={() => {
                    setFrom(m.month);
                    setTo(m.month);
                    changeStatus("ALL");
                  }}
                  className="flex h-full min-w-0 flex-1 items-end px-1 focus-visible:outline-2 focus-visible:outline-emerald-700"
                >
                  <span
                    className={`block w-full rounded-t-md ${m.month >= period.from && m.month <= period.to ? "bg-[#287b69]" : "bg-slate-300"}`}
                    style={{
                      height: `${(m.amount / maximum) * 100}%`,
                      minHeight: 2,
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-2 flex min-w-[432px] gap-2">
              {months.map((m) => (
                <span
                  key={m.month}
                  className="flex-1 text-center text-[11px] text-slate-500"
                >
                  {Number(m.month.slice(5))}月
                </span>
              ))}
            </div>
          </div>
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer py-2 text-sm text-emerald-800">
              月別の金額を一覧で見る
            </summary>
            <ul className="divide-y divide-slate-100">
              {months.map((m) => (
                <li key={m.month} className="flex justify-between py-2 text-sm">
                  <span>{m.month}</span>
                  <span>{yen(m.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">費目別の内訳</h2>
          <p className="mt-2 text-xs text-slate-500">
            選択期間のコスト・金額順
          </p>
          <ul className="mt-5 space-y-5">
            {categories.map((c) => (
              <li key={c.name}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{c.name}</span>
                  <strong>{yen(c.amount)}</strong>
                </div>
                <div
                  className="mt-2 h-2 rounded-full bg-slate-100"
                  aria-hidden="true"
                >
                  <div
                    className="h-2 rounded-full bg-[#287b69]"
                    style={{
                      width: `${(c.amount / Math.max(1, summary.cost)) * 100}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {!categories.length && (
            <p className="py-10 text-center text-sm text-slate-500">
              この期間の支払いはまだありません。
            </p>
          )}
        </section>
      </div>
      <section
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
        aria-labelledby="expenses-list"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="expenses-list" className="font-semibold">
            支払い一覧
          </h2>
          <span className="text-xs text-slate-500">
            {filtered.length}件・支払期限が近い順
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: "ALL", label: "すべて" },
            { id: "UNPAID", label: "未払い" },
            { id: "PAID", label: "支払済み" },
            { id: "OVERDUE", label: "期限超過" },
            { id: "SOON", label: "7日以内" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => changeStatus(s.id)}
              aria-pressed={status === s.id}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm ${status === s.id ? "bg-[#183d44] text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {periodMode
            ? `${period.from}〜${period.to}の対象月で絞り込んでいます。`
            : "支払い忘れを防ぐため、対象月の指定にかかわらず全期間を表示しています。"}
          費目・検索条件は適用されます。
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {visible.map((r) => {
            const state = expenseStatus(r, today);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold">
                      {r.supplier}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] ${state === "PAID" ? "bg-emerald-50 text-emerald-800" : state === "OVERDUE" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}
                    >
                      {state === "PAID"
                        ? "支払済み"
                        : state === "OVERDUE"
                          ? "期限超過"
                          : "未払い"}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm text-slate-600">
                    {r.description}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    {r.category} ／ 対象月 {r.costMonth}
                    <br />
                    期限 {r.dueDate}
                    {r.paidDate && ` ／ 支払日 ${r.paidDate}`}
                  </p>
                  {r.filename && (
                    <a
                      href={`/api/expenses/${r.id}/pdf`}
                      className="mt-2 inline-block py-1 text-xs text-emerald-800 underline"
                    >
                      添付PDFをダウンロード
                    </a>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">
                    {yen(r.amount)}
                  </p>
                  <Link
                    href={`/expenses/${r.id}/edit${r.paidDate ? "" : "#payment"}`}
                    className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 text-sm text-emerald-900"
                  >
                    {r.paidDate ? "内容を編集" : "支払を記録・編集"} →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        {!visible.length && (
          <div className="py-10 text-center">
            <p className="font-medium">該当する支払いはありません</p>
            <p className="mt-2 text-sm text-slate-500">
              条件を変更するか、最初の支払いを登録してください。
            </p>
            <Link
              href="/expenses/new"
              className="mt-4 inline-block rounded-lg bg-[#183d44] px-5 py-3 text-sm text-white"
            >
              ＋ 支払いを登録
            </Link>
          </div>
        )}
        {pages > 1 && (
          <nav
            aria-label="支払い一覧のページ"
            className="mt-4 flex items-center justify-center gap-4"
          >
            <button
              disabled={activePage === 1}
              onClick={() => setPage(activePage - 1)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              前へ
            </button>
            <span className="text-sm">
              {activePage} / {pages}
            </span>
            <button
              disabled={activePage === pages}
              onClick={() => setPage(activePage + 1)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              次へ
            </button>
          </nav>
        )}
      </section>
    </PageShell>
  );
}
