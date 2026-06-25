import { requireAdmin } from "@/lib/auth/require-admin";
import { listUsers } from "@/actions/admin-user-actions";
import { UserCreateForm } from "@/app/(app)/admin/users/user-create-form";
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

export default async function AdminUsersPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = (await props.searchParams) ?? {};
  const q = toStr(sp.q);
  const users = await listUsers({ q: q || undefined });

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="ユーザー管理"
        description="管理者のみがユーザーを作成できます。"
        action={
          <AppButtonLink href="/dashboard" variant="secondary">
            ダッシュボード
          </AppButtonLink>
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardSection>
            <h2 className="text-base font-semibold text-slate-900">ユーザー作成</h2>
            <div className="mt-5">
              <UserCreateForm />
            </div>
          </CardSection>
        </Card>

        <Card className="min-w-0">
          <CardSection className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">ユーザー一覧</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">メール/氏名で検索できます。</p>
            </div>

            <form className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className={labelClassXs}>検索</label>
                <input
                  name="q"
                  defaultValue={q}
                  className={`mt-1 ${inputClass}`}
                  placeholder="例) test@example.com / 山田"
                />
              </div>
              <button
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                type="submit"
              >
                検索
              </button>
            </form>

            <DataTableShell>
              <table className="w-full min-w-0 table-fixed border-collapse">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[40%]" />
                  <col className="w-[18%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90">
                    <th className={dataTableHeadCell}>氏名</th>
                    <th className={dataTableHeadCell}>メール</th>
                    <th className={dataTableHeadCell}>権限</th>
                    <th className={dataTableHeadCell}>作成日</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={dataTableRow}>
                      <td className={`${dataTableCell} truncate`} title={u.name}>
                        {u.name}
                      </td>
                      <td className={`${dataTableCell} truncate font-mono text-xs text-slate-600`} title={u.email}>
                        {u.email}
                      </td>
                      <td className={dataTableCell}>{u.role === "ADMIN" ? "管理者" : "一般"}</td>
                      <td className={`${dataTableCell} tabular-nums text-slate-600`}>
                        {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={4}>
                        ユーザーがいません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DataTableShell>
          </CardSection>
        </Card>
      </div>
    </PageShell>
  );
}
