"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveExpenseAttachmentToBox } from "@/actions/evidence-actions";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { EVIDENCE_KINDS, evidenceKindLabel } from "@/lib/evidence/model";
import { japanToday } from "@/lib/expenses/model";

export type ExpenseAttachmentRow = {
  id: string;
  supplier: string;
  description: string;
  amount: number;
  filename: string;
  defaultDate: string;
};

/** 支払い管理に添付されたPDFのうち、まだファイルボックスにないもの。元の添付は変わらない。 */
export function ExpenseAttachmentCopy({
  rows,
}: {
  rows: ExpenseAttachmentRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  if (!rows.length) return null;
  return (
    <Card>
      <CardSection>
        <h2 className="text-lg font-semibold">支払いに添付されたPDF</h2>
        <p className="mt-2 text-sm text-slate-600">
          次の支払いの添付PDFは、まだファイルボックスに保存されていません。取引年月日を確認して保存すると、取引先・金額は支払いの内容を使い、元の添付はそのまま残ります。
        </p>
        {message && (
          <p
            role="status"
            className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900"
          >
            {message}
          </p>
        )}
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <form
              key={r.id}
              className="grid items-end gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_150px_160px_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(r.id);
                setMessage("");
                try {
                  const res = await saveExpenseAttachmentToBox({
                    expenseId: r.id,
                    kind: f.get("kind"),
                    transactionDate: f.get("transactionDate"),
                  });
                  setMessage(
                    res.ok ? "ファイルボックスに保存しました。" : res.error,
                  );
                  if (res.ok) router.refresh();
                } catch {
                  setMessage("通信できませんでした。もう一度お試しください。");
                } finally {
                  setBusy("");
                }
              }}
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium">{r.supplier}</p>
                <p className="break-all text-xs text-slate-500">
                  {r.description} ／ ¥{r.amount.toLocaleString("ja-JP")} ／{" "}
                  {r.filename}
                </p>
              </div>
              <label className="text-xs">
                種類
                <select
                  name="kind"
                  defaultValue="INVOICE"
                  className={`mt-1 ${selectClass}`}
                >
                  {EVIDENCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {evidenceKindLabel[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                取引年月日
                <input
                  type="date"
                  name="transactionDate"
                  required
                  defaultValue={r.defaultDate}
                  max={japanToday()}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <AppButton
                type="submit"
                variant="secondary"
                disabled={busy === r.id}
              >
                保存
              </AppButton>
            </form>
          ))}
        </div>
      </CardSection>
    </Card>
  );
}
