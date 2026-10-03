import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { notificationEmailReady } from "@/lib/notifications/service";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { Notifications } from "@/components/claims/notifications";
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const u = await requireUser(),
    sp = await searchParams,
    page = /^\d{1,5}$/.test(sp.page ?? "") ? Math.max(1, Number(sp.page)) : 1;
  const [pref, rows] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: u.id } }),
    prisma.appNotification.findMany({
      where: { userId: u.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      skip: (page - 1) * 50,
    }),
  ]);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="お知らせ"
        description="経費の申請状況と、承認・差戻しの結果を確認します。"
      />
      <Notifications
        enabled={pref?.emailEnabled ?? false}
        configured={notificationEmailReady()}
        rows={rows
          .slice(0, 50)
          .map((n) => ({
            id: n.id,
            title: n.title,
            href: n.href,
            date: n.createdAt.toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            }),
            read: !!n.readAt,
            emailStatus: n.emailStatus,
          }))}
      />
      <div className="flex gap-3">
        {page > 1 && (
          <AppButtonLink
            variant="secondary"
            href={`/notifications?page=${page - 1}`}
          >
            前へ
          </AppButtonLink>
        )}
        {rows.length > 50 && (
          <AppButtonLink
            variant="secondary"
            href={`/notifications?page=${page + 1}`}
          >
            次へ
          </AppButtonLink>
        )}
      </div>
    </PageShell>
  );
}
