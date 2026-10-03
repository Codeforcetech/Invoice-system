import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { claimPermission } from "@/lib/claims/access";
import { redirect, notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { ClaimForm } from "@/components/claims/form";
export default async function NewClaim({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const u = await requireUser(),
    { owner } = await searchParams;
  if (!owner) redirect("/claims");
  const permission = await claimPermission(prisma, owner, u.id).catch(
    () => null,
  );
  if (!permission) notFound();
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="経費を申請"
        description="利用内容とレシートを登録し、承認を依頼します。"
      />
      <ClaimForm ownerId={owner} workspaceName={permission.workspace.name} />
    </PageShell>
  );
}
