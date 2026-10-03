import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { claimPermission } from "@/lib/claims/access";
import { dateText } from "@/lib/accounting/model";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { ClaimForm } from "@/components/claims/form";
export default async function EditClaim({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const u = await requireUser(),
    { claimId } = await params;
  const c = await prisma.expenseClaim.findFirst({
    where: {
      id: claimId,
      applicantId: u.id,
      status: { in: ["DRAFT", "REJECTED"] },
    },
    include: { workspace: true, receipt: { select: { filename: true } } },
  });
  if (!c) notFound();
  if (!(await claimPermission(prisma, c.ownerId, u.id).catch(() => null)))
    notFound();
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="経費申請を編集"
        action={
          <AppButtonLink href={`/claims/${c.id}`} variant="secondary">
            内容へ戻る
          </AppButtonLink>
        }
      />
      <ClaimForm
        ownerId={c.ownerId}
        workspaceName={c.workspace.name}
        data={{
          id: c.id,
          title: c.title,
          merchant: c.merchant,
          date: dateText(c.date),
          amount: c.amount,
          category: c.category,
          note: c.note,
          version: c.updatedAt.toISOString(),
          filename: c.receipt?.filename ?? null,
        }}
      />
    </PageShell>
  );
}
