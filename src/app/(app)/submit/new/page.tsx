import { requireSubmitterPage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { SubmissionForm } from "@/components/submissions/submission-form";

export default async function NewSubmission() {
  await requireSubmitterPage();
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader
        variant="page"
        title="請求書をつくって提出する"
        description="何月分か、請求の内容、領収書を入れて提出します。"
      />
      <SubmissionForm initialMonth={japanToday().slice(0, 7)} />
    </PageShell>
  );
}
