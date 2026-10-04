import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import { yen } from "@/lib/accounting/model";
import type { Basis } from "@/lib/accounting/monthly";
import {
  filterLines,
  salesTableLines,
  UNASSIGNED,
  UNASSIGNED_NAME,
  NO_STORE_NAME,
} from "@/lib/accounting/sales-table";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardSection } from "@/components/ui/card";

const money = (n: number) => (n < 0 ? `-¥${yen(-n)}` : `¥${yen(n)}`);

export default async function SalesTableDetailPage({
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
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(get("month"))
    ? get("month")
    : "";
  const kind =
    get("kind") === "SALES" || get("kind") === "COST" ? get("kind") : "";
  const company = get("company").slice(0, 60);
  const store = get("store").slice(0, 60);

  const all = await salesTableLines(prisma, ws, year, basis);
  const list = filterLines(all, { month, company, store, kind });
  const total = list.reduce((n, l) => n + l[mode], 0);
  const companyName =
    company === ""
      ? "すべての取引先"
      : company === UNASSIGNED
        ? UNASSIGNED_NAME
        : (all.find((l) => l.companyId === company)?.companyName ?? "取引先");
  const storeName =
    store === ""
      ? company
        ? "すべての店舗"
        : ""
      : store === UNASSIGNED
        ? NO_STORE_NAME
        : (all.find((l) => l.storeId === store)?.storeName ?? "店舗");
  const back = `/accounting/sales-table?${new URLSearchParams({ year, basis, tax: mode })}`;
  const title = [
    companyName,
    storeName,
    kind === "SALES" ? "売上" : kind === "COST" ? "費用" : "売上と費用",
    month ? `${month.replace("-", "年")}月` : `${year}年`,
  ]
    .filter(Boolean)
    .join("　");

  return (
    <PageShell maxWidth="6xl">
      <Link href={back} className="text-sm text-sky-700">
        ← 売上管理表へ戻る
      </Link>
      <SectionHeader variant="page" title="明細" description={title} />
      <Card>
        <CardSection>
          <p className="text-xs text-slate-500">
            合計（{mode === "gross" ? "税込" : "税抜"}）　{list.length}件
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {money(total)}
          </p>
        </CardSection>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="p-3">日付</th>
              <th className="p-3">区分</th>
              <th className="p-3">取引先／店舗</th>
              <th className="p-3">内容</th>
              <th className="p-3">出どころ</th>
              <th className="p-3 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.key} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap p-3">{l.date}</td>
                <td className="p-3">{l.kind === "SALES" ? "売上" : "費用"}</td>
                <td className="p-3">
                  {l.companyId ? l.companyName : l.party}
                  {l.storeName && (
                    <span className="block text-xs text-slate-500">
                      {l.storeName}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {l.href ? (
                    <Link href={l.href} className="text-sky-700">
                      {l.content}
                    </Link>
                  ) : (
                    l.content
                  )}
                </td>
                <td className="p-3">{l.source}</td>
                <td className="p-3 text-right tabular-nums">
                  {money(l[mode])}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  該当する明細はありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
