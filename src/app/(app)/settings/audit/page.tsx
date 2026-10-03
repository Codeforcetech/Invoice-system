import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { auditEntityLabel } from "@/lib/workspace/audit";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import {
  DataTableShell,
  dataTableCell,
  dataTableHeadCell,
  dataTableRow,
} from "@/components/ui/data-table";
import { selectClass } from "@/lib/ui/form-classes";

const PAGE_SIZE = 50;
const stamp = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "short",
  timeStyle: "medium",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; page?: string }>;
}) {
  const ws = await requireWorkspacePage("ADMIN");
  const sp = await searchParams;
  const entity =
    sp.entity && sp.entity in auditEntityLabel ? sp.entity : undefined;
  const page = Math.max(1, Math.min(10_000, Number(sp.page) || 1));
  const where = { ownerId: ws.ownerId, ...(entity ? { entity } : {}) };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) =>
    `/settings/audit?${new URLSearchParams({ ...(entity ? { entity } : {}), page: String(p) })}`;
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="操作ログ"
        description="誰がいつ何を変更したかの記録です。記録は後から変更・削除できません。"
        action={
          <AppButtonLink href="/settings/members" variant="secondary">
            メンバー・権限へ戻る
          </AppButtonLink>
        }
      />
      <Card>
        <CardSection>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="text-sm">
              対象
              <select
                name="entity"
                defaultValue={entity ?? ""}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">すべて</option>
                {Object.entries(auditEntityLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              絞り込む
            </button>
            <p className="text-sm text-slate-500">{total.toLocaleString("ja-JP")}件</p>
          </form>
        </CardSection>
      </Card>
      <DataTableShell>
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className={dataTableHeadCell}>日時</th>
              <th className={dataTableHeadCell}>操作者</th>
              <th className={dataTableHeadCell}>対象</th>
              <th className={dataTableHeadCell}>内容</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={dataTableRow}>
                <td className={`${dataTableCell} whitespace-nowrap`}>
                  {stamp.format(r.createdAt)}
                </td>
                <td className={dataTableCell}>{r.actor.name}</td>
                <td className={dataTableCell}>
                  {auditEntityLabel[r.entity] ?? r.entity}
                </td>
                <td className={dataTableCell}>{r.summary}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className={dataTableCell} colSpan={4}>
                  記録はまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="ページ送り">
          {page > 1 ? (
            <AppButtonLink href={href(page - 1)} variant="secondary">
              前へ
            </AppButtonLink>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            {page} / {pages}
          </span>
          {page < pages ? (
            <AppButtonLink href={href(page + 1)} variant="secondary">
              次へ
            </AppButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageShell>
  );
}
