"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordInvoiceReceipt } from "@/actions/invoice-receipt-actions";
import { dateValue, japanToday } from "@/lib/expenses/model";
import { receiptLabel } from "@/lib/invoice/receipt";
import { inputClass } from "@/lib/ui/form-classes";
export type ReceiptInvoice = {
  id: string;
  receiptMatchId?: string | null;
  status: string;
  receivedDate: Date | string | null;
  dueDate: Date | string;
  updatedAt: Date | string;
  grandTotal: number;
};
export function ReceiptBadge({
  invoice,
}: {
  invoice: Pick<ReceiptInvoice, "status" | "receivedDate" | "dueDate">;
}) {
  const label = receiptLabel(
    invoice.status,
    invoice.receivedDate,
    invoice.dueDate,
  );
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${invoice.receivedDate ? "bg-emerald-50 text-emerald-800" : label.startsWith("期限") ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600"}`}
    >
      {label}
    </span>
  );
}
export function InvoiceReceipt({ invoice }: { invoice: ReceiptInvoice }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(
    invoice.receivedDate ? dateValue(invoice.receivedDate) : japanToday(),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(clear = false) {
    setBusy(true);
    setMessage("");
    try {
      const result = await recordInvoiceReceipt({
        invoiceId: invoice.id,
        version: new Date(invoice.updatedAt).toISOString(),
        receivedDate: clear ? "" : date,
      });
      if (!result.ok) setMessage(result.error ?? "保存できませんでした。");
      else {
        setEditing(false);
        setMessage(
          clear ? "入金記録を取り消しました。" : "入金を記録しました。",
        );
        router.refresh();
      }
    } catch {
      setMessage(
        "保存できませんでした。画面を再読み込みして確認してください。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="入金管理"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">
            相手からの入金 <ReceiptBadge invoice={invoice} />
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {invoice.receivedDate
              ? `入金日 ${dateValue(invoice.receivedDate)} ／ 全額 ¥${invoice.grandTotal.toLocaleString("ja-JP")}`
              : "銀行明細などで全額の入金を確認したら、入金日を記録してください。"}
          </p>
        </div>
        {invoice.receiptMatchId ? (<Link href="/accounting/linking" className="text-sm text-sky-700">消込履歴で確認・取消 →</Link>) : invoice.status === "ISSUED" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(!editing)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            {editing
              ? "閉じる"
              : invoice.receivedDate
                ? "入金記録を変更"
                : "入金を記録"}
          </button>
        ) : (
          <p className="text-xs text-slate-500">
            発行済みにすると入金を記録できます
          </p>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
        >
          <label className="text-sm">
            入金日
            <input
              required
              type="date"
              max={japanToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <button
            disabled={busy}
            className="rounded-lg bg-brand-gold transition-colors hover:bg-brand-gold-hover px-4 py-2.5 text-sm font-medium text-brand-navy disabled:opacity-50"
          >
            {busy ? "保存中…" : "全額の入金を記録"}
          </button>
          {invoice.receivedDate && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm text-rose-700"
            >
              入金記録を取り消す
            </button>
          )}
        </form>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        手動で管理する記録です。銀行との自動照合は行いません。記録のない過去の請求書も「未入金・未確認」に含まれます。一部入金は全額入金まで未確認として扱います。
      </p>
      {message && (
        <p role="status" className="mt-3 text-sm text-sky-800">
          {message}
        </p>
      )}
    </section>
  );
}
