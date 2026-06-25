import { CompanyForm } from "@/app/(app)/companies/_components/company-form";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function NewCompanyPage() {
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader
        variant="page"
        title="会社作成"
        description="請求書の発行先となる会社を登録します。"
        action={
          <AppButtonLink href="/companies" variant="secondary">
            一覧へ
          </AppButtonLink>
        }
      />

      <Card>
        <CardSection>
          <CompanyForm mode="create" showSections />
        </CardSection>
      </Card>
    </PageShell>
  );
}
