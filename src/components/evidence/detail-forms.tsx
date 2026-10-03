"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctEvidence, voidEvidence } from "@/actions/evidence-actions";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { EVIDENCE_KINDS, evidenceKindLabel } from "@/lib/evidence/model";
import { japanToday } from "@/lib/expenses/model";

type Meta = {
  kind: string;
  transactionDate: string;
  amount: number;
  counterparty: string;
  memo: string;
};

export function EvidenceCorrectForm({
  id,
  version,
  meta,
}: {
  id: string;
  version: string;
  meta: Meta;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <Card>
      <CardSection>
        <h2 className="text-lg font-semibold">登録内容を訂正</h2>
        <p className="mt-2 text-sm text-slate-600">
          検索に使う項目を訂正できます。ファイルそのものは変わりません。訂正前後の内容と理由は履歴に残ります。
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            setBusy(true);
            setMessage("");
            try {
              const r = await correctEvidence({ ...f, id, version });
              setFailed(!r.ok);
              setMessage(r.ok ? "訂正しました。" : r.error);
              if (r.ok) router.refresh();
            } catch {
              setFailed(true);
              setMessage("通信できませんでした。もう一度お試しください。");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm font-medium">
            証憑の種類
            <select
              name="kind"
              defaultValue={meta.kind}
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
              defaultValue={meta.transactionDate}
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
              defaultValue={meta.counterparty}
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
              defaultValue={meta.amount}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            メモ
            <input
              name="memo"
              maxLength={1000}
              defaultValue={meta.memo}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            訂正の理由
            <input
              name="reason"
              required
              maxLength={300}
              placeholder="例）金額の入力誤り"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <AppButton type="submit" disabled={busy}>
              訂正を保存
            </AppButton>
            {message && (
              <p
                role={failed ? "alert" : "status"}
                className={`text-sm ${failed ? "text-rose-700" : "text-emerald-700"}`}
              >
                {message}
              </p>
            )}
          </div>
        </form>
      </CardSection>
    </Card>
  );
}

export function EvidenceVoidForm({
  id,
  version,
}: {
  id: string;
  version: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <CardSection>
        <h2 className="text-lg font-semibold">証憑を無効にする</h2>
        <p className="mt-2 text-sm text-slate-600">
          誤って登録した証憑などを無効にします。ファイルと履歴は削除されず、元に戻すこともできません。同じファイルは、無効にしたあとであらためて登録できます。
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              !window.confirm(
                "この証憑を無効にします。元に戻せません。よろしいですか？",
              )
            )
              return;
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const r = await voidEvidence({
                id,
                version,
                reason: f.get("reason"),
              });
              if (r.ok) router.refresh();
              else setError(r.error);
            } catch {
              setError("通信できませんでした。もう一度お試しください。");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="min-w-64 flex-1 text-sm font-medium">
            無効にする理由
            <input
              name="reason"
              required
              maxLength={300}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <AppButton type="submit" variant="secondary" disabled={busy}>
            無効にする
          </AppButton>
          {error && (
            <p role="alert" className="w-full text-sm text-rose-700">
              {error}
            </p>
          )}
        </form>
      </CardSection>
    </Card>
  );
}
