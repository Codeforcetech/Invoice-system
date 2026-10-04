import { requireSubmitterPage } from "@/lib/auth/require-workspace";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function SubmitHome() {
  await requireSubmitterPage();
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="書類を提出する"
        description="請求書と領収書を提出します。"
      />
    </PageShell>
  );
}
