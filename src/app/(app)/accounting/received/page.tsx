import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import { yen } from "@/lib/accounting/model";
import {
  normalizeSender,
  notYetThisMonth,
  receivedRows,
  shiftMonthText,
  summarizeBySender,
  validMonthText,
} from "@/lib/accounting/received";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass } from "@/lib/ui/form-classes";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

export default async function ReceivedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("APPROVER");
  const sp = await searchParams;
  const raw = typeof sp.month === "string" ? sp.month : "";
  const month = validMonthText(raw) ? raw : japanToday().slice(0, 7);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const [rows, previous] = await Promise.all([
    receivedRows(prisma, ws, month),
    receivedRows(prisma, ws, shiftMonthText(month, -1)),
  ]);
  const pendingSubmissions = await prisma.submission.findMany({
    where: { ownerId: ws.ownerId, status: "SUBMITTED" },
    orderBy: { submittedAt: "asc" },
    take: 20,
    select: {
      id: true,
      month: true,
      total: true,
      senderName: true,
      submitter: { select: { name: true } },
      link: { select: { label: true } },
    },
  });
  const nq = normalizeSender(q);
  const shown = nq
    ? rows.filter((r) => normalizeSender(r.sender).includes(nq))
    : rows;
  const senders = summarizeBySender(shown);
  const waiting = notYetThisMonth(rows, previous);
  const invoices = shown.filter((r) => r.kind === "INVOICE").length;
  const receipts = shown.length - invoices;
  const total = shown.reduce((n, r) => n + r.amount, 0);
  const nav = (m: string) =>
    `/accounting/received?month=${m}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="書類の受け取り状況"
        description="誰が・いつ・何月分の請求書と領収書を送ってきたかを、月ごとに確認できます。"
      />
      <Card>
        <CardSection>
          <form className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              何月分
              <input
                type="month"
                name="month"
                defaultValue={month}
                required
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              送ってきた人・支払先で絞る
              <input
                name="q"
                defaultValue={q}
                maxLength={60}
                placeholder="例：山田"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <button className={`rounded-xl ${appButtonVariants.primary}`}>
              表示する
            </button>
            <div className="flex gap-2">
              <AppButtonLink
                href={nav(shiftMonthText(month, -1))}
                variant="secondary"
              >
                ← 前の月
              </AppButtonLink>
              <AppButtonLink
                href={nav(shiftMonthText(month, 1))}
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
          ["請求書", `${invoices}件`],
          ["領収書", `${receipts}件`],
          ["金額の合計（税込）", `¥${yen(total)}`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardSection>
              <p className="text-xs text-slate-500">
                {month.replace("-", "年")}月分 ／ {label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {value}
              </p>
            </CardSection>
          </Card>
        ))}
      </div>

      <Card>
        <CardSection>
          <h2 className="font-semibold">
            月末で締めて、まとめて出力（税理士へ渡す用）
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {month.replace("-", "年")}
            月分の書類のファイルを、1つのZIPにまとめます。「領収書」「請求書」のフォルダに分け、ファイル名は「送ってきた人_月_金額」です。添付のない書類も、中の「一覧.csv」に残ります。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AppButtonLink href={`/api/accounting/receipts-zip?month=${month}`}>
              領収書と請求書をZIPで出力
            </AppButtonLink>
            <AppButtonLink
              href={`/api/accounting/receipts-zip?month=${month}&invoices=0`}
              variant="secondary"
            >
              領収書だけをZIPで出力
            </AppButtonLink>
            <span className="text-xs text-slate-500">
              ファイルのある書類：{rows.filter((r) => r.hasFile).length}件 ／
              添付なし：{rows.filter((r) => !r.hasFile).length}件
            </span>
          </div>
        </CardSection>
      </Card>

      {pendingSubmissions.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
        >
          <p className="font-semibold">
            承認待ちの提出が{pendingSubmissions.length}件あります
          </p>
          <ul className="mt-1 list-disc pl-5">
            {pendingSubmissions.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/accounting/submissions/${p.id}`}
                  className="font-medium underline"
                >
                  {p.senderName || p.submitter?.name || p.link?.label}さん（
                  {p.month.replace("-", "年")}月分・¥{yen(p.total)}）
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {waiting.length > 0 && !nq && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            先月は届いて、今月はまだ届いていない人
          </p>
          <p className="mt-1">{waiting.join("、")}</p>
          <p className="mt-1 text-xs">
            先月と比べた目安です。今月は送らなくてよい人も含まれます。
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">送ってきた人ごと</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="p-3">送ってきた人・支払先</th>
                <th className="p-3 text-right">請求書</th>
                <th className="p-3 text-right">領収書</th>
                <th className="p-3 text-right">金額（税込）</th>
                <th className="p-3">最後に届いた日時</th>
                <th className="p-3">ファイル</th>
              </tr>
            </thead>
            <tbody>
              {senders.map((s) => (
                <tr key={s.sender} className="border-t border-slate-100">
                  <td className="p-3 font-medium">{s.sender}</td>
                  <td className="p-3 text-right tabular-nums">{s.invoices}</td>
                  <td className="p-3 text-right tabular-nums">{s.receipts}</td>
                  <td className="p-3 text-right tabular-nums">
                    ¥{yen(s.amount)}
                  </td>
                  <td className="p-3">{fmt(s.lastReceivedAt)}</td>
                  <td className="p-3">
                    {s.withoutFile ? (
                      <span className="text-amber-800">
                        {s.withoutFile}件 添付なし
                      </span>
                    ) : (
                      <span className="text-emerald-700">すべて添付あり</span>
                    )}
                  </td>
                </tr>
              ))}
              {!senders.length && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    この月に届いた書類はありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">届いた書類の一覧（新しい順）</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="p-3">届いた日時</th>
                <th className="p-3">送ってきた人・支払先</th>
                <th className="p-3">種類</th>
                <th className="p-3">何月分</th>
                <th className="p-3 text-right">金額（税込）</th>
                <th className="p-3">状態</th>
                <th className="p-3">ファイル</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="p-3 whitespace-nowrap">{fmt(r.receivedAt)}</td>
                  <td className="p-3">
                    <Link href={r.href} className="font-medium text-sky-700">
                      {r.sender}
                    </Link>
                    {r.registeredBy && r.registeredBy !== r.sender && (
                      <span className="block text-xs text-slate-500">
                        登録：{r.registeredBy}
                      </span>
                    )}
                  </td>
                  <td className="p-3">{r.label}</td>
                  <td className="p-3">{r.month.replace("-", "年")}月分</td>
                  <td className="p-3 text-right tabular-nums">
                    ¥{yen(r.amount)}
                  </td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3">
                    {r.fileHref ? (
                      <a href={r.fileHref} className="text-sky-700">
                        開く
                      </a>
                    ) : (
                      <span className="text-amber-800">添付なし</span>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    この月に届いた書類はありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          支払管理に登録した請求書、経費精算（下書きを除く）の領収書、証憑ファイルボックスの請求書・領収書をまとめて表示します。「何月分」は、支払管理は対象月、経費精算・証憑は日付の月です。
        </p>
      </section>
    </PageShell>
  );
}
