import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "next/navigation";
import { dateText, invoiceDateText } from "@/lib/accounting/model";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { AccountingLinks } from "@/components/accounting/links";
import { inputClass } from "@/lib/ui/form-classes";
export default async function LinkingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: user.id },
  });
  if (!setting) redirect("/accounting");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const [invoices, expenses, sources, matches, rules] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        createdById: user.id,
        mergedIntoId: null,
        ...(q
          ? {
              OR: [
                {
                  company: {
                    name: { contains: q, mode: "insensitive" as const },
                  },
                },
                { subject: { contains: q, mode: "insensitive" as const } },
                {
                  invoiceNumber: { contains: q, mode: "insensitive" as const },
                },
              ],
            }
          : {}),
      },
      include: { company: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
      take: 501,
    }),
    prisma.expense.findMany({
      where: {
        userId: user.id,
        ...(q
          ? {
              OR: [
                { supplier: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { dueDate: "asc" },
      take: 501,
    }),
    prisma.accountingSource.findMany({
      where: { userId: user.id, entryId: { not: null } },
      select: { key: true },
    }),
    prisma.receiptMatch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.recurringInvoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const limited = invoices.length > 500 || expenses.length > 500;
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="請求・支払連携"
        description="請求から入金まで、支払予定から出金までを帳簿につなげます。"
        action={
          <AppButtonLink href="/accounting" variant="secondary">
            帳簿へ戻る
          </AppButtonLink>
        }
      />
      <form className="flex flex-wrap gap-3">
        <input
          aria-label="連携対象を検索"
          name="q"
          defaultValue={q}
          placeholder="取引先・件名・請求書番号で検索"
          className={`${inputClass} max-w-md`}
        />
        <button className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white">
          検索
        </button>
      </form>
      {limited && (
        <p role="alert" className="text-sm text-amber-800">
          各一覧は500件まで表示します。検索して対象を絞ってください。
        </p>
      )}
      <AccountingLinks
        startDate={dateText(setting.startDate)}
        invoices={invoices.slice(0, 500).map((i) => ({
          id: i.id,
          number: i.invoiceNumber,
          companyId: i.companyId,
          company: i.company.name,
          subject: i.subject,
          status: i.status,
          issueDate: invoiceDateText(i.issueDate),
          dueDate: invoiceDateText(i.dueDate),
          amount: i.grandTotal,
          total: i.totalWithTax,
          receivedDate: i.receivedDate ? dateText(i.receivedDate) : null,
          version: i.updatedAt.toISOString(),
          taxRate: i.taxRate,
          withholding: i.withholdingEnabled,
        }))}
        expenses={expenses.slice(0, 500).map((e) => ({
          id: e.id,
          supplier: e.supplier,
          description: e.description,
          amount: e.amount,
          costMonth: e.costMonth,
          dueDate: dateText(e.dueDate),
          paidDate: e.paidDate ? dateText(e.paidDate) : null,
          category: e.category,
          version: e.updatedAt.toISOString(),
        }))}
        linkedKeys={sources.map((s) => s.key)}
        matches={matches.map((m) => ({
          id: m.id,
          date: dateText(m.date),
          payer: m.payer,
          amount: m.amount,
          cancelled: !!m.cancelledAt,
        }))}
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          nextMonth: r.nextMonth,
          issueDay: r.issueDay,
          dueDays: r.dueDays,
          active: r.active,
        }))}
      />
    </PageShell>
  );
}
