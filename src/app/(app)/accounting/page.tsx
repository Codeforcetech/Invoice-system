import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { accountingReport } from "@/lib/accounting/reports";
import { dateText, yen } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { AccountingSetup } from "@/components/accounting/setup";
import { AccountManager } from "@/components/accounting/accounts";
import { CancelEntry } from "@/components/accounting/cancel-entry";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : "";
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: user.id },
  });
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    orderBy: { code: "asc" },
  });
  const view = ["journal", "ledger", "transactions", "accounts"].includes(
    str("view"),
  )
    ? str("view")
    : "journal";
  const from =
      str("from") ||
      (setting
        ? dateText(setting.startDate)
        : `${new Date().getFullYear()}-01-01`),
    to = str("to") || japanToday();
  const accountId = str("accountId") || accounts[0]?.id || "";
  let report: Awaited<ReturnType<typeof accountingReport>> | null = null,
    error = "";
  if (setting && view !== "accounts")
    try {
      report = await accountingReport(user.id, { view, from, to, accountId });
    } catch (e) {
      error = e instanceof Error ? e.message : "帳簿を表示できませんでした。";
    }
  const reversals = report
    ? await prisma.journalEntry.findMany({
        where: {
          userId: user.id,
          reversalOf: { in: report.entries.map((e) => e.id) },
        },
        select: { reversalOf: true },
      })
    : [];
  const reversed = new Set(reversals.map((e) => e.reversalOf));
  const exportQuery = new URLSearchParams({ view, from, to, accountId });
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="会計・帳簿"
        description="日々の取引を記録し、仕訳と科目別の残高を確認します。"
        action={
          setting ? (
            <AppButtonLink href="/accounting/transactions/new">
              ＋ 取引を入力
            </AppButtonLink>
          ) : undefined
        }
      />
      {!setting ? (
        <AccountingSetup />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <AppButtonLink href="/reports" variant="secondary">経営レポート</AppButtonLink>
            {[
              ["journal", "仕訳帳"],
              ["ledger", "総勘定元帳"],
              ["transactions", "取引データ"],
              ["accounts", "勘定科目"],
            ].map(([key, name]) => (
              <AppButtonLink
                key={key}
                href={`/accounting?view=${key}`}
                variant={view === key ? "primary" : "secondary"}
              >
                {name}
              </AppButtonLink>
            ))}
            <AppButtonLink href="/accounting/statements" variant="secondary">
              明細取込・自動仕訳
            </AppButtonLink>
            <AppButtonLink href="/accounting/linking" variant="secondary">
              請求・支払連携
            </AppButtonLink>
            <AppButtonLink href="/accounting/assets" variant="secondary">
              固定資産
            </AppButtonLink>
          </div>
          <p className="text-xs text-slate-500">
            会計開始日 {dateText(setting.startDate)} ／ 円・税込経理 ／
            開始残高は振替伝票で登録してください。
          </p>
          {view === "accounts" ? (
            <AccountManager accounts={accounts} />
          ) : (
            <>
              <Card>
                <CardSection>
                  <form className="flex flex-wrap items-end gap-4">
                    <input type="hidden" name="view" value={view} />
                    <label className="text-sm">
                      開始日
                      <input
                        required
                        type="date"
                        name="from"
                        defaultValue={from}
                        className={`mt-1 ${inputClass}`}
                      />
                    </label>
                    <label className="text-sm">
                      終了日
                      <input
                        required
                        type="date"
                        name="to"
                        defaultValue={to}
                        className={`mt-1 ${inputClass}`}
                      />
                    </label>
                    {view === "ledger" && (
                      <label className="text-sm">
                        勘定科目
                        <select
                          name="accountId"
                          defaultValue={accountId}
                          className={`mt-1 ${selectClass}`}
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      className={`rounded-xl ${appButtonVariants.primary}`}
                    >
                      表示する
                    </button>
                  </form>
                </CardSection>
              </Card>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
                >
                  {error}
                </p>
              )}
              {report && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">
                      {report.title}{" "}
                      <span className="text-sm font-normal text-slate-500">
                        {report.entries.length}件
                      </span>
                    </h2>
                    <div className="flex gap-2">
                      <a
                        className={`rounded-xl ${appButtonVariants.secondary}`}
                        href={`/api/accounting/export?${exportQuery}&format=csv`}
                      >
                        CSV出力
                      </a>
                      <a
                        className={`rounded-xl ${appButtonVariants.secondary}`}
                        href={`/api/accounting/export?${exportQuery}&format=pdf`}
                      >
                        PDF出力
                      </a>
                    </div>
                  </div>
                  {view === "ledger" && (
                    <div className="flex flex-wrap gap-6 rounded-xl bg-white p-5 text-sm">
                      繰越残高 ¥{yen(report.opening)}
                      <strong>期末残高 ¥{yen(report.balance)}</strong>
                      <span className="text-slate-500">
                        資産・費用は借方、負債・純資産・収益は貸方を正の残高として表示
                      </span>
                    </div>
                  )}
                  {view === "journal" ? (
                    <div className="space-y-4">
                      {report.entries.map((e) => (
                        <Card key={e.id}>
                          <CardSection>
                            <div className="flex flex-wrap justify-between gap-3">
                              <div>
                                <p className="text-xs text-slate-500">
                                  {dateText(e.date)} ／{" "}
                                  {e.source === "MANUAL"
                                    ? "手入力"
                                    : e.source === "REVERSAL"
                                      ? "取消仕訳"
                                      : "自動連携"}
                                  {reversed.has(e.id) ? " ／ 取消済み" : ""}
                                </p>
                                <h3 className="mt-2 font-semibold">{e.memo}</h3>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  {e.id}
                                </p>
                              </div>
                              {e.source === "MANUAL" && !reversed.has(e.id) && (
                                <CancelEntry
                                  id={e.id}
                                  date={dateText(e.date)}
                                />
                              )}
                            </div>
                            <div className="mt-4 overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="p-2">勘定科目</th>
                                    <th className="p-2 text-right">借方</th>
                                    <th className="p-2 text-right">貸方</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {e.lines.map((l) => (
                                    <tr
                                      key={l.id}
                                      className="border-b border-slate-100"
                                    >
                                      <td className="p-2">
                                        {l.account.code} {l.account.name}
                                      </td>
                                      <td className="p-2 text-right tabular-nums">
                                        {l.debit ? yen(l.debit) : "—"}
                                      </td>
                                      <td className="p-2 text-right tabular-nums">
                                        {l.credit ? yen(l.credit) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardSection>
                        </Card>
                      ))}
                      {!report.entries.length && (
                        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                          この期間の仕訳はありません。「取引を入力」から登録できます。
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full min-w-[700px] text-left text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            {report.headers.map((h) => (
                              <th key={h} className="p-3">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.rows.map((r, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              {r.map((c, j) => (
                                <td
                                  key={j}
                                  className={`p-3 ${typeof c === "number" ? "text-right tabular-nums" : ""}`}
                                >
                                  {typeof c === "number" ? yen(c) : c}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    取消仕訳も帳簿に含まれます。残高は登録済みの取引に基づきます。
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
      <Link href="/guide" className="text-sm text-sky-700">
        使い方ガイド
      </Link>
    </PageShell>
  );
}
