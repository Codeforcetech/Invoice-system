"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { duplicateInvoice } from "@/actions/invoice-actions";
import { Toast } from "@/components/ui/toast";

export function DuplicateInvoiceButton(props: {
  invoiceId: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: "success" | "error" | "info" }>({
    open: false,
    message: "",
    variant: "info",
  });
  const [inlineError, setInlineError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={
          props.className ??
          "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        }
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setInlineError(null);
            try {
              const created = await duplicateInvoice({ invoiceId: props.invoiceId });
              setToast({ open: true, message: "請求書を複製しました", variant: "success" });
              router.push(`/invoices/${created.id}/edit?toast=duplicated`);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "複製に失敗しました";
              setInlineError(msg);
              setToast({ open: true, message: "複製に失敗しました", variant: "error" });
            }
          })
        }
        title="複製（下書きで新規作成）"
      >
        {isPending ? "複製中..." : props.label ?? "複製"}
      </button>

      {inlineError ? <div className="mt-2 text-xs text-red-600">{inlineError}</div> : null}

      <Toast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </>
  );
}

