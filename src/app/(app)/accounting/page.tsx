import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { isTaxCategory, taxCategoryInfo } from "@/lib/tax/categories";
import { hasRole } from "@/lib/workspace/access";
import { accountingReport } from "@/lib/accounting/reports";
import { dateText, yen } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { hasOpeningBalance } from "@/lib/accounting/opening";
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
  const ws = await requireWorkspacePage("VIEWER");
  const sp = await searchParams;
  const str = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : "";
  // 互いに待たずに、同時に問い合わせる。
  const [setting, accounts] = await Promise.all([
    prisma.accountingSetting.findUnique({ where: { userId: ws.ownerId } }),
    prisma.account.findMany({
      where: { userId: ws.ownerId },
      orderBy: { code: "asc" },
    }),
  ]);
  const view = [
    "money",
    "journal",
    "ledger",
    "transactions",
    "tax",
    "accounts",
  ].includes(str("view"))
    ? str("view")
    : "money";
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
      report = await accountingReport(ws.ownerId, {
        view: view === "money" ? "journal" : view,
        from,
        to,
        accountId,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "帳簿を表示できませんでした。";
    }
  // 取消の確認・開始残高・取込口座は、互いに関係がないので、同時に問い合わせる。
  const [reversals, openingDone, feeds] = await Promise.all([
    report
      ? prisma.journalEntry.findMany({
          where: {
            userId: ws.ownerId,
            reversalOf: { in: report.entries.map((e) => e.id) },
          },
          select: { reversalOf: true },
        })
      : Promise.resolve([] as { reversalOf: string | null }[]),
    setting ? hasOpeningBalance(prisma, ws.ownerId) : Promise.resolve(true),
    setting
      ? prisma.statementFeed.findMany({
          where: { userId: ws.ownerId },
          select: { accountId: true },
        })
      : Promise.resolve([] as { accountId: string }[]),
  ]);
  const reversed = new Set(reversals.map((e) => e.reversalOf));
  const moneyIds = new Set([
    ...accounts
      .filter((a) => a.code === "100" || a.code === "110")
      .map((a) => a.id),
    ...feeds.map((f) => f.accountId),
  ]);
  /** 1件の記録を、「入金／出金／移動」と金額、相手の分類でやさしく言い表す。 */
  const plain = (e: NonNullable<typeof report>["entries"][number]) => {
    const inMoney = e.lines.filter((l) => moneyIds.has(l.accountId));
    const net = inMoney.reduce((n, l) => n + l.debit - l.credit, 0);
    const others = e.lines.filter((l) => !moneyIds.has(l.accountId));
    const names = [...new Set(others.map((l) => l.account.name))].join("・");
    if (!inMoney.length) {
      const total = e.lines.reduce((n, l) => n + l.debit, 0);
      // 請求書の発行や、支払管理・経費精算の登録など、お金がまだ動いていない記録。
      if (e.lines.some((l) => l.account.code === "120" && l.debit > 0))
        return {
          kind: "入金待ち",
          tone: "text-amber-700",
          amount: total,
          names: "請求書の売上（まだ入金されていません）",
        };
      if (
        e.lines.some(
          (l) =>
            (l.account.code === "200" || l.account.code === "210") &&
            l.credit > 0,
        )
      )
        return {
          kind: "支払い待ち",
          tone: "text-amber-700",
          amount: total,
          names: `${
            others
              .map((l) => l.account.name)
              .filter((n) => n !== "買掛金" && n !== "未払金")
              .join("・") || "費用"
          }（まだ支払っていません）`,
        };
      return {
        kind: "その他",
        tone: "text-slate-600",
        amount: total,
        names: e.lines.map((l) => l.account.name).join(" → "),
      };
    }
    if (net > 0)
      return { kind: "入金", tone: "text-emerald-700", amount: net, names };
    if (net < 0)
      return { kind: "出金", tone: "text-rose-700", amount: -net, names };
    return {
      kind: "移動",
      tone: "text-sky-700",
      amount: inMoney.reduce((n, l) => n + l.debit, 0),
      names: "口座・現金の移動",
    };
  };
  const exportQuery = new URLSearchParams({
    view: view === "money" ? "journal" : view,
    from,
    to,
    accountId,
  });
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="お金の出入り"
        description="入ってきたお金・出ていったお金を記録して、あとから見返せます。"
        action={
          setting && hasRole(ws.role, "EDITOR") ? (
            <AppButtonLink href="/accounting/transactions/new">
              ＋ お金の出入りを記録
            </AppButtonLink>
          ) : undefined
        }
      />
      {!setting ? (
        <AccountingSetup />
      ) : (
        <>
          {!openingDone && hasRole(ws.role, "ADMIN") && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                最初に、いまの状況を入力しましょう。
              </p>
              <p className="mt-1">
                現金・預金・借入などが、会計をはじめる日にいくらだったかを答えます（約2分）。
              </p>
              <div className="mt-3">
                <AppButtonLink href="/accounting/opening">
                  いまの状況を入力する
                </AppButtonLink>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <AppButtonLink
              href="/accounting?view=money"
              variant={view === "money" ? "selected" : "secondary"}
            >
              お金の出入り
            </AppButtonLink>
            <AppButtonLink href="/reports" variant="secondary">
              経営レポート
            </AppButtonLink>
            <AppButtonLink href="/accounting/statements" variant="secondary">
              銀行・カード明細の取込
            </AppButtonLink>
            <AppButtonLink href="/accounting/linking" variant="secondary">
              請求・支払連携
            </AppButtonLink>
            <AppButtonLink href="/accounting/assets" variant="secondary">
              固定資産
            </AppButtonLink>
            {hasRole(ws.role, "APPROVER") && (
              <AppButtonLink href="/accounting/monthly" variant="secondary">
                月ごとの売上と費用
              </AppButtonLink>
            )}
            {hasRole(ws.role, "APPROVER") && (
              <AppButtonLink href="/accounting/sales-table" variant="secondary">
                売上管理表
              </AppButtonLink>
            )}
            {hasRole(ws.role, "APPROVER") && (
              <AppButtonLink href="/accounting/links" variant="secondary">
                提出リンク
              </AppButtonLink>
            )}
            {hasRole(ws.role, "APPROVER") && (
              <AppButtonLink href="/accounting/received" variant="secondary">
                書類の受け取り状況
              </AppButtonLink>
            )}
            <AppButtonLink href="/accounting/evidence" variant="secondary">
              証憑ファイルボックス
            </AppButtonLink>
          </div>
          <details
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
            open={[
              "journal",
              "ledger",
              "transactions",
              "tax",
              "accounts",
            ].includes(view)}
          >
            <summary className="cursor-pointer font-medium text-slate-700">
              経理の方向けの帳簿（仕訳帳・総勘定元帳など）
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["journal", "仕訳帳"],
                ["ledger", "総勘定元帳"],
                ["transactions", "取引データ"],
                ["tax", "消費税区分別"],
                ["accounts", "勘定科目"],
              ].map(([key, name]) => (
                <AppButtonLink
                  key={key}
                  href={`/accounting?view=${key}`}
                  variant={view === key ? "selected" : "secondary"}
                >
                  {name}
                </AppButtonLink>
              ))}
              {hasRole(ws.role, "EDITOR") && (
                <AppButtonLink
                  href="/accounting/transactions/advanced"
                  variant="secondary"
                >
                  仕訳で入力
                </AppButtonLink>
              )}
            </div>
          </details>
          <p className="text-xs text-slate-500">
            記録の開始日 {dateText(setting.startDate)} ／ 金額は円・税込みです。
            請求書・支払管理・経費精算に入力した内容は、自動でここに記録されます。それ以外のお金（利息・現金売上・給与・税金など）は、「お金の出入りを記録」か「銀行・カード明細の取込」で追加します。
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
                      {view === "money" ? "お金の出入り" : report.title}{" "}
                      {view !== "tax" && (
                        <span className="text-sm font-normal text-slate-500">
                          {report.entries.length}件
                        </span>
                      )}
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
                  {view === "money" ? (
                    <div className="space-y-3">
                      {[...report.entries].reverse().map((e) => {
                        const p = plain(e);
                        const cancelled = reversed.has(e.id);
                        return (
                          <Card key={e.id}>
                            <CardSection>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-500">
                                    {dateText(e.date)}
                                    {e.source === "MANUAL"
                                      ? ""
                                      : e.source === "REVERSAL"
                                        ? " ／ 取り消し"
                                        : " ／ 自動で作成"}
                                    {cancelled ? " ／ 取り消し済み" : ""}
                                  </p>
                                  <p className="mt-1 font-semibold">{e.memo}</p>
                                  <p className="text-xs text-slate-500">
                                    {p.names}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={`text-lg font-semibold tabular-nums ${cancelled ? "text-slate-400 line-through" : p.tone}`}
                                  >
                                    <span className="mr-2 text-xs font-medium">
                                      {p.kind}
                                    </span>
                                    ¥{yen(p.amount)}
                                  </p>
                                  {e.source === "MANUAL" && !cancelled && (
                                    <div className="mt-1">
                                      <CancelEntry
                                        id={e.id}
                                        date={dateText(e.date)}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardSection>
                          </Card>
                        );
                      })}
                      {!report.entries.length && (
                        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                          この期間の記録はありません。「お金の出入りを記録」から入力できます。
                        </p>
                      )}
                    </div>
                  ) : view === "journal" ? (
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
                                        {isTaxCategory(l.taxCategory) && (
                                          <span className="ml-2 text-xs text-slate-500">
                                            （
                                            {
                                              taxCategoryInfo[l.taxCategory]
                                                .label
                                            }
                                            ）
                                          </span>
                                        )}
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
