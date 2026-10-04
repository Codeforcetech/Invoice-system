import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { loadSubmission } from "@/lib/submissions/queries";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { SubmissionDetail } from "@/components/submissions/submission-detail";
import { ReviewActions } from "@/components/submissions/review-actions";

export default async function ReviewSubmission({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ws = await requireWorkspacePage("APPROVER");
  const { id } = await params;
  const s = await loadSubmission(prisma, ws, id);
  if (!s) notFound();
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader
        variant="page"
        title={`${s.senderName || s.submitter.name}さんの提出`}
        description="内容を確認して、承認または差し戻します。承認すると、支払管理に支払い予定として反映されます。"
      />
      {s.status === "SUBMITTED" && s.submitterId !== ws.userId ? (
        <ReviewActions id={s.id} version={s.updatedAt.toISOString()} />
      ) : s.status === "SUBMITTED" ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          自分の提出は、承認できません。別の承認者に依頼してください。
        </p>
      ) : null}
      <SubmissionDetail s={s} />
    </PageShell>
  );
}
