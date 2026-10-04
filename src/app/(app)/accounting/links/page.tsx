import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { linkStatus } from "@/lib/submissions/link";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { LinkManager } from "@/components/submissions/link-manager";

export default async function LinksPage() {
  const ws = await requireWorkspacePage("APPROVER");
  const links = await prisma.submissionLink.findMany({
    where: { ownerId: ws.ownerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const pending = await prisma.submission.groupBy({
    by: ["linkId"],
    where: { linkId: { in: links.map((l) => l.id) }, status: "SUBMITTED" },
    _count: true,
  });
  const pendingOf = new Map(pending.map((p) => [p.linkId, p._count]));
  return (
    <PageShell maxWidth="6xl">
      <SectionHeader
        variant="page"
        title="提出リンク"
        description="外部の人（ログイン不要）が、請求書と領収書を提出するためのリンクを発行します。"
      />
      <LinkManager
        rows={links.map((l) => ({
          id: l.id,
          label: l.label,
          hint: l.tokenHint,
          status: linkStatus(l),
          expiresAt: l.expiresAt.toISOString(),
          submissionCount: l.submissionCount,
          maxSubmissions: l.maxSubmissions,
          pending: pendingOf.get(l.id) ?? 0,
          aiReadsUsed: l.aiReadsUsed,
          aiReadsLimit: l.aiReadsLimit,
          lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </PageShell>
  );
}
