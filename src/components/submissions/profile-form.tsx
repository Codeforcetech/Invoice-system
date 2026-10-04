"use client";
import { useState } from "react";
import { saveSubmitterProfile } from "@/actions/submission-actions";
import type { ProfileInput } from "@/lib/submissions/model";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass } from "@/lib/ui/form-classes";

const fields: {
  name: keyof ProfileInput;
  label: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
}[] = [
  {
    name: "legalName",
    label: "お名前（または会社名）",
    required: true,
    hint: "請求書の差出人になります。",
    placeholder: "例：山田 太郎",
  },
  { name: "address", label: "住所", placeholder: "例：東京都渋谷区…" },
  { name: "phone", label: "電話番号" },
  {
    name: "registrationNumber",
    label: "インボイスの登録番号（ある方のみ）",
    hint: "「T」と13桁の数字です。免税事業者などで番号がない場合は、空欄にします。",
    placeholder: "T1234567890123",
  },
  { name: "bankName", label: "振込先の銀行名" },
  { name: "branchName", label: "支店名" },
  { name: "accountType", label: "口座の種類", placeholder: "例：普通" },
  { name: "accountNumber", label: "口座番号" },
  { name: "accountHolder", label: "口座名義（カタカナ）" },
];

/** 業務委託メンバーが、請求書の差出人として使う、自分の情報を設定する。 */
export function ProfileForm({ initial }: { initial: ProfileInput }) {
  const [values, setValues] = useState<ProfileInput>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  return (
    <Card>
      <CardSection>
        <form
          className="max-w-xl space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage(null);
            try {
              const r = await saveSubmitterProfile(values);
              setMessage(
                r.ok
                  ? { ok: true, text: "保存しました。" }
                  : { ok: false, text: r.error },
              );
            } catch {
              setMessage({
                ok: false,
                text: "通信できませんでした。もう一度お試しください。",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {fields.map((f) => (
            <label key={f.name} className="block text-sm">
              <span className="font-semibold">
                {f.label}
                {f.required && (
                  <span className="ml-1 text-xs text-rose-700">必須</span>
                )}
              </span>
              <input
                value={values[f.name]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
                placeholder={f.placeholder}
                maxLength={f.name === "address" ? 200 : 100}
                className={`mt-1 ${inputClass}`}
              />
              {f.hint && (
                <span className="mt-1 block text-xs text-slate-500">
                  {f.hint}
                </span>
              )}
            </label>
          ))}
          <p className="text-xs leading-relaxed text-slate-500">
            提出するときの内容が、その提出に記録されます。あとでここを変えても、すでに提出した請求書は変わりません。
          </p>
          {message && (
            <p
              role={message.ok ? "status" : "alert"}
              className={`rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"}`}
            >
              {message.text}
            </p>
          )}
          <AppButton type="submit" disabled={busy}>
            {busy ? "保存中…" : "保存する"}
          </AppButton>
        </form>
      </CardSection>
    </Card>
  );
}
