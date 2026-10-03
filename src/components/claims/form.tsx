"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveClaim } from "@/actions/claim-actions";
import { EXPENSE_CATEGORIES, japanToday } from "@/lib/expenses/model";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass, textareaClass } from "@/lib/ui/form-classes";
type Data = {
  id: string;
  title: string;
  merchant: string;
  date: string;
  amount: number;
  category: string;
  note: string;
  version: string;
  filename: string | null;
};
export function ClaimForm({
  ownerId,
  workspaceName,
  data,
}: {
  ownerId: string;
  workspaceName: string;
  data?: Data;
}) {
  const router = useRouter(),
    [id] = useState(() => data?.id ?? crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Card>
      <CardSection>
        <p className="mb-5 text-sm text-slate-500">
          精算先：{workspaceName} ／ 金額は税込・整数円で入力してください。
        </p>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            f.set("id", id);
            f.set("ownerId", ownerId);
            if (data) f.set("version", data.version);
            setBusy(true);
            setError("");
            try {
              const result = await saveClaim(f);
              if (result.ok) {
                router.push(`/claims/${result.id}`);
                router.refresh();
              } else setError(result.error);
            } catch {
              setError(
                "通信できませんでした。入力を残して再試行してください。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              件名（必須）
              <input
                name="title"
                defaultValue={data?.title}
                required
                maxLength={150}
                placeholder="例）営業訪問の交通費"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              支払先（必須）
              <input
                name="merchant"
                defaultValue={data?.merchant}
                required
                maxLength={150}
                placeholder="例）〇〇交通"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              経費の日付（必須）
              <input
                type="date"
                name="date"
                defaultValue={data?.date ?? japanToday()}
                required
                max={japanToday()}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              税込金額（円・必須）
              <input
                type="number"
                inputMode="numeric"
                name="amount"
                defaultValue={data?.amount}
                required
                min={1}
                max={2147483647}
                step={1}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              分類
              <select
                name="category"
                defaultValue={data?.category ?? "交通費"}
                className={`mt-1 ${selectClass}`}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            目的・補足
            <textarea
              name="note"
              defaultValue={data?.note}
              maxLength={2000}
              placeholder="訪問先や利用目的など、承認者に伝えたい内容"
              className={`mt-1 ${textareaClass}`}
            />
          </label>
          <div>
            <label className="block text-sm">
              レシート・領収書（申請時に必須）
              <input
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              3MB以内のJPEG・PNG・WebP・PDF。画像は表示用に向きとサイズを整えて保存します。OCRによる自動読取はありません。
            </p>
            {data?.filename && (
              <label className="mt-2 flex gap-2 text-sm">
                <input type="checkbox" name="removeReceipt" value="true" />
                保存済みの添付「{data.filename}」を外す
              </label>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <AppButton type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存して申請内容を確認"}
            </AppButton>
            <span className="text-xs text-slate-500">
              次の画面で確認してから申請します。
            </span>
          </div>
        </form>
      </CardSection>
    </Card>
  );
}
