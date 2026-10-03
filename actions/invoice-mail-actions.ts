"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { getOrCreateSystemSetting } from "@/lib/settings/system-setting";
import { invoicePdfFilename } from "@/lib/gmail/mime";
import { invoiceDocumentVersion } from "@/lib/pdf/version";

/** Prepare a private, owner-scoped snapshot. No public share token or email is created. */
export async function getInvoiceMailDefaults(params: { invoiceId: string }) {
  const user = await requireUser();
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, createdById: user.id },
    include: { company: true },
  });
  if (!invoice) throw new Error("請求書が見つかりません");
  const settings = await getOrCreateSystemSetting(user.id);
  const date = (d: Date) =>
    new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }).format(d);
  return {
    defaultFrom: settings.email ?? "",
    defaultTo: invoice.company.billingEmail ?? "",
    defaultCc: invoice.company.billingCcEmail ?? "",
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    filename: invoicePdfFilename(invoice.invoiceNumber),
    version: invoiceDocumentVersion(
      invoice.updatedAt,
      settings.updatedAt,
      invoice.company.updatedAt,
    ),
    vars: {
      company_name: invoice.company.name,
      sender_name: settings.companyName,
      sender_email: settings.email ?? "",
      contact_person: settings.contactPerson ?? "",
      invoice_number: invoice.invoiceNumber,
      issue_date: date(invoice.issueDate),
      due_date: date(invoice.dueDate),
      grand_total: new Intl.NumberFormat("ja-JP").format(invoice.grandTotal),
      payment_terms: invoice.company.paymentTerms ?? "",
      subject: invoice.subject,
      // Old templates that contain this variable must not expose a public invoice link.
      print_url: "添付の請求書PDFをご確認ください。",
    } satisfies Record<string, string>,
  };
}
