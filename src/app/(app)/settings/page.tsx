import { getSettings } from "@/actions/settings-actions";
import { SettingsForm } from "@/app/(app)/settings/_components/settings-form";
import { Card, CardSection } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="設定"
        description="請求書に表示される自社情報・振込先・税率を管理します。"
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
