"use client";

import { useState } from "react";
import type { MailTemplate } from "@prisma/client";

import { DuplicateInvoiceButton } from "@/components/invoices/duplicate-invoice-button";
import { InvoicePreviewModal } from "@/components/invoices/invoice-preview-modal";
import { SendInvoiceMailModal } from "@/components/invoices/send-invoice-mail-modal";
import { AppButton, AppButtonLink, appButtonVariants } from "@/components/ui/app-button";

const toolbarBtnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:pointer-events-none disabled:opacity-50";

export function InvoiceDetailToolbar(props: {
  invoiceId: string;
  mailTemplates: Pick<MailTemplate, "id" | "name" | "subjectTemplate" | "bodyTemplate">[];
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
        <AppButtonLink href={`/invoices/${props.invoiceId}/edit`} variant="secondary">
          編集
        </AppButtonLink>

        <span className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />

        <AppButton variant="secondary" onClick={() => setPreviewOpen(true)}>
          プレビュー/印刷
        </AppButton>
        <AppButton variant="primary" onClick={() => setMailOpen(true)}>
          メール送信
        </AppButton>

        <span className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />

        <DuplicateInvoiceButton
          invoiceId={props.invoiceId}
          label="複製"
          className={`${toolbarBtnBase} ${appButtonVariants.secondary}`}
        />
      </div>

      <InvoicePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        invoiceId={props.invoiceId}
      />
      <SendInvoiceMailModal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        invoiceId={props.invoiceId}
        templates={props.mailTemplates}
      />
    </>
  );
}
