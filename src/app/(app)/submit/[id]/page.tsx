import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireSubmitterPage } from "@/lib/auth/require-workspace";
import { loadSubmission } from "@/lib/submissions/queries";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { SubmissionDetail } from "@/components/submissions/submission-detail";
import { SubmissionActions } from "@/components/submissions/submission-actions";

export default async function SubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const ws = await requireSubmitterPage();
  const { id } = await params;
  const { notice } = await searchParams;
  const s = await loadSubmission(prisma, ws, id);
  if (!s || !s.mine) notFound();
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader variant="page" title="提出の内容" />
      {notice && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {notice.slice(0, 200)}
        </p>
      )}
      <SubmissionActions
        id={s.id}
        status={s.status}
        version={s.updatedAt.toISOString()}
      />
      <SubmissionDetail s={s} />
    </PageShell>
  );
}
