import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { getSettings } from "@/actions/settings-actions";
import { SettingsForm } from "@/app/(app)/settings/_components/settings-form";
import { Card, CardSection } from "@/components/ui/card";
import { AppButtonLink } from "@/components/ui/app-button";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function SettingsPage() {
  await requireWorkspacePage("VIEWER");
  const settings = await getSettings();

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="自社情報・設定"
        description="請求書に表示される自社情報・振込先・税率を管理します。"
        action={
          <AppButtonLink href="/settings/members" variant="secondary">
            メンバー・権限
          </AppButtonLink>
        }
      />

      <Card>
        <CardSection>
          <SettingsForm
            initialValues={{
              companyName: settings.companyName,
              invoiceRegistrationNumber: settings.invoiceRegistrationNumber,
              postalCode: settings.postalCode,
              address: settings.address,
              phone: settings.phone,
              email: settings.email,
              contactPerson: settings.contactPerson,
              stampImageUrl: settings.stampImageUrl,
              bankName: settings.bankName,
              branchName: settings.branchName,
              accountType: settings.accountType,
              accountNumber: settings.accountNumber,
              accountHolder: settings.accountHolder,
              accountHolderKana: settings.accountHolderKana,
              transferNote: settings.transferNote,
              taxRate: settings.taxRate,
            }}
          />
        </CardSection>
      </Card>
    </PageShell>
  );
}
