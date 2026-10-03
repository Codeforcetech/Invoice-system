import { redirect } from "next/navigation";
import { InvoiceReceipt } from "@/components/invoices/invoice-receipt";
import { InvoiceDetailToolbar } from "@/app/(app)/invoices/_components/invoice-detail-toolbar";
import { requireUser } from "@/lib/auth/require-user";
import { getOrCreateSystemSetting } from "@/lib/settings/system-setting";
import { getInvoice, type InvoiceWithItems } from "@/actions/invoice-actions";
import { listCompaniesForInvoiceForm } from "@/actions/company-actions";
import { listItemTemplates } from "@/actions/item-template-actions";
import { listMailTemplates } from "@/actions/mail-template-actions";
import { InvoiceForm } from "@/app/(app)/invoices/_components/invoice-form";
import { EditToast } from "@/app/(app)/invoices/_components/edit-toast";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function EditInvoicePage(props: {
  params: Promise<{ invoiceId: string }>;
}) {
  const user = await requireUser();
  const { invoiceId } = await props.params;

  const [invoice, companies, itemRows, mailRows, settings] = await Promise.all([
    getInvoice({ invoiceId }) as Promise<InvoiceWithItems>,
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

  if(invoice.mergedIntoId) redirect(`/invoices/${invoice.mergedIntoId}/edit`);
  const mailTemplates = mailRows.map((t) => ({
    id: t.id,
    name: t.name,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
  }));

  return (
    <PageShell maxWidth="full">
      <EditToast />
      <SectionHeader
        variant="page"
        title="請求書編集"
        description={
          <>
            請求書番号:{" "}
            <span className="font-mono text-[0.8125rem] text-slate-600">
              {invoice.invoiceNumber}
            </span>
          </>
        }
      />

      <InvoiceReceipt key={invoice.updatedAt.toISOString()} invoice={invoice} />
      {invoice.receivedDate ? (
        <div className="space-y-4 rounded-xl bg-emerald-50 p-5">
          <p className="text-sm text-emerald-900">
            入金済みのため請求内容の編集を保護しています。訂正する場合は、上の「入金記録を変更」から記録を取り消してください。
          </p>
          <InvoiceDetailToolbar
            hideEdit
            invoiceId={invoice.id}
            mailTemplates={mailTemplates}
          />
        </div>
      ) : (
        <InvoiceForm
          settings={settings}
          invoiceNumber={invoice.invoiceNumber}
          companies={companies}
          itemTemplates={itemTemplates}
          mailTemplates={mailTemplates}
          defaultTaxRateBps={settings?.taxRate ?? 1000}
          mode="edit"
          invoiceId={invoice.id}
          initialValues={{
            companyId: invoice.company.id,
            subject: invoice.subject,
            issueDate: new Date(invoice.issueDate),
            dueDate: new Date(invoice.dueDate),
            withholdingEnabled: invoice.withholdingEnabled,
            status: invoice.status,
            items: invoice.items.map((it) => ({
              productName: it.productName,
              unit: it.unit ?? "",
              quantity: Number(it.quantity),
              unitPrice: it.unitPrice,
              amount: it.amount,
              amountManuallyEdited: it.amountManuallyEdited,
              note: it.note ?? "",
            })),
          }}
        />
      )}
    </PageShell>
  );
}
