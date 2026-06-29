import { notFound } from "next/navigation";

import { getInvoiceByShareToken, getSystemSettingForShare } from "@/actions/invoice-share-actions";
import { InvoicePrintView } from "@/app/(app)/invoices/_components/invoice-print-view";

/** ログイン不要の帳票共有ページ */
export default async function SharedInvoicePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const invoice = await getInvoiceByShareToken(token);
  if (!invoice) notFound();

  const settings = await getSystemSettingForShare(invoice.createdById);

  return <InvoicePrintView invoice={invoice} settings={settings} embed publicShare />;
}
