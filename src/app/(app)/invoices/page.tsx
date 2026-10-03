import { invoiceDateFilter } from "@/lib/dashboard/sales";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { hasRole } from "@/lib/workspace/access";
import {
  listInvoices,
  type InvoiceListFilters,
} from "@/actions/invoice-actions";
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
  const ws = await requireWorkspacePage("VIEWER");
  const sp = (await props.searchParams) ?? {};

  let fromMonth = toStr(sp.fromMonth),
    toMonth = toStr(sp.toMonth);
  let dateError = "";
  try {
    invoiceDateFilter(fromMonth, toMonth);
  } catch {
    dateError = "請求日の期間が正しくないため、期間指定を解除しました。";
    fromMonth = toMonth = "";
  }
  const companyId = toStr(sp.companyId) || undefined;
  const q = toStr(sp.q) || undefined;
  let status = (toStr(sp.status) || "ALL") as InvoiceListFilters["status"];
  const withholding = (toStr(sp.withholding) ||
    "ALL") as InvoiceListFilters["withholding"];

  const receipt = (toStr(sp.receipt) || "ALL") as InvoiceListFilters["receipt"];
  if (["PAID", "UNPAID", "OVERDUE"].includes(receipt ?? "")) status = "ISSUED";
  const [companies, rows] = await Promise.all([
    prisma.company.findMany({
      where: { userId: ws.ownerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    listInvoices({
      companyId,
      q,
      status,
      withholding,
      fromMonth,
      toMonth,
      receipt,
    }),
  ]);

  const statusHref = (value: string) =>
    `/invoices?${new URLSearchParams({ status: value, receipt: "ALL", companyId: companyId ?? "", q: q ?? "", withholding: withholding ?? "ALL", fromMonth, toMonth })}`;
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="請求書一覧"
        description="最近更新した順に表示します。番号・会社名・件名から検索できます。"
        action={
          hasRole(ws.role, "EDITOR") ? (
            <AppButtonLink href="/invoices/new">＋ 請求書を作成</AppButtonLink>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AppButtonLink
          href={statusHref("ALL")}
          variant={status === "ALL" ? "primary" : "secondary"}
        >
          すべて
        </AppButtonLink>
        <AppButtonLink
          href={statusHref("DRAFT")}
          variant={status === "DRAFT" ? "primary" : "secondary"}
        >
          下書きを再開
        </AppButtonLink>
        <AppButtonLink
          href={statusHref("ISSUED")}
          variant={status === "ISSUED" ? "primary" : "secondary"}
        >
          発行済み
        </AppButtonLink>
        <span className="ml-auto text-xs text-slate-500">
          表示中 {rows.length} 件
        </span>
      </div>
      {dateError && (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          {dateError}
        </p>
      )}
      {(fromMonth || toMonth) && (
        <p className="text-sm text-slate-600">
          請求日の対象期間：{fromMonth || "指定なし"} 〜 {toMonth || "指定なし"}{" "}
          ／ 一覧の金額は振込請求額（差引後）です。
        </p>
      )}
      <Card>
        <CardSection className="!p-4 sm:!p-6">
          <form className="grid grid-cols-1 gap-4 md:grid-cols-5 md:gap-4">
            <div className="md:col-span-2">
              <label htmlFor="filter-q" className={labelClassXs}>
                請求書を検索
              </label>
              <input
                id="filter-q"
                name="q"
                defaultValue={q ?? ""}
                className={`mt-1 ${inputClass}`}
                placeholder="請求書番号・会社名・件名"
              />
            </div>

            <div>
              <label htmlFor="filter-companyId" className={labelClassXs}>
                会社
              </label>
              <select
                id="filter-companyId"
                name="companyId"
                defaultValue={companyId ?? ""}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">すべて</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-status" className={labelClassXs}>
                ステータス
              </label>
              <select
                id="filter-status"
                name="status"
                defaultValue={status ?? "ALL"}
                className={`mt-1 ${selectClass}`}
              >
                <option value="ALL">すべて</option>
                <option value="DRAFT">下書き</option>
                <option value="CONFIRMED">確定</option>
                <option value="ISSUED">発行済み</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-withholding" className={labelClassXs}>
                源泉所得税
              </label>
              <select
                id="filter-withholding"
                name="withholding"
                defaultValue={withholding ?? "ALL"}
                className={`mt-1 ${selectClass}`}
              >
                <option value="ALL">すべて</option>
                <option value="ON">あり</option>
                <option value="OFF">なし</option>
              </select>
            </div>

            <label className={labelClassXs}>
              請求日・開始月
              <input
                type="month"
                name="fromMonth"
                defaultValue={fromMonth}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className={labelClassXs}>
              請求日・終了月
              <input
                type="month"
                name="toMonth"
                defaultValue={toMonth}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className={labelClassXs}>
              入金状況（発行済みのみ）
              <select
                name="receipt"
                defaultValue={receipt}
                className={`mt-1 ${selectClass}`}
              >
                <option value="ALL">すべて</option>
                <option value="UNPAID">未入金・未確認</option>
                <option value="PAID">入金済み</option>
                <option value="OVERDUE">期限超過・未確認</option>
              </select>
            </label>
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

      <p className="text-xs text-slate-500">
        入金状況は手動の記録です。未入金・未確認には過去の未記録分も含みます。入金を記録するには「詳細」を開いてください。プレビューは一覧からすぐ確認できます。
      </p>
      <div className="min-w-0">
        <InvoiceListTable rows={rows} />
      </div>
    </PageShell>
  );
}
