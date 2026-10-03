import Link from "next/link";
import {
  invoiceSalesHref,
  shiftMonth,
  type SalesFilters,
  type SalesSummary,
} from "@/lib/dashboard/sales";
import { inputClass, selectClass } from "@/lib/ui/form-classes";

const yen = (value: number) =>
  `¥${new Intl.NumberFormat("ja-JP").format(value)}`;
const monthLabel = (value: string) =>
  `${Number(value.slice(0, 4))}年${Number(value.slice(5))}月`;
const periodLabel = (from: string, to: string) =>
  from === to ? monthLabel(from) : `${monthLabel(from)}〜${monthLabel(to)}`;
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue";

export function SalesOverview({
  filters: f,
  sales: s,
  companies,
}: {
  filters: SalesFilters;
  sales: SalesSummary;
  companies: { id: string; name: string }[];
}) {
  const basisLabel = f.basis === "net" ? "税抜請求額" : "振込請求額";
  const selectedCompany = companies.find((c) => c.id === f.companyId);
  const dashboardHref = (
    values: Partial<{
      from: string;
      to: string;
      companyId: string;
      basis: string;
    }> = {},
  ) => {
    const v = { ...f, ...values };
    return `/dashboard?${new URLSearchParams({ fromMonth: v.from, toMonth: v.to, companyId: v.companyId, basis: v.basis })}`;
  };
  const presets = [
    { label: "今月", from: f.current, to: f.current },
    { label: "今年", from: `${f.current.slice(0, 4)}-01`, to: f.current },
    { label: "過去12か月", from: shiftMonth(f.current, -11), to: f.current },
  ];
  const maxAmount = Math.max(1, ...s.months.map((m) => m.amount));
  const maxCompany = Math.max(1, ...s.companies.map((c) => c.amount));
  return (
    <section aria-labelledby="sales-heading" className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2
                id="sales-heading"
                className="text-lg font-semibold text-slate-900"
              >
                売上の確認
              </h2>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                請求ベース
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              発行済みの請求書を、請求日で集計します。下書き・確定のみの請求書、入金状況は含みません。
            </p>
          </div>
          <Link
            href={invoiceSalesHref(f.from, f.to, f.companyId)}
            className={`rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-50 ${focus}`}
          >
            対象の請求書を見る →
          </Link>
        </div>
        <nav
          aria-label="集計期間のショートカット"
          className="mt-5 flex flex-wrap gap-2"
        >
          {presets.map((p) => (
            <Link
              key={p.label}
              href={dashboardHref(p)}
              aria-current={
                f.from === p.from && f.to === p.to ? "true" : undefined
              }
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${focus} ${f.from === p.from && f.to === p.to ? "bg-brand-blue/15 text-brand-navy ring-1 ring-inset ring-brand-blue/40" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <details className="mt-4 rounded-xl border border-slate-200 p-4" open={Boolean(f.companyId || f.basis === "transfer" || f.error)}>
          <summary className={`cursor-pointer text-sm font-medium text-sky-700 ${focus}`}>期間・取引先・金額を指定する</summary>
        <form
          action="/dashboard"
          key={`${f.from}-${f.to}-${f.companyId}-${f.basis}`}
          className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_1.2fr_auto]"
        >
          <label className="block text-xs font-medium text-slate-600">
            開始月
            <input
              required
              type="month"
              name="fromMonth"
              min="1900-01"
              max="9998-12"
              defaultValue={f.from}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            終了月
            <input
              required
              type="month"
              name="toMonth"
              min="1900-01"
              max="9998-12"
              defaultValue={f.to}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="block min-w-0 text-xs font-medium text-slate-600">
            取引先
            <select
              name="companyId"
              defaultValue={f.companyId}
              className={`mt-1.5 ${selectClass}`}
            >
              <option value="">すべての取引先</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {f.companyId && !selectedCompany && (
                <option value={f.companyId}>該当する取引先がありません</option>
              )}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            表示する金額
            <select
              name="basis"
              defaultValue={f.basis}
              className={`mt-1.5 ${selectClass}`}
            >
              <option value="net">税抜請求額</option>
              <option value="transfer">振込請求額（差引後）</option>
            </select>
          </label>
          <button
            type="submit"
            className={`self-end rounded-lg bg-brand-navy px-5 py-3 text-sm font-semibold text-white hover:bg-brand-navy/90 ${focus}`}
          >
            集計する
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          期間指定は最大24か月。振込請求額は消費税を含み、源泉徴収額を差し引いた金額です。
        </p>
        </details>
        {f.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            {f.error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <h3 className="font-semibold text-slate-800">
          {periodLabel(f.from, f.to)}
        </h3>
        <span className="text-slate-500">
          ／{" "}
          {f.companyId
            ? (selectedCompany?.name ?? "該当する取引先なし")
            : "すべての取引先"}{" "}
          ／ {basisLabel}
        </span>
        {f.companyId && (
          <Link
            href={dashboardHref({ companyId: "" })}
            className={`text-sky-700 underline underline-offset-4 ${focus}`}
          >
            取引先の絞り込みを解除
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Link
          href={invoiceSalesHref(f.from, f.to, f.companyId)}
          className={`rounded-2xl bg-brand-navy p-5 text-white ${focus}`}
        >
          <p className="text-xs text-sky-100">{basisLabel}</p>
          <p className="mt-4 break-all text-xl font-semibold sm:text-3xl tracking-tight tabular-nums">
            {yen(s.total)}
          </p>
          <p className="mt-3 text-xs text-slate-200">対象の請求書を確認 →</p>
        </Link>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
          <p className="text-xs text-slate-600">
            {f.from === f.to ? "前月比" : "前期間比"}
          </p>
          <p className="mt-4 text-xl font-semibold sm:text-3xl tabular-nums text-slate-900">
            {s.change === null
              ? "—"
              : `${s.change > 0 ? "+" : ""}${s.change.toFixed(1)}%`}
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {periodLabel(f.previousFrom, f.previousTo)}：{yen(s.previous)}
            {s.change === null && "（比較元が0円）"}
          </p>
        </div>
        <Link
          href={invoiceSalesHref(f.from, f.to, f.companyId)}
          className={`rounded-2xl border border-slate-200/80 bg-white p-5 ${focus}`}
        >
          <p className="text-xs text-slate-600">発行済みの請求書</p>
          <p className="mt-4 text-xl font-semibold sm:text-3xl tabular-nums">
            {s.count}
            <span className="ml-1 text-sm font-normal">件</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">選択期間の請求件数 →</p>
        </Link>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
          <p className="text-xs text-slate-600">請求した取引先</p>
          <p className="mt-4 text-xl font-semibold sm:text-3xl tabular-nums">
            {s.companyCount}
            <span className="ml-1 text-sm font-normal">社</span>
          </p>
          <p className="mt-3 text-xs text-slate-500">
            選択期間に発行済みの請求がある取引先
          </p>
        </div>
      </div>
      {s.count === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm">
          <p className="font-semibold">
            この条件に該当する発行済みの請求書はありません
          </p>
          <p className="mt-1 text-slate-600">
            期間や取引先を変更してください。作成中の請求書は、下の「次にすること」から確認できます。
          </p>
        </div>
      )}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section
          aria-labelledby="monthly-heading"
          className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="monthly-heading" className="font-semibold">
              月別の推移
            </h3>
            <span className="text-xs text-slate-500">{basisLabel}・円</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {periodLabel(f.trendFrom, f.to)} ／
            濃い色は選択期間。月を選ぶと請求書が開きます。
          </p>
          <div
            className="mt-5 overflow-x-auto pb-2"
            role="region"
            aria-label="月別請求額の棒グラフ。横にスクロールできます"
            tabIndex={0}
          >
            <div
              className="relative flex mt-5 h-48 min-w-[420px] items-end gap-2 border-b border-slate-200"
              style={{ minWidth: Math.max(420, s.months.length * 36) }}
            >
              {[0, 0.5, 1].map((r) => (
                <div
                  key={r}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-slate-100"
                  style={{ bottom: `${r * 100}%` }}
                >
                  <span className="absolute -top-4 right-0 bg-white text-[10px] text-slate-400">
                    {yen(Math.round(maxAmount * r))}
                  </span>
                </div>
              ))}
              {s.months.map((m) => (
                <Link
                  key={m.month}
                  href={invoiceSalesHref(m.month, m.month, f.companyId)}
                  aria-label={`${monthLabel(m.month)} ${basisLabel}${yen(m.amount)} ${m.count}件の請求書を見る`}
                  title={`${monthLabel(m.month)}：${yen(m.amount)} / ${m.count}件`}
                  className={`group relative z-10 flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-lg px-1 ${focus}`}
                >
                  <span
                    className={`block rounded-t-md transition-colors group-hover:bg-sky-600 ${m.month >= f.from && m.month <= f.to ? "bg-brand-blue" : "bg-slate-300"}`}
                    style={{
                      height: `${Math.max(m.amount > 0 ? 2 : 0, (m.amount / maxAmount) * 100)}%`,
                      minHeight: 2,
                    }}
                  />
                  <span className="absolute -top-1 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-white group-hover:block group-focus-visible:block">
                    {yen(m.amount)}
                  </span>
                </Link>
              ))}
            </div>
            <div
              className="mt-2 flex gap-2"
              style={{ minWidth: Math.max(420, s.months.length * 36) }}
            >
              {s.months.map((m) => (
                <span
                  key={m.month}
                  className="min-w-0 flex-1 text-center text-[11px] text-slate-600"
                >
                  {Number(m.month.slice(5))}月
                  <span className="block text-[9px] text-slate-400">
                    {m.month.slice(0, 4)}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <details className="mt-4 border-t border-slate-100 pt-4">
            <summary
              className={`cursor-pointer text-sm font-medium text-sky-700 ${focus}`}
            >
              月別の金額を一覧で見る
            </summary>
            <ul className="mt-3 divide-y divide-slate-100">
              {s.months.map((m) => (
                <li key={m.month}>
                  <Link
                    href={invoiceSalesHref(m.month, m.month, f.companyId)}
                    className={`flex flex-wrap justify-between gap-2 py-3 text-sm ${focus}`}
                  >
                    <span>{monthLabel(m.month)}</span>
                    <span className="tabular-nums">
                      {yen(m.amount)}{" "}
                      <span className="ml-3 text-xs text-slate-500">
                        {m.count}件 →
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <section
          aria-labelledby="company-heading"
          className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6"
        >
          <h3 id="company-heading" className="font-semibold">
            取引先別の内訳
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            選択期間の金額順。取引先を選ぶと、その会社の推移に絞り込めます。
          </p>
          {s.companies.length ? (
            <>
              <ol className="mt-5 space-y-5">
                {s.companies.slice(0, 5).map((c, i) => (
                  <li key={c.id}>
                    <Link
                      href={dashboardHref({ companyId: c.id })}
                      className={`block rounded-md ${focus}`}
                    >
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words font-medium">
                          <span className="mr-2 text-xs text-slate-400">
                            {i + 1}
                          </span>
                          {c.name}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {yen(c.amount)}
                        </span>
                      </div>
                      <div
                        className="my-2 h-2 overflow-hidden rounded-full bg-slate-100"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-brand-blue"
                          style={{
                            width: `${Math.max(0, (c.amount / maxCompany) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{c.count}件</span>
                        <span>
                          {s.total > 0
                            ? `${((c.amount / s.total) * 100).toFixed(1)}%`
                            : "—"}{" "}
                          ・ 推移を見る →
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
              {s.companies.length > 5 && (
                <details className="mt-5 border-t border-slate-100 pt-4">
                  <summary className="cursor-pointer text-sm text-sky-700">
                    残り{s.companies.length - 5}社も見る
                  </summary>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {s.companies.slice(5).map((c) => (
                      <li key={c.id}>
                        <Link
                          href={dashboardHref({ companyId: c.id })}
                          className={`flex justify-between gap-3 py-3 text-sm ${focus}`}
                        >
                          <span>{c.name}</span>
                          <span className="shrink-0">{yen(c.amount)} →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">
              集計対象の取引先はありません
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
