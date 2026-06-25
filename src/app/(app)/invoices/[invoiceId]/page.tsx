import { getInvoice, type InvoiceWithItems } from "@/actions/invoice-actions";
import { listMailTemplates } from "@/actions/mail-template-actions";
import { InvoiceDetail } from "@/app/(app)/invoices/_components/invoice-detail";
import { PageShell } from "@/components/ui/page-shell";

export default async function InvoiceDetailPage(props: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await props.params;
  const [invoice, mailRows] = await Promise.all([
    getInvoice({ invoiceId }) as Promise<InvoiceWithItems>,
    listMailTemplates(),
  ]);

  const mailTemplates = mailRows.map((t) => ({
    id: t.id,
    name: t.name,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
  }));

  return (
    <PageShell>
      <InvoiceDetail invoice={invoice} mailTemplates={mailTemplates} />
    </PageShell>
  );
}
