"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveExpense } from "@/actions/expense-actions";
import {
  EXPENSE_CATEGORIES,
  MAX_EXPENSE_PDF_BYTES,
  japanToday,
  type ExpenseRow,
} from "@/lib/expenses/model";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { TAX_CATEGORIES, taxCategoryInfo } from "@/lib/tax/categories";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
export function ExpenseForm({ expense }: { expense?: ExpenseRow }) {
  const router = useRouter(),
    id = useRef(expense?.id ?? "");
  const [paid, setPaid] = useState(Boolean(expense?.paidDate));
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [pdfName, setPdfName] = useState("");
  const [removePdf, setRemovePdf] = useState(false);
  const today = japanToday();
  return (
    <PageShell maxWidth="5xl">
      <Link href="/expenses" className="self-start text-sm text-emerald-800">
        ← 支払管理に戻る
      </Link>
      <SectionHeader
        variant="page"
        title={expense ? "支払情報の編集" : "支払いを登録"}
        description="受け取った請求書や経費を記録します。ここから銀行振込は行われません。"
      />
      <form
        key={expense?.version ?? "new"}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const form = new FormData(e.currentTarget);
          if (!id.current) id.current = crypto.randomUUID();
          form.set("id", id.current);
          if (expense) form.set("version", expense.version);
          if (!paid) form.set("paidDate", "");
          form.set("removeAttachment", String(removePdf));
          setError("");
          startTransition(async () => {
            try {
              const result = await saveExpense(form);
              if (!result.ok) {
                setError(result.error ?? "保存できませんでした。");
                return;
              }
              router.push("/expenses?saved=1");
              router.refresh();
            } catch {
              setError(
                "保存できませんでした。入力内容は残っています。ファイルサイズや通信状況を確認して再試行してください。",
              );
            }
          });
        }}
        className="space-y-5"
      >
        <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="font-semibold">1. 支払いの内容</h2>
            <p className="mt-2 text-xs text-slate-500">
              金額は税込・実際に支払う金額で統一します。
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">
                支払先 <span className="text-xs text-rose-700">必須</span>
                <input
                  name="supplier"
                  required
                  maxLength={150}
                  defaultValue={expense?.supplier}
                  placeholder="例：株式会社サンプル制作"
                  className={`mt-2 ${inputClass}`}
                />
              </label>
              <label className="text-sm font-medium">
                費目 <span className="text-xs text-rose-700">必須</span>
                <select
                  name="category"
                  defaultValue={expense?.category ?? "外注費"}
                  className={`mt-2 ${selectClass}`}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                消費税の区分
                <select
                  name="taxCategory"
                  defaultValue={expense?.taxCategory ?? ""}
                  className={`mt-2 ${selectClass}`}
                >
                  <option value="">指定しない</option>
                  {TAX_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {taxCategoryInfo[c].label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  課税仕入などの集計に使います。指定しない支払いは「未設定」として集計します。
                </span>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                支払内容 <span className="text-xs text-rose-700">必須</span>
                <input
                  name="description"
                  required
                  maxLength={300}
                  defaultValue={expense?.description}
                  placeholder="例：9月分 デザイン制作費"
                  className={`mt-2 ${inputClass}`}
                />
              </label>
              <label className="text-sm font-medium">
                支払金額（円）{" "}
                <span className="text-xs text-rose-700">必須</span>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  max={2147483647}
                  step={1}
                  inputMode="numeric"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="110000"
                  className={`mt-2 ${inputClass}`}
                />
              </label>
              <label className="text-sm font-medium">
                費用の対象月 <span className="text-xs text-rose-700">必須</span>
                <input
                  type="month"
                  name="costMonth"
                  min="2000-01"
                  max="2099-12"
                  required
                  defaultValue={expense?.costMonth ?? today.slice(0, 7)}
                  className={`mt-2 ${inputClass}`}
                />
                <span className="mt-2 block text-xs font-normal text-slate-500">
                  例：9月の外注費なら、支払日が10月でも9月。
                </span>
              </label>
              <label className="text-sm font-medium">
                支払期限 <span className="text-xs text-rose-700">必須</span>
                <input
                  type="date"
                  name="dueDate"
                  min="2000-01-01"
                  max="2099-12-31"
                  required
                  defaultValue={expense?.dueDate ?? ""}
                  className={`mt-2 ${inputClass}`}
                />
              </label>
            </div>
          </section>
          <section
            id="payment"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
          >
            <h2 className="font-semibold">2. 支払状況</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">
                状況
                <select
                  value={paid ? "paid" : "unpaid"}
                  onChange={(e) => setPaid(e.target.value === "paid")}
                  className={`mt-2 ${selectClass}`}
                >
                  <option value="unpaid">未払い（これから支払う）</option>
                  <option value="paid">支払済み（全額支払った）</option>
                </select>
              </label>
              {paid && (
                <label className="text-sm font-medium">
                  実際の支払日{" "}
                  <span className="text-xs text-rose-700">必須</span>
                  <input
                    type="date"
                    name="paidDate"
                    required
                    min="2000-01-01"
                    max={today}
                    defaultValue={expense?.paidDate ?? today}
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
              )}
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-500">
              銀行などで支払いを済ませてから「支払済み」を記録してください。一部払いの記録には対応していません。未払いに戻すと支払日の記録を解除します。
            </p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="font-semibold">
              3. 請求書PDF・メモ{" "}
              <span className="ml-2 text-xs font-normal text-slate-500">
                任意
              </span>
            </h2>
            {expense?.filename && (
              <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
                <a
                  href={`/api/expenses/${expense.id}/pdf`}
                  className="break-all text-emerald-800 underline"
                >
                  {expense.filename} をダウンロード
                </a>
                <label className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={removePdf}
                    onChange={(e) => setRemovePdf(e.target.checked)}
                  />
                  保存時にこの添付を外す
                </label>
              </div>
            )}
            <label className="mt-5 block text-sm font-medium">
              {expense?.filename ? "PDFを差し替える" : "受け取った請求書を添付"}
              <input
                type="file"
                name="pdf"
                accept="application/pdf,.pdf"
                className="mt-2 block w-full rounded-xl border border-dashed border-slate-300 p-4 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-900"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (
                    file &&
                    (file.size > MAX_EXPENSE_PDF_BYTES ||
                      !/\.pdf$/i.test(file.name))
                  ) {
                    setError("PDFファイルを3MB以内で選択してください。");
                    e.target.value = "";
                    setPdfName("");
                    return;
                  }
                  setPdfName(file?.name ?? "");
                  if (file) setRemovePdf(false);
                  setError("");
                }}
              />
            </label>
            <p className="mt-2 break-all text-xs text-slate-500">
              {pdfName ||
                "PDF 1ファイル・3MBまで。登録した本人だけがダウンロードできます。"}
            </p>
            <label className="mt-5 block text-sm font-medium">
              メモ
              <textarea
                name="note"
                maxLength={2000}
                rows={3}
                defaultValue={expense?.note}
                placeholder="支払方法、請求書番号など"
                className={`mt-2 ${inputClass}`}
              />
            </label>
          </section>
        </fieldset>
        <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg">
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">
                {paid ? "支払済みとして記録" : "未払いとして記録"}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                ¥
                {Number.isFinite(Number(amount))
                  ? Number(amount).toLocaleString("ja-JP")
                  : "0"}
              </p>
            </div>
            <button
              disabled={pending}
              className="min-h-11 rounded-xl bg-brand-navy px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "保存中…" : expense ? "変更を保存" : "支払いを登録"}
            </button>
          </div>
        </div>
      </form>
    </PageShell>
  );
}
