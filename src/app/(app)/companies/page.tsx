import Link from "next/link";

import { listCompanies } from "@/actions/company-actions";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { DataTableShell, dataTableCell, dataTableHeadCell, dataTableRow } from "@/components/ui/data-table";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { inputClass, labelClassXs } from "@/lib/ui/form-classes";

function toStr(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function CompaniesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const q = toStr(sp.q);

  const companies = await listCompanies({ q: q || undefined });

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="会社一覧"
        description="自分が所有する会社のみ表示されます。"
        action={<AppButtonLink href="/companies/new">新規追加</AppButtonLink>}
      />

      <Card>
        <CardSection className="!p-4 sm:!p-6">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <label className={labelClassXs}>会社名検索</label>
              <input
                name="q"
                defaultValue={q}
                className={`mt-1 ${inputClass}`}
                placeholder="会社名で検索"
              />
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <AppButtonLink href="/companies" variant="secondary">
                クリア
              </AppButtonLink>
              <button
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                type="submit"
              >
                検索
              </button>
            </div>
          </form>
        </CardSection>
      </Card>

      <DataTableShell>
        <table className="w-full min-w-0 table-fixed border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              <th className={`${dataTableHeadCell} w-[32%]`}>会社名</th>
              <th className={`${dataTableHeadCell} w-[22%]`}>会社コード</th>
              <th className={`${dataTableHeadCell} w-[24%]`}>作成日</th>
              <th className={`${dataTableHeadCell} w-[22%] text-right`}></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className={dataTableRow}>
                <td className={`${dataTableCell} truncate`} title={c.name}>
                  {c.name}
                </td>
                <td className={`${dataTableCell} font-mono text-xs text-slate-600`}>{c.invoiceCode}</td>
                <td className={`${dataTableCell} tabular-nums text-slate-600`}>
                  {new Date(c.createdAt).toLocaleDateString("ja-JP")}
                </td>
                <td className={`${dataTableCell} text-right`}>
                  <Link
                    href={`/companies/${c.id}`}
                    className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td className="px-4 py-14 text-center text-sm text-slate-500" colSpan={4}>
                  会社がありません。「新規追加」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </PageShell>
  );
}
