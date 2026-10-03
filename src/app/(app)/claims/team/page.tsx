import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { ClaimTeam } from "@/components/claims/team";
export default async function TeamPage() {
  const u = await requireUser();
  const [workspace, setting] = await Promise.all([
    prisma.claimWorkspace.findUnique({
      where: { ownerId: u.id },
      include: {
        members: {
          include: { user: { select: { name: true, email: true } } },
          orderBy: { updatedAt: "asc" },
        },
      },
    }),
    prisma.accountingSetting.findUnique({ where: { userId: u.id } }),
  ]);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="経費精算のメンバー設定"
        description="自分の精算先と、申請・承認できるメンバーを管理します。"
        action={
          <AppButtonLink href="/claims" variant="secondary">
            経費精算へ戻る
          </AppButtonLink>
        }
      />
      <ClaimTeam
        name={workspace?.name ?? null}
        ready={!!setting}
        members={
          workspace?.members.map((m) => ({
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            active: m.active,
          })) ?? []
        }
      />
    </PageShell>
  );
}
