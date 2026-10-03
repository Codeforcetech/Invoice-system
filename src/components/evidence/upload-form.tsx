"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadEvidence } from "@/actions/evidence-actions";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import {
  EVIDENCE_KINDS,
  MAX_EVIDENCE_BYTES,
  evidenceKindLabel,
} from "@/lib/evidence/model";
import { japanToday } from "@/lib/expenses/model";

export function EvidenceUploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  return (
    <Card>
      <CardSection>
        <h2 className="text-lg font-semibold">証憑を登録</h2>
        <p className="mt-2 text-sm text-slate-600">
          受け取った領収書・請求書などを、受け取ったままの内容で保存します（PDF・JPEG・PNG・WebP、3MBまで）。
          取引年月日・金額・取引先は、あとで探すための検索項目です。正しく入力してください。
        </p>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const f = fd.get("file");
            if (f instanceof File && f.size > MAX_EVIDENCE_BYTES) {
              setError("ファイルは3MB以内にしてください。");
              return;
            }
            setBusy(true);
            setError("");
            setDone("");
            try {
              const r = await uploadEvidence(fd);
              if (r.ok) {
                form.reset();
                setDone("証憑を登録しました。");
                router.refresh();
              } else setError(r.error);
            } catch {
              setError(
                "通信できませんでした。入力内容を残して、もう一度お試しください。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm font-medium">
            証憑の種類
            <select
              name="kind"
              defaultValue="RECEIPT"
              className={`mt-1 ${selectClass}`}
            >
              {EVIDENCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {evidenceKindLabel[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            取引年月日
            <input
              type="date"
              name="transactionDate"
              required
              max={japanToday()}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium">
            取引先
            <input
              name="counterparty"
              required
              maxLength={150}
              placeholder="例）株式会社〇〇"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium">
            金額（税込・円）
            <input
              name="amount"
              type="number"
              required
              min={0}
              max={2147483647}
              step={1}
              inputMode="numeric"
              placeholder="契約書など金額のないものは 0"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            メモ（任意）
            <input
              name="memo"
              maxLength={1000}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            ファイル
            <input
              type="file"
              name="file"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <AppButton type="submit" disabled={busy}>
              {busy ? "登録中…" : "証憑を登録"}
            </AppButton>
            {done && (
              <p role="status" className="text-sm text-emerald-700">
                {done}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>
        </form>
      </CardSection>
    </Card>
  );
}
