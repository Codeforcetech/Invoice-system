import Link from "next/link";
import { groupAmounts, type AmountRow } from "@/lib/management/model";
import { reportTable, type ManagementReport } from "@/lib/management/report";
import { Card, CardSection } from "@/components/ui/card";
import { appButtonVariants } from "@/components/ui/app-button";
import { yen } from "@/lib/accounting/model";
function Bars({ title, rows }: { title: string; rows: AmountRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  return (
    <Card>
      <CardSection>
        <h2 className="mb-4 font-semibold">{title}</h2>
        {!rows.length ? (
          <p className="text-sm text-slate-500">
            この条件に該当するデータはありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.slice(0, 24).map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{r.name}</span>
                  <span className="shrink-0 tabular-nums">
                    ¥{yen(r.amount)}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="h-2 rounded-full bg-slate-100"
                >
                  <div
                    className={`h-2 rounded-full ${r.amount < 0 ? "bg-rose-400" : "bg-emerald-700"}`}
                    style={{ width: `${(Math.abs(r.amount) / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 24 && (
          <p className="mt-3 text-xs text-slate-500">
            グラフは上位24件。全件は表・CSVで確認できます。
          </p>
        )}
      </CardSection>
    </Card>
  );
}
export function ReportView({
  report: r,
  page = 1,
}: {
  report: ManagementReport;
  page?: number;
}) {
  const view = r.f.view,
    t = reportTable(r),
    query = new URLSearchParams({ ...r.f });
  const due = view === "receipts" ? r.receipts : r.payments;
  const total = due.reduce((s, v) => s + v.amount, 0);
  const paymentReady =
    r.payments.length > 0 &&
    r.payments.every((p) => p.due && p.annotation.bankCode);
  const pageCount = Math.max(1, Math.ceil(t.rows.length / 100)),
    safePage = Math.min(page, pageCount);
  return (
    <>
      {(view === "receipts" || view === "payments") && (
        <Card>
          <CardSection>
            <p className="text-sm text-slate-500">
              選択期間の{view === "receipts" ? "未入金" : "未払い"}
              合計（現在の状態）
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              ¥{yen(total)}{" "}
              <span className="text-sm font-normal text-slate-500">
                {due.length}件
              </span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              予定日が選択期間に入る未決済取引。
              {view === "payments"
                ? "経費精算の予定日未設定分も含みます。"
                : "過去時点の売掛金残高ではありません。"}
            </p>
          </CardSection>
        </Card>
      )}
      {view === "profit" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["収益", r.ledger.revenue],
            ["費用", r.ledger.cost],
            ["損益", r.ledger.profit],
          ].map(([name, value]) => (
            <Card key={name}>
              <CardSection>
                <p className="text-sm text-slate-500">{name}・税込</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  ¥{yen(Number(value))}
                </p>
              </CardSection>
            </Card>
          ))}
        </div>
      )}
      {view === "receipts" || view === "payments" ? (
        <Bars
          title={
            view === "receipts" ? "取引先別の入金予定" : "支払先別の支払予定"
          }
          rows={groupAmounts(
            due.map((d) => ({ name: d.name, amount: d.amount })),
          )}
        />
      ) : view === "revenue" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bars title="取引先別 売上ランキング（税抜）" rows={r.customers} />
          <Bars title="商品別 売上ランキング（税抜）" rows={r.products} />
        </div>
      ) : view === "costs" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bars title="費用内訳（仕訳・税込）" rows={r.ledger.costs} />
          <Bars
            title="月別の費用"
            rows={r.ledger.months.map((m) => ({
              name: m.month,
              amount: m.cost,
            }))}
          />
        </div>
      ) : view === "profit" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bars
            title="月別の収益"
            rows={r.ledger.months.map((m) => ({
              name: m.month,
              amount: m.revenue,
            }))}
          />
          <Bars
            title="月別の損益"
            rows={r.ledger.months.map((m) => ({
              name: m.month,
              amount: m.profit,
            }))}
          />
        </div>
      ) : view === "departments" ? (
        <Bars
          title="部門別の損益"
          rows={r.ledger.departments.map((d) => ({
            name: d.name,
            amount: d.profit,
          }))}
        />
      ) : view === "cash" ? (
        <>
          <Card>
            <CardSection>
              <h2 className="font-semibold">今日から6か月の入出金見込み</h2>
              <p className="mt-2 text-sm">
                開始残高（帳簿）：¥{yen(r.opening)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                対象科目：{r.cashAccounts.join("・") || "未設定"}
                。開始残高の仕訳と実際の口座残高を確認してください。登録済みの予定だけを使用し、未登録の売上・費用や定期請求の未生成分は予測に含みません。期間フィルターに関係なく今日から6か月を表示します。
              </p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <p>期限超過の入金：¥{yen(r.cashflow.overdueIncoming)}</p>
                <p>期限超過の支払：¥{yen(r.cashflow.overdueOutgoing)}</p>
                <p>精算日未設定：¥{yen(r.cashflow.undated)}</p>
              </div>
              <p className="mt-2 text-xs text-amber-800">
                上記3項目は予測から除外しています。元の取引・精算予定日を確認してください。部門・事業所を絞ると全社の現預金残高を配賦できないため、入出金差引のみ表示します。
              </p>
            </CardSection>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars
              title="月別の入金予定"
              rows={r.cashflow.months.map((m) => ({
                name: m.month,
                amount: m.incoming,
              }))}
            />
            <Bars
              title="月別の支払予定"
              rows={r.cashflow.months.map((m) => ({
                name: m.month,
                amount: m.outgoing,
              }))}
            />
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t.title}</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/reports/export?${query}&format=csv`}
            className={`rounded-xl ${appButtonVariants.secondary}`}
          >
            CSV出力
          </a>
          <a
            href={`/api/reports/export?${query}&format=pdf`}
            className={`rounded-xl ${appButtonVariants.secondary}`}
          >
            PDF出力
          </a>
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">{t.note}</p>
      {view === "payments" && (
        <Card>
          <CardSection>
            <h3 className="font-medium">一括振込データの準備</h3>
            <p className="my-2 text-xs leading-5 text-slate-500">
              現在の一覧の全未払い分を1件1行で出力します。銀行コード・支店・口座・名義・金額を含む共通CSVです。銀行ごとの取込形式への変換・確認が必要です。出力では送金や支払済みへの変更は行いません。
            </p>
            {paymentReady ? (
              <a
                href={`/api/reports/export?${query}&format=transfer`}
                className={`inline-flex rounded-xl ${appButtonVariants.secondary}`}
              >
                一括振込準備CSV
              </a>
            ) : (
              <p className="text-sm text-amber-800">
                出力するには、対象の全件に予定日と振込先を登録してください。
              </p>
            )}
            <Link
              className="ml-3 text-sm text-emerald-800"
              href={`/reports?${new URLSearchParams({ ...r.f, view: "tags" })}`}
            >
              分類・振込先を設定 →
            </Link>
          </CardSection>
        </Card>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">{t.title}</caption>
          <thead className="bg-slate-50">
            <tr>
              {t.headers.map((h) => (
                <th scope="col" className="p-3" key={h}>
                  {h}
                </th>
              ))}
              {(view === "receipts" || view === "payments") && (
                <th scope="col" className="p-3">
                  確認
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {t.rows
              .slice((safePage - 1) * 100, safePage * 100)
              .map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {row.map((c, j) => (
                    <td
                      key={j}
                      className={`p-3 ${typeof c === "number" ? "text-right tabular-nums" : ""}`}
                    >
                      {typeof c === "number" ? yen(c) : c}
                    </td>
                  ))}
                  {(view === "receipts" || view === "payments") && (
                    <td className="p-3">
                      <Link
                        className="whitespace-nowrap text-emerald-800"
                        href={due[(safePage - 1) * 100 + i].href}
                      >
                        詳細 →
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
        {!t.rows.length && (
          <p className="p-8 text-center text-sm text-slate-500">
            該当する取引はありません。期間・分類や元の登録内容をご確認ください。
          </p>
        )}
      </div>
      {pageCount > 1 && (
        <nav
          aria-label="レポートのページ"
          className="flex items-center gap-4 text-sm"
        >
          {safePage > 1 && (
            <Link href={`/reports?${query}&page=${safePage - 1}`}>← 前へ</Link>
          )}
          <span>
            {safePage} / {pageCount}ページ（{t.rows.length}行）
          </span>
          {safePage < pageCount && (
            <Link href={`/reports?${query}&page=${safePage + 1}`}>次へ →</Link>
          )}
        </nav>
      )}
    </>
  );
}
