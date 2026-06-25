import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { listInvoices, type InvoiceListFilters } from "@/actions/invoice-actions";
import { InvoiceListTable } from "@/app/(app)/invoices/_components/invoice-list-table";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { inputClass, labelClassXs, selectClass } from "@/lib/ui/form-classes";

function toStr(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function InvoicesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = (await props.searchParams) ?? {};

  const companyId = toStr(sp.companyId) || undefined;
  const q = toStr(sp.q) || undefined;
  const status = (toStr(sp.status) || "ALL") as InvoiceListFilters["status"];
  const withholding = (toStr(sp.withholding) || "ALL") as InvoiceListFilters["withholding"];

  const [companies, rows] = await Promise.all([
    prisma.company.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    listInvoices({ companyId, q, status, withholding }),
  ]);

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="請求書一覧"
        description="自分が作成した請求書のみ表示されます。"
        action={<AppButtonLink href="/invoices/new">新規作成</AppButtonLink>}
      />

      <Card>
        <CardSection className="!p-4 sm:!p-6">
          <form className="grid grid-cols-1 gap-4 md:grid-cols-5 md:gap-4">
            <div className="md:col-span-2">
              <label className={labelClassXs}>件名検索</label>
              <input
                name="q"
                defaultValue={q ?? ""}
                className={`mt-1 ${inputClass}`}
                placeholder="件名で検索"
              />
            </div>

            <div>
              <label className={labelClassXs}>会社</label>
              <select name="companyId" defaultValue={companyId ?? ""} className={`mt-1 ${selectClass}`}>
                <option value="">すべて</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClassXs}>ステータス</label>
              <select name="status" defaultValue={status ?? "ALL"} className={`mt-1 ${selectClass}`}>
                <option value="ALL">すべて</option>
                <option value="DRAFT">下書き</option>
                <option value="CONFIRMED">確定</option>
                <option value="ISSUED">発行済み</option>
              </select>
            </div>

            <div>
              <label className={labelClassXs}>源泉所得税</label>
              <select name="withholding" defaultValue={withholding ?? "ALL"} className={`mt-1 ${selectClass}`}>
                <option value="ALL">すべて</option>
                <option value="ON">あり</option>
                <option value="OFF">なし</option>
              </select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:col-span-5">
              <AppButtonLink href="/invoices" variant="secondary">
                クリア
              </AppButtonLink>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
              >
                絞り込み
              </button>
            </div>
          </form>
        </CardSection>
      </Card>

      <div className="min-w-0">
        <InvoiceListTable rows={rows} />
      </div>
    </PageShell>
  );
}
