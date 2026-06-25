import { getCompany } from "@/actions/company-actions";
import { CompanyForm } from "@/app/(app)/companies/_components/company-form";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function CompanyDetailPage(props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  const company = await getCompany({ companyId });

  return (
    <PageShell maxWidth="4xl">
      <SectionHeader
        variant="page"
        title="会社詳細"
        description="取引先の情報を確認・編集します。"
        action={
          <>
            <AppButtonLink href="/companies" variant="secondary">
              一覧へ
            </AppButtonLink>
            <AppButtonLink href={`/invoices/new?companyId=${company.id}`}>この会社で請求書作成</AppButtonLink>
          </>
        }
      />

      <Card>
        <CardSection>
          <div className="mb-8 flex flex-col gap-4 border-b border-slate-100 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">取引先</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{company.name}</h2>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                  {company.invoiceCode}
                </span>
                <span className="text-slate-400">·</span>
                <span>支払期限の初期値: 請求日から {company.defaultDueDays} 日後</span>
              </p>
            </div>
          </div>

          <CompanyForm
            mode="edit"
            companyId={company.id}
            showSections
            initialValues={{
              name: company.name,
              invoiceCode: company.invoiceCode,
              defaultDueDays: company.defaultDueDays,
              paymentTerms: company.paymentTerms ?? "",
              commonSubject: company.commonSubject ?? "",
              billingEmail: company.billingEmail ?? "",
              billingCcEmail: company.billingCcEmail ?? "",
            }}
          />
        </CardSection>
      </Card>
    </PageShell>
  );
}
