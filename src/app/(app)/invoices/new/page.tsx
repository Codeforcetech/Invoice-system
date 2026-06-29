import { requireUser } from "@/lib/auth/require-user";
import { getOrCreateSystemSetting } from "@/lib/settings/system-setting";
import { listCompaniesForInvoiceForm } from "@/actions/company-actions";
import { listItemTemplates } from "@/actions/item-template-actions";
import { listMailTemplates } from "@/actions/mail-template-actions";
import { InvoiceForm } from "@/app/(app)/invoices/_components/invoice-form";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

function toStr(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function NewInvoicePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = (await props.searchParams) ?? {};
  const companyIdFromQuery = toStr(sp.companyId) || "";

  const [companies, itemRows, mailRows, settings] = await Promise.all([
    listCompaniesForInvoiceForm(),
    listItemTemplates(),
    listMailTemplates(),
    getOrCreateSystemSetting(user.id),
  ]);

  const itemTemplates = itemRows.map((t) => ({
    id: t.id,
    name: t.name,
    productName: t.productName,
    unit: t.unit,
    quantity: Number(t.quantity),
    unitPrice: t.unitPrice,
    note: t.note,
  }));

  const mailTemplates = mailRows.map((t) => ({
    id: t.id,
    name: t.name,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
  }));

  return (
    <PageShell maxWidth="7xl">
      <SectionHeader
        variant="page"
        title="請求書作成"
        description="左で入力、右で金額を確認。下書きは自動保存されます。"
      />

      <InvoiceForm
        companies={companies}
        itemTemplates={itemTemplates}
        mailTemplates={mailTemplates}
        defaultTaxRateBps={settings.taxRate}
        mode="create"
        initialValues={{
          companyId: companyIdFromQuery || companies[0]?.id || "",
        }}
      />
    </PageShell>
  );
}
