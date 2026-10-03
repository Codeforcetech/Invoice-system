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
          お金の出入りを記録するための準備をします。2つ答えるだけで終わります。既存の請求書や支払いは変更しません。
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
              router.push("/accounting/opening");
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
            どんな仕事ですか？
            <select name="industry" className={`mt-1 ${selectClass}`}>
              {Object.entries(templates).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            いつから記録をはじめますか？
            <input
              required
              name="startDate"
              type="date"
              defaultValue={`${new Date().getFullYear()}-01-01`}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <p className="text-xs leading-relaxed text-slate-500">
            この日付は、あとから変更できません。たとえば「今年の1月1日」や「今日」にします。次の画面で、その日の現金や預金の残りを入力します。金額は円・税込みです。既存の請求書などは、あとで「請求・支払連携」から取り込めます。
          </p>
          <AppButton type="submit" disabled={busy}>
            {busy ? "準備中…" : "次へ（いまの状況を入力）"}
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
