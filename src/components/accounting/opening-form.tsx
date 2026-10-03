"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOpeningBalances } from "@/actions/easy-accounting-actions";
import { AppButton } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass } from "@/lib/ui/form-classes";

const questions = [
  {
    name: "cash",
    q: "手元の現金は、いくらありますか？",
    hint: "レジ・金庫・財布の事業用のお金",
  },
  {
    name: "bank",
    q: "銀行口座（預金）は、合わせていくらありますか？",
    hint: "通帳やネットバンキングの残高の合計",
  },
  {
    name: "receivable",
    q: "まだ入金されていない売上は、いくらありますか？",
    hint: "請求済みで、これから入金される予定の金額（なければ0）",
  },
  {
    name: "payable",
    q: "まだ払っていない支払いは、いくらありますか？",
    hint: "請求書は届いているが、これから払う金額（なければ0）",
  },
  {
    name: "loan",
    q: "借入金は、いくら残っていますか？",
    hint: "銀行などからの借入の残り（なければ0）",
  },
] as const;

/** 開始残高を、普通の質問に答えるだけで登録する。差額（元入金）は自動で計算する。 */
export function OpeningForm({ startDate }: { startDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <CardSection>
        <p className="text-sm text-slate-600">
          {startDate} 時点の状況を教えてください。わからない項目、ない項目は 0
          のままで大丈夫です。
        </p>
        <form
          className="mt-6 max-w-xl space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const n = (k: string) => Number(f.get(k) || 0);
            setBusy(true);
            setError("");
            try {
              const r = await saveOpeningBalances({
                cash: n("cash"),
                bank: n("bank"),
                receivable: n("receivable"),
                payable: n("payable"),
                loan: n("loan"),
              });
              if (!r.ok) return setError(r.error);
              router.push("/accounting");
              router.refresh();
            } catch {
              setError("登録できませんでした。もう一度お試しください。");
            } finally {
              setBusy(false);
            }
          }}
        >
          {questions.map((x) => (
            <label key={x.name} className="block text-sm">
              <span className="font-semibold">{x.q}</span>
              <input
                name={x.name}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={0}
                className={`mt-1 ${inputClass}`}
              />
              <span className="mt-1 block text-xs text-slate-500">
                {x.hint}
              </span>
            </label>
          ))}
          <p className="text-xs leading-relaxed text-slate-500">
            差額は「元入金（事業のもとになるお金）」として自動で計算されます。登録は1回だけです。
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          <AppButton type="submit" disabled={busy}>
            {busy ? "登録中…" : "この内容で登録する"}
          </AppButton>
        </form>
      </CardSection>
    </Card>
  );
}
