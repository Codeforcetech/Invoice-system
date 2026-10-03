"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordEasyTransaction } from "@/actions/easy-accounting-actions";
import {
  type EasyKind,
  type EasyOption,
  type MoneyOption,
  type TaxChoice,
  easyKindInfo,
  taxChoiceInfo,
} from "@/lib/accounting/easy";
import { japanToday } from "@/lib/expenses/model";
import { AppButton } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass } from "@/lib/ui/form-classes";

const kinds: EasyKind[] = ["OUT", "IN", "MOVE"];
const taxOrder: TaxChoice[] = ["10", "8", "none"];
const kindIcon: Record<EasyKind, string> = { OUT: "↗", IN: "↙", MOVE: "⇄" };

/**
 * お金の出入りを記録する、やさしい入力。
 * 借方・貸方・勘定科目は画面に出さない。「何のお金か」を選ぶと、税の区分も自動で入る。
 */
export function EasyEntryForm({
  out,
  income,
  money,
}: {
  out: EasyOption[];
  income: EasyOption[];
  money: MoneyOption[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<EasyKind>("OUT");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [categoryId, setCategoryId] = useState("");
  const [tax, setTax] = useState<TaxChoice>("10");
  const [moneyId, setMoneyId] = useState(money[0]?.id ?? "");
  const [toId, setToId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ text: string } | null>(null);

  const options = kind === "OUT" ? out : income;
  const chosen = options.find((o) => o.id === categoryId);
  const moneyLabel =
    kind === "OUT"
      ? "どこから払いましたか？"
      : kind === "IN"
        ? "どこに入りましたか？"
        : "どこから移しましたか？";
  const memoLabel = kind === "OUT" ? "支払った相手・内容" : "入金元・内容";

  function pickKind(next: EasyKind) {
    setKind(next);
    setCategoryId("");
    setError("");
    setTax(next === "OUT" ? "10" : next === "IN" ? "10" : "none");
  }

  return (
    <div className="space-y-6">
      {done && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"
        >
          <p className="font-semibold">記録しました。</p>
          <p className="mt-1">{done.text}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/accounting" className="font-medium text-sky-700">
              お金の出入りを見る
            </Link>
            <span className="text-slate-500">
              続けて、次の分も入力できます。
            </span>
          </div>
        </div>
      )}
      <Card>
        <CardSection>
          <form
            className="space-y-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              f.set("kind", kind);
              f.set("requestKey", requestKey);
              f.set("categoryAccountId", categoryId);
              f.set("moneyAccountId", moneyId);
              f.set("toAccountId", toId);
              f.set("taxChoice", tax);
              setBusy(true);
              setError("");
              try {
                const r = await recordEasyTransaction(f);
                if (!r.ok) return setError(r.error);
                const amount = Number(f.get("amount"));
                setDone({
                  text: `${easyKindInfo[kind].label}　¥${amount.toLocaleString("ja-JP")}`,
                });
                form.reset();
                setCategoryId("");
                setToId("");
                setRequestKey(crypto.randomUUID());
                router.refresh();
                window.scrollTo({ top: 0, behavior: "smooth" });
              } catch {
                setError(
                  "記録できませんでした。通信を確認して、もう一度お試しください。",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold">
                1. どんなお金ですか？
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {kinds.map((k) => (
                  <label
                    key={k}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      kind === k
                        ? "border-sky-600 bg-sky-50 ring-2 ring-sky-200"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kindChoice"
                      className="sr-only"
                      checked={kind === k}
                      onChange={() => pickKind(k)}
                    />
                    <span aria-hidden className="text-xl text-sky-700">
                      {kindIcon[k]}
                    </span>
                    <span className="mt-1 block font-semibold">
                      {easyKindInfo[k].label}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {easyKindInfo[k].lead}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">2. いつですか？</span>
                <input
                  required
                  name="date"
                  type="date"
                  defaultValue={japanToday()}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">3. いくらですか？（円）</span>
                <input
                  required
                  name="amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="例：5500"
                  className={`mt-1 ${inputClass}`}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  税込みの金額を入れてください。
                </span>
              </label>
            </div>

            {kind !== "MOVE" && (
              <div className="space-y-2">
                <label className="block text-sm">
                  <span className="font-semibold">
                    4.{" "}
                    {kind === "OUT"
                      ? "何のための支払いですか？"
                      : "何の入金ですか？"}
                  </span>
                  <select
                    required
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      const o = options.find((x) => x.id === e.target.value);
                      if (o) setTax(o.tax);
                    }}
                    className={`mt-1 ${selectClass}`}
                  >
                    <option value="">選んでください</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="min-h-5 text-xs text-slate-600">
                  {chosen
                    ? `例：${chosen.example}`
                    : "迷ったら、いちばん近いものを選んでください。あとから直せます。"}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">
                  {kind === "MOVE" ? "5. " : kind === "OUT" ? "5. " : "5. "}
                  {moneyLabel}
                </span>
                <select
                  required
                  value={moneyId}
                  onChange={(e) => setMoneyId(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  {money.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "MOVE" && (
                <label className="block text-sm">
                  <span className="font-semibold">どこへ移しましたか？</span>
                  <select
                    required
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    className={`mt-1 ${selectClass}`}
                  >
                    <option value="">選んでください</option>
                    {money
                      .filter((m) => m.id !== moneyId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            {kind !== "MOVE" && (
              <label className="block text-sm">
                <span className="font-semibold">6. {memoLabel}</span>
                <input
                  required
                  name="memo"
                  maxLength={150}
                  placeholder={
                    kind === "OUT"
                      ? "例：NTT 電話代 9月分"
                      : "例：○○商事 9月分の入金"
                  }
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            )}
            {kind === "MOVE" && (
              <label className="block text-sm">
                <span className="font-semibold">
                  メモ（なくてもかまいません）
                </span>
                <input
                  name="memo"
                  maxLength={150}
                  placeholder="例：レジ用に引き出し"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            )}

            {kind !== "MOVE" && (
              <fieldset>
                <legend className="text-sm font-semibold">
                  消費税はかかっていますか？
                </legend>
                <div className="mt-2 space-y-2">
                  {taxOrder.map((t) => (
                    <label
                      key={t}
                      className="flex cursor-pointer items-start gap-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="taxRadio"
                        className="mt-1"
                        checked={tax === t}
                        onChange={() => setTax(t)}
                      />
                      <span>
                        {taxChoiceInfo[t].label}
                        <span className="block text-xs text-slate-500">
                          {taxChoiceInfo[t].hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {kind !== "MOVE" && (
              <label className="block text-sm">
                <span className="font-semibold">
                  領収書・請求書の写真（なくてもかまいません）
                </span>
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="mt-1 block w-full text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  つけると、証憑ファイルボックスに保存されます。
                </span>
              </label>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
              >
                {error}
              </p>
            )}
            <AppButton type="submit" disabled={busy}>
              {busy ? "記録中…" : "記録する"}
            </AppButton>
          </form>
        </CardSection>
      </Card>
    </div>
  );
}
