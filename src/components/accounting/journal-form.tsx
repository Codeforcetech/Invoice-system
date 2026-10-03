"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveJournal } from "@/actions/accounting-actions";
import { type AccountRow, yen } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { TAX_CATEGORIES, taxCategoryInfo } from "@/lib/tax/categories";

const taxOptions = (
  <>
    <option value="">指定しない</option>
    {TAX_CATEGORIES.map((c) => (
      <option key={c} value={c}>
        {taxCategoryInfo[c].label}
      </option>
    ))}
  </>
);
export function JournalForm({
  accounts,
  startDate,
}: {
  accounts: AccountRow[];
  startDate: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState("voucher");
  const [key] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState(japanToday());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState([
    {
      accountId: accounts[0]?.id ?? "",
      debit: "",
      credit: "",
      taxCategory: "",
    },
    {
      accountId: accounts[1]?.id ?? "",
      debit: "",
      credit: "",
      taxCategory: "",
    },
  ]);
  const [counterTax, setCounterTax] = useState("");
  const [fixed, setFixed] = useState(
    accounts.find((a) => a.code === "110")?.id ?? accounts[0]?.id ?? "",
  );
  const [counter, setCounter] = useState(
    accounts.find((a) => a.code === "400")?.id ?? "",
  );
  const [side, setSide] = useState("debit");
  const [amount, setAmount] = useState("");
  const parsed =
    mode === "voucher"
      ? lines.map((l) => ({
          ...l,
          debit: Number(l.debit),
          credit: Number(l.credit),
        }))
      : [
          {
            accountId: fixed,
            debit: side === "debit" ? Number(amount) : 0,
            credit: side === "credit" ? Number(amount) : 0,
          },
          {
            accountId: counter,
            debit: side === "credit" ? Number(amount) : 0,
            credit: side === "debit" ? Number(amount) : 0,
            taxCategory: counterTax,
          },
        ];
  const debit = parsed.reduce((s, l) => s + l.debit, 0),
    credit = parsed.reduce((s, l) => s + l.credit, 0);
  const options = accounts
    .filter((a) => a.active)
    .map((a) => (
      <option key={a.id} value={a.id}>
        {a.code} {a.name}
      </option>
    ));
  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap gap-2">
          <AppButton
            variant={mode === "voucher" ? "selected" : "secondary"}
            onClick={() => setMode("voucher")}
          >
            振替伝票入力
          </AppButton>
          <AppButton
            variant={mode === "book" ? "selected" : "secondary"}
            onClick={() => setMode("book")}
          >
            帳簿形式入力
          </AppButton>
        </div>
        <form
          className="mt-6 space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await saveJournal({
                requestKey: key,
                date,
                memo,
                lines: parsed,
              });
              if (!r.ok) setError(r.error ?? "登録できませんでした。");
              else {
                router.push("/accounting?view=journal");
                router.refresh();
              }
            } catch {
              setError("保存できませんでした。入力内容は残っています。");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <label className="text-sm">
              取引日
              <input
                type="date"
                required
                min={startDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              摘要
              <input
                required
                maxLength={500}
                placeholder="例：9月分の外注費"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          {mode === "voucher" ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                各行は借方・貸方のいずれか一方に入力します。複合仕訳も登録できます。
              </p>
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 items-end gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_160px_160px_auto]"
                >
                  <label className="col-span-2 text-xs md:col-span-1">
                    勘定科目 {i + 1}
                    <select
                      aria-label={`勘定科目 ${i + 1}`}
                      value={l.accountId}
                      onChange={(e) =>
                        setLines(
                          lines.map((x, j) =>
                            j === i ? { ...x, accountId: e.target.value } : x,
                          ),
                        )
                      }
                      className={`mt-1 ${selectClass}`}
                    >
                      {options}
                    </select>
                  </label>
                  {(["debit", "credit"] as const).map((k) => (
                    <label key={k} className="text-xs">
                      {k === "debit" ? "借方" : "貸方"}（円）
                      <input
                        aria-label={`${k === "debit" ? "借方" : "貸方"} ${i + 1}`}
                        type="number"
                        min="0"
                        step="1"
                        max="2147483647"
                        value={l[k]}
                        onChange={(e) =>
                          setLines(
                            lines.map((x, j) =>
                              j === i ? { ...x, [k]: e.target.value } : x,
                            ),
                          )
                        }
                        className={`mt-1 ${inputClass}`}
                      />
                    </label>
                  ))}
                  <label className="col-span-2 text-xs md:col-span-4">
                    消費税の区分（任意・売上や仕入の行に指定します）
                    <select
                      aria-label={`消費税の区分 ${i + 1}`}
                      value={l.taxCategory}
                      onChange={(e) =>
                        setLines(
                          lines.map((x, j) =>
                            j === i ? { ...x, taxCategory: e.target.value } : x,
                          ),
                        )
                      }
                      className={`mt-1 ${selectClass}`}
                    >
                      {taxOptions}
                    </select>
                  </label>
                  <AppButton
                    variant="ghost"
                    disabled={lines.length <= 2}
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    削除
                  </AppButton>
                </div>
              ))}
              <AppButton
                variant="secondary"
                disabled={lines.length >= 100}
                onClick={() =>
                  setLines([
                    ...lines,
                    {
                      accountId: accounts[0]?.id ?? "",
                      debit: "",
                      credit: "",
                      taxCategory: "",
                    },
                  ])
                }
              >
                ＋ 明細を追加
              </AppButton>
            </div>
          ) : (
            <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
              <label className="text-sm">
                固定する勘定科目
                <select
                  value={fixed}
                  onChange={(e) => setFixed(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  {options}
                </select>
              </label>
              <label className="text-sm">
                相手科目
                <select
                  value={counter}
                  onChange={(e) => setCounter(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  {options}
                </select>
              </label>
              <label className="text-sm">
                相手科目の消費税区分（任意）
                <select
                  value={counterTax}
                  onChange={(e) => setCounterTax(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  {taxOptions}
                </select>
              </label>
              <label className="text-sm">
                固定科目への記帳
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="debit">借方（現金・預金なら入金）</option>
                  <option value="credit">貸方（現金・預金なら出金）</option>
                </select>
              </label>
              <label className="text-sm">
                金額（円）
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  max="2147483647"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm">
            <span>借方合計 ¥{yen(debit)}</span>
            <span>貸方合計 ¥{yen(credit)}</span>
            <strong
              className={
                debit === credit ? "text-emerald-700" : "text-rose-700"
              }
            >
              差額 ¥{yen(Math.abs(debit - credit))}
            </strong>
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <AppButton
              type="submit"
              disabled={busy || debit !== credit || debit <= 0}
            >
              {busy ? "登録中…" : "仕訳を登録"}
            </AppButton>
            <AppButtonLink href="/accounting" variant="secondary">
              戻る
            </AppButtonLink>
          </div>
          <p className="text-xs text-slate-500">
            登録済みの仕訳は上書きせず、取消仕訳と新しい仕訳で訂正します。
          </p>
        </form>
      </CardSection>
    </Card>
  );
}
