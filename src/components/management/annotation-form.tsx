"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReportAnnotation } from "@/actions/management-actions";
import type { Target } from "@/lib/management/model";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { appButtonVariants } from "@/components/ui/app-button";
export function AnnotationForm({
  target,
  departments,
  offices,
}: {
  target: Target;
  departments: string[];
  offices: string[];
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const a = target.annotation,
    payment = ["EXPENSE", "CLAIM"].includes(target.type);
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{target.name}</span>
        <span className="ml-3 text-xs text-slate-500">
          {target.date || "日付未設定"} ／ {a.department || "部門未分類"} ／{" "}
          {a.office || "事業所未分類"}{" "}
          {payment
            ? a.bankCode
              ? "／ 振込先登録済み"
              : "／ 振込先未登録"
            : ""}
        </span>
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          start(async () => {
            try {
              const result = await saveReportAnnotation({
                ...data,
                targetType: target.type,
                targetId: target.id,
                version: a.version,
              });
              setMessage(
                result.ok
                  ? "保存しました。"
                  : result.error || "保存できませんでした。",
              );
              if (result.ok) router.refresh();
            } catch {
              setMessage(
                "保存できませんでした。通信状態を確認して再試行してください。",
              );
            }
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            部門
            <input
              name="department"
              defaultValue={a.department}
              maxLength={60}
              list={`departments-${target.key}`}
              className={`mt-1 ${inputClass}`}
              placeholder="例：営業部"
            />
            <datalist id={`departments-${target.key}`}>
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="text-sm">
            事業所
            <input
              name="office"
              defaultValue={a.office}
              maxLength={60}
              list={`offices-${target.key}`}
              className={`mt-1 ${inputClass}`}
              placeholder="例：東京本社"
            />
            <datalist id={`offices-${target.key}`}>
              {offices.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
        </div>
        {target.type === "CLAIM" && (
          <label className="block text-sm">
            精算予定日
            <input
              type="date"
              name="plannedDate"
              defaultValue={a.plannedDate}
              className={`mt-1 ${inputClass}`}
            />
            <span className="text-xs text-slate-500">
              設定すると支払予定と資金繰りに反映されます。
            </span>
          </label>
        )}
        {payment && (
          <fieldset className="rounded-xl bg-slate-50 p-4">
            <legend className="text-sm font-medium">
              この支払いの振込先（任意）
            </legend>
            <p className="mb-3 text-xs text-slate-500">
              登録すると一括振込準備CSVに出力できます。削除する場合は振込先の全項目を空にしてください。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                銀行コード
                <input
                  name="bankCode"
                  inputMode="numeric"
                  maxLength={4}
                  defaultValue={a.bankCode}
                  className={inputClass}
                  placeholder="0001"
                />
              </label>
              <label className="text-sm">
                支店コード
                <input
                  name="branchCode"
                  inputMode="numeric"
                  maxLength={3}
                  defaultValue={a.branchCode}
                  className={inputClass}
                  placeholder="001"
                />
              </label>
              <label className="text-sm">
                預金種目
                <select
                  name="bankAccountType"
                  defaultValue={a.bankAccountType}
                  className={selectClass}
                >
                  <option value="">未設定</option>
                  <option value="1">普通</option>
                  <option value="2">当座</option>
                </select>
              </label>
              <label className="text-sm">
                口座番号（7桁）
                <input
                  name="bankAccountNumber"
                  inputMode="numeric"
                  maxLength={7}
                  defaultValue={a.bankAccountNumber}
                  className={inputClass}
                  placeholder="0123456"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                口座名義（半角カナ等）
                <input
                  name="bankAccountHolder"
                  maxLength={30}
                  defaultValue={a.bankAccountHolder}
                  className={inputClass}
                  placeholder="ｶ)ｻﾝﾌﾟﾙ"
                />
              </label>
            </div>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            disabled={pending}
            className={`rounded-xl ${appButtonVariants.primary}`}
          >
            {pending ? "保存中…" : "分類・振込先を保存"}
          </button>
          <a href={target.href} className="text-sm text-emerald-800">
            元の取引を確認 →
          </a>
          <p role="status" className="text-sm">
            {message}
          </p>
        </div>
      </form>
    </details>
  );
}
