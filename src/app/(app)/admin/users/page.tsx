import { requireAdmin } from "@/lib/auth/require-admin";
import { listWorkspaceUsers } from "@/actions/admin-user-actions";
import { UserList } from "@/app/(app)/admin/users/user-list";
import { UserCreateForm } from "@/app/(app)/admin/users/user-create-form";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
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
  const users = await listWorkspaceUsers({ q: q || undefined });

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="ユーザー管理"
        description="管理者だけが、ユーザーを作成し、権限（管理者・承認者・申請者）を決められます。"
        action={
          <AppButtonLink href="/dashboard" variant="secondary">
            ダッシュボード
          </AppButtonLink>
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardSection>
            <h2 className="text-base font-semibold text-slate-900">
              ユーザー作成
            </h2>
            <div className="mt-5">
              <UserCreateForm />
            </div>
          </CardSection>
        </Card>

        <Card className="min-w-0">
          <CardSection className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                ユーザー一覧
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                システム全体のユーザーです。上の白い行は、この事業所のユーザーで、権限をここで、いつでも変更できます。灰色の行は、ほかの事業所のユーザーで、見るだけです。メール/氏名で検索できます。
              </p>
            </div>

            <form className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="filter-q" className={labelClassXs}>
                  検索
                </label>
                <input
                  id="filter-q"
                  name="q"
                  defaultValue={q}
                  className={`mt-1 ${inputClass}`}
                  placeholder="例) test@example.com / 山田"
                />
              </div>
              <button
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-navy shadow-sm hover:bg-brand-gold-hover"
                type="submit"
              >
                検索
              </button>
            </form>

            <UserList rows={users} />
          </CardSection>
        </Card>
      </div>
    </PageShell>
  );
}
