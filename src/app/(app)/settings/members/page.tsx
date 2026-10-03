import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { isWorkspaceRole, type WorkspaceRole } from "@/lib/workspace/access";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { WorkspaceMembers } from "@/components/workspace/members";

export default async function MembersPage() {
  const ws = await requireWorkspacePage("ADMIN");
  const [owner, members] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: ws.ownerId },
      select: { name: true, email: true },
    }),
    prisma.workspaceMember.findMany({
      where: { ownerId: ws.ownerId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="メンバー・権限"
        description="事業所を一緒に使う人と、それぞれができる操作を管理します。"
        action={
          <div className="flex flex-wrap gap-2">
            <AppButtonLink href="/settings/audit" variant="secondary">
              操作ログ
            </AppButtonLink>
          </div>
        }
      />
      <WorkspaceMembers
        owner={owner}
        members={members
          .filter((m) => isWorkspaceRole(m.role))
          .map((m) => ({
            id: m.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role as WorkspaceRole,
            active: m.active,
          }))}
      />
    </PageShell>
  );
}
