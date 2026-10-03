"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { initializeAccounting } from "@/actions/accounting-actions";
import { templates } from "@/lib/accounting/model";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
export function AccountingSetup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <CardSection>
        <h2 className="text-lg font-semibold">会計をはじめる</h2>
        <p className="mt-2 text-sm text-slate-600">
          業種に合う勘定科目を準備します。既存の請求書や支払いは変更しません。
        </p>
        <form
          className="mt-6 max-w-xl space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await initializeAccounting(Object.fromEntries(f));
              router.refresh();
            } catch {
              setError(
                "設定を保存できませんでした。入力内容を確認してください。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            業種
            <select name="industry" className={`mt-1 ${selectClass}`}>
              {Object.entries(templates).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            会計開始日
            <input
              required
              name="startDate"
              type="date"
              defaultValue={`${new Date().getFullYear()}-01-01`}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <p className="text-xs leading-relaxed text-slate-500">
            開始日は登録後に変更できません。開始残高はこの日付の振替伝票として入力します。金額は円・税込経理です。既存データは「請求・支払連携」から確認して取り込めます。
          </p>
          <AppButton type="submit" disabled={busy}>
            {busy ? "準備中…" : "勘定科目を準備して開始"}
          </AppButton>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
        </form>
      </CardSection>
    </Card>
  );
}
