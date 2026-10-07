import { DashboardReports } from "@/components/management/dashboard-reports";
import { listExpenses } from "@/actions/expense-actions";
import { expenseSummary, japanToday } from "@/lib/expenses/model";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { hasRole } from "@/lib/workspace/access";
import { prisma } from "@/lib/db/prisma";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  resolveSalesFilters,
  summarizeSales,
  monthStart,
  shiftMonth,
  type SearchValues,
} from "@/lib/dashboard/sales";
export default async function DashboardPage(props: {
  searchParams?: Promise<SearchValues>;
}) {
  const ws = await requireWorkspacePage("VIEWER");
  const filters = resolveSalesFilters(await props.searchParams);
  // 売上・支払い・経営レポートは、管理者だけに見せる。
  const finance = hasRole(ws.role, "ADMIN");
  const owner = { createdById: ws.ownerId, mergedIntoId: null };
  const [
    companies,
    invoiceCount,
    draftCount,
    confirmedCount,
    groups,
    recent,
    settings,
  ] = await Promise.all([
    prisma.company.findMany({
      where: { userId: ws.ownerId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.invoice.count({ where: owner }),
    prisma.invoice.count({ where: { ...owner, status: "DRAFT" } }),
    prisma.invoice.count({ where: { ...owner, status: "CONFIRMED" } }),
    prisma.invoice.groupBy({
      by: ["issueDate", "companyId"],
      where: {
        ...owner,
        status: "ISSUED",
        company: { userId: ws.ownerId },
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        issueDate: {
          gte: monthStart(filters.queryFrom),
          lt: monthStart(shiftMonth(filters.to, 1)),
        },
      },
      _sum: { subtotal: true, grandTotal: true },
      _count: true,
    }),
    prisma.invoice.findMany({
      where: owner,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        invoiceNumber: true,
        subject: true,
        grandTotal: true,
        status: true,
        company: { select: { name: true } },
      },
    }),
    prisma.systemSetting.findUnique({
      where: { userId: ws.ownerId },
      select: {
        companyName: true,
        address: true,
        bankName: true,
        accountNumber: true,
        email: true,
      },
    }),
  ]);
  const expenses = finance ? await listExpenses() : [];
  const expenseTotals = expenseSummary(
    expenses,
    filters.current,
    filters.current,
    japanToday(),
  );
  return (
    <DashboardView
      canEdit={hasRole(ws.role, "EDITOR")}
      finance={finance}
      reports={
        finance ? (
          <DashboardReports
            userId={ws.ownerId}
            from={filters.from}
            to={filters.to}
          />
        ) : undefined
      }
      data={{
        name: ws.user.name,
        costs: {
          month: filters.current,
          total: expenseTotals.cost,
          paid: expenseTotals.paid,
          overdueCount: expenseTotals.overdue.length,
          dueSoonCount: expenseTotals.dueSoon.length,
        },
        companyCount: companies.length,
        companies,
        filters,
        sales: summarizeSales(finance ? groups : [], companies, filters),
        confirmedCount,
        invoiceCount,
        draftCount,
        recent,
        setup: {
          company: Boolean(settings?.companyName && settings?.address),
          bank: Boolean(settings?.bankName && settings?.accountNumber),
          email: Boolean(settings?.email),
        },
      }}
    />
  );
}
