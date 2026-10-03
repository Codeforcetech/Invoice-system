import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { monthStart, shiftMonth } from "@/lib/dashboard/sales";
import { yen } from "@/lib/accounting/model";
import { Card, CardSection } from "@/components/ui/card";
export async function DashboardReports({
  userId,
  from,
  to,
}: {
  userId: string;
  from: string;
  to: string;
}) {
  const [setting, accounts, sums] = await Promise.all([
    prisma.accountingSetting.findUnique({ where: { userId } }),
    prisma.account.findMany({
      where: { userId, kind: { in: ["REVENUE", "EXPENSE"] } },
      select: { id: true, kind: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        userId,
        entry: {
          date: { gte: monthStart(from), lt: monthStart(shiftMonth(to, 1)) },
        },
      },
      _sum: { debit: true, credit: true },
    }),
  ]);
  let revenue = 0,
    cost = 0;
  for (const s of sums) {
    const kind = accounts.find((a) => a.id === s.accountId)?.kind;
    if (kind === "REVENUE")
      revenue += (s._sum.credit ?? 0) - (s._sum.debit ?? 0);
    if (kind === "EXPENSE") cost += (s._sum.debit ?? 0) - (s._sum.credit ?? 0);
  }
  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">経営レポート</h2>
            <p className="mt-1 text-xs text-slate-500">
              {from}〜{to} ／ 全取引先・登録済み仕訳・税込経理
            </p>
          </div>
          <Link
            className="text-sm text-sky-700"
            href={`/reports?from=${from}&to=${to}`}
          >
            詳しく確認 →
          </Link>
        </div>
        {setting ? (
          <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ["収益", revenue],
              ["費用", cost],
              ["損益", revenue - cost],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  ¥{yen(Number(value))}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="my-4 text-sm text-slate-500">
            会計の初期設定と記帳後に損益が表示されます。
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["receipts", "入金予定"],
            ["payments", "支払予定"],
            ["revenue", "売上ランキング"],
            ["costs", "費用内訳"],
            ["profit", "損益"],
            ["cash", "資金繰り"],
          ].map(([view, label]) => (
            <Link
              key={view}
              href={`/reports?view=${view}&from=${from}&to=${to}`}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-sky-700 hover:bg-slate-50"
            >
              {label} →
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          上の請求書ベースの売上とは集計基準が異なります。未記帳の取引は損益に含みません。
        </p>
      </CardSection>
    </Card>
  );
}
