import Link from "next/link";

import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { formatInvoiceNumberCompact } from "@/lib/invoice/formatInvoiceNumber";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { DataTableShell, dataTableCell, dataTableHeadCell, dataTableRow } from "@/components/ui/data-table";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export default async function DashboardPage() {
  const user = await requireUser();

  const [companyCount, invoiceCount, recentInvoices] = await Promise.all([
    prisma.company.count({ where: { userId: user.id } }),
    prisma.invoice.count({ where: { createdById: user.id } }),
    prisma.invoice.findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        subject: true,
        grandTotal: true,
        createdAt: true,
        company: { select: { name: true } },
      },
    }),
  ]);

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="ダッシュボード"
        description={`ようこそ、${user.name} さん。業務の概要と直近の請求書を確認できます。`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        <KpiStatCard label="登録会社数" value={companyCount} />
        <KpiStatCard label="請求書総数" value={invoiceCount} />
        <Card className="md:col-span-1">
          <CardSection className="!p-5 md:!p-6">
            <h2 className="text-sm font-semibold text-slate-900">クイック操作</h2>
            <p className="mt-1 text-sm text-slate-500">よく使う機能からすぐに開始できます。</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <AppButtonLink href="/invoices/new" variant="primary">
                請求書を作成
              </AppButtonLink>
              <AppButtonLink href="/invoices" variant="secondary">
                請求書一覧
              </AppButtonLink>
              <AppButtonLink href="/companies" variant="secondary">
                会社一覧
              </AppButtonLink>
            </div>
          </CardSection>
        </Card>
      </div>

      <Card>
        <CardSection className="space-y-6">
          <SectionHeader
            variant="section"
            title="最近の請求書"
            description="直近5件を表示しています。"
            action={
              <AppButtonLink href="/invoices" variant="ghost" className="!px-3">
                すべて見る →
              </AppButtonLink>
            }
          />

          <DataTableShell>
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className={`${dataTableHeadCell} w-[9.5rem]`}>請求書番号</th>
                  <th className={`${dataTableHeadCell} w-[6.5rem]`}>会社</th>
                  <th className={dataTableHeadCell}>件名</th>
                  <th className={`${dataTableHeadCell} w-[6.5rem] text-right`}>合計金額</th>
                  <th className={`${dataTableHeadCell} w-[5.5rem]`}>作成日</th>
                  <th className={`${dataTableHeadCell} w-[3.5rem] text-right`}></th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className={dataTableRow}>
                    <td
                      className={`${dataTableCell} max-w-0 truncate font-mono text-xs text-slate-600`}
                      title={inv.invoiceNumber}
                    >
                      {formatInvoiceNumberCompact(inv.invoiceNumber)}
                    </td>
                    <td className={`${dataTableCell} max-w-0 truncate`} title={inv.company.name}>
                      {inv.company.name}
                    </td>
                    <td className={`${dataTableCell} max-w-0 truncate`} title={inv.subject}>
                      {inv.subject}
                    </td>
                    <td className={`${dataTableCell} whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900`}>
                      {yen(inv.grandTotal)}円
                    </td>
                    <td className={`${dataTableCell} whitespace-nowrap tabular-nums text-slate-600`}>
                      {new Date(inv.createdAt).toLocaleDateString("ja-JP")}
                    </td>
                    <td className={`${dataTableCell} text-right`}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <tr>
                    <td className="px-4 py-14 text-center text-sm text-slate-500" colSpan={6}>
                      まだ請求書がありません。「請求書を作成」から作成してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DataTableShell>
        </CardSection>
      </Card>
    </PageShell>
  );
}
