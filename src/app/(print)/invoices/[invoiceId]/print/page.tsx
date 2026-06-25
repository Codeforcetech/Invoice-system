import { getInvoice, getSystemSetting } from "@/actions/invoice-actions";
import { InvoicePrintView } from "@/app/(app)/invoices/_components/invoice-print-view";

export default async function InvoicePrintPage(props: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { invoiceId } = await props.params;
  const { embed } = await props.searchParams;
  const isEmbed = embed === "1";

  const [invoice, settings] = await Promise.all([
    getInvoice({ invoiceId }),
    getSystemSetting(),
  ]);

  return <InvoicePrintView invoice={invoice} settings={settings} embed={isEmbed} />;
}
