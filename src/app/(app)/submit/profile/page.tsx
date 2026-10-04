import { prisma } from "@/lib/db/prisma";
import { requireSubmitterPage } from "@/lib/auth/require-workspace";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { ProfileForm } from "@/components/submissions/profile-form";
import type { ProfileInput } from "@/lib/submissions/model";

export default async function SubmitterProfilePage() {
  const ws = await requireSubmitterPage();
  const p = await prisma.submitterProfile.findUnique({
    where: { userId: ws.userId },
  });
  const initial: ProfileInput = {
    legalName: p?.legalName ?? "",
    address: p?.address ?? "",
    phone: p?.phone ?? "",
    registrationNumber: p?.registrationNumber ?? "",
    bankName: p?.bankName ?? "",
    branchName: p?.branchName ?? "",
    accountType: p?.accountType ?? "",
    accountNumber: p?.accountNumber ?? "",
    accountHolder: p?.accountHolder ?? "",
  };
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader
        variant="page"
        title="自分の情報"
        description="請求書の差出人（お名前・住所・振込先など）です。"
      />
      <ProfileForm initial={initial} />
    </PageShell>
  );
}
