import Link from "next/link";

import { listCompanies } from "@/actions/company-actions";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { hasRole } from "@/lib/workspace/access";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import {
  DataTableShell,
  dataTableCell,
  dataTableHeadCell,
  dataTableRow,
} from "@/components/ui/data-table";
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

  const ws = await requireWorkspacePage("VIEWER");
  const companies = await listCompanies({ q: q || undefined });

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="取引先"
        description="請求先の情報・送付先メール・支払条件をまとめて管理します。"
        action={
          hasRole(ws.role, "EDITOR") ? (
            <AppButtonLink href="/companies/new">＋ 取引先を追加</AppButtonLink>
          ) : undefined
        }
      />

      <Card>
        <CardSection className="!p-4 sm:!p-6">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="filter-q" className={labelClassXs}>
                会社名検索
              </label>
              <input
                id="filter-q"
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

      <div className="space-y-3 sm:hidden">
        {companies.map((c) => (
          <article
            key={c.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <Link
              href={`/companies/${c.id}`}
              className="text-sm font-semibold text-slate-900"
            >
              {c.name}
            </Link>
            <p className="mt-2 text-xs text-slate-500">
              会社コード：{c.invoiceCode}
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <Link
                href={`/companies/${c.id}`}
                className="text-xs font-medium text-sky-700"
              >
                詳細・編集
              </Link>
              <Link
                href={`/invoices/new?companyId=${c.id}`}
                className="text-xs font-medium text-sky-700"
              >
                請求書を作成 →
              </Link>
            </div>
          </article>
        ))}
        {companies.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-sm text-slate-500">
            該当する取引先がありません。
          </p>
        )}
      </div>
      <DataTableShell className="hidden sm:block">
        <table className="w-full min-w-0 table-fixed border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              <th className={`${dataTableHeadCell} w-[38%]`}>会社名</th>
              <th className={`${dataTableHeadCell} w-[16%]`}>会社コード</th>
              <th className={`${dataTableHeadCell} w-[18%]`}>作成日</th>
              <th className={`${dataTableHeadCell} w-[28%] text-right`}></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className={dataTableRow}>
                <td className={`${dataTableCell} truncate`} title={c.name}>
                  {c.name}
                </td>
                <td
                  className={`${dataTableCell} font-mono text-xs text-slate-600`}
                >
                  {c.invoiceCode}
                </td>
                <td className={`${dataTableCell} tabular-nums text-slate-600`}>
                  {new Date(c.createdAt).toLocaleDateString("ja-JP")}
                </td>
                <td className={`${dataTableCell} text-right`}>
                  <div className="flex flex-wrap justify-end gap-4">
                    <Link
                      href={`/invoices/new?companyId=${c.id}`}
                      className="text-xs font-medium text-sky-700 hover:underline"
                    >
                      請求書を作成
                    </Link>
                    <Link
                      href={`/companies/${c.id}`}
                      className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      詳細・編集
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td
                  className="px-4 py-14 text-center text-sm text-slate-500"
                  colSpan={4}
                >
                  取引先がありません。「取引先を追加」から登録してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </PageShell>
  );
}
