"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAsset, prepareAssetAccounts } from "@/actions/asset-actions";
import {
  assetSchema,
  assetRates,
  depreciationSchedule,
  fiscalMonths,
  fiscalYear,
  methods,
  type AssetInput,
} from "@/lib/assets/model";
import { yen } from "@/lib/accounting/model";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass, textareaClass } from "@/lib/ui/form-classes";

type AccountOption = {
  id: string;
  name: string;
  code: string;
  kind: string;
  active: boolean;
};
export function PrepareAssetAccounts() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        最初に「減価償却費」の勘定科目を準備します。
      </p>
      <AppButton
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await prepareAssetAccounts();
            if (!r.ok) setError(r.error);
            else router.refresh();
          } catch {
            setError("準備できませんでした。もう一度お試しください。");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "準備中…" : "減価償却費の科目を準備"}
      </AppButton>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
export function AssetForm({
  initial,
  accounts,
  locked,
  today,
  startDate,
}: {
  initial: AssetInput;
  accounts: AccountOption[];
  locked: boolean;
  today: string;
  startDate: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: keyof AssetInput, value: string | number) =>
    setV((old) => ({ ...old, [key]: value }));
  let firstYear = 0,
    rate = "—",
    total = 0;
  const parsed = assetSchema.safeParse(v);
  if (parsed.success) {
    firstYear = fiscalYear(v.serviceDate.slice(0, 7), v.fiscalStartMonth);
    const months = fiscalMonths(firstYear, v.fiscalStartMonth);
    total = depreciationSchedule(parsed.data, months[11]).reduce(
      (s, r) => s + r.amount,
      0,
    );
    rate =
      v.method === "NONE"
        ? "—"
        : (
            assetRates(v.usefulLife)[v.method === "STRAIGHT" ? 0 : 1] / 1000
          ).toFixed(3);
  }
  const textInput = (
    key: "name" | "acquiredDate" | "serviceDate",
    label: string,
    type = "text",
  ) => (
    <label className="block text-sm">
      {label}
      <input
        className={`mt-1 ${inputClass}`}
        type={type}
        required
        value={v[key]}
        max={type === "date" ? today : undefined}
        min={key === "serviceDate" ? startDate : undefined}
        maxLength={key === "name" ? 120 : undefined}
        disabled={locked && key !== "name"}
        onInput={(e) => set(key, e.currentTarget.value)}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await saveAsset(v);
          if (!r.ok) setError(r.error);
          else {
            router.push(`/accounting/assets/${r.id}`);
            router.refresh();
          }
        } catch {
          setError(
            "保存できませんでした。入力内容を保持していますので、もう一度お試しください。",
          );
        } finally {
          setBusy(false);
        }
      }}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="space-y-6">
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">1. 資産の情報</h2>
            <p className="mt-1 text-sm text-slate-500">
              パソコンや設備など、長く使うものを登録します。
            </p>
            <div className="mt-5 space-y-4">
              {textInput("name", "資産名（必須）")}
              <div className="grid gap-4 sm:grid-cols-2">
                {textInput("acquiredDate", "取得日（必須）", "date")}
                {textInput("serviceDate", "使用開始日（必須）", "date")}
              </div>
              <label className="block text-sm">
                取得価額・税込（円）
                <input
                  type="number"
                  required
                  min="1"
                  max="2147483647"
                  step="1"
                  disabled={locked}
                  value={v.cost || ""}
                  onChange={(e) => set("cost", Number(e.target.value))}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <p className="text-xs leading-6 text-slate-500">
                取得価額は付随費用を含めた金額です。台帳への登録だけでは購入の仕訳は作成しません。取得時の仕訳は「取引を入力」から資産科目で記帳してください。
              </p>
            </div>
          </CardSection>
        </Card>
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">2. 償却の設定</h2>
            <p className="mt-1 text-sm text-slate-500">
              適用する方法と耐用年数を選ぶと、金額を自動計算します。
            </p>
            {locked && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                仕訳履歴があるため、名称とメモのみ変更できます。
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                償却方法
                <select
                  disabled={locked}
                  value={v.method}
                  onChange={(e) => set("method", e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  {Object.entries(methods).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                耐用年数（年）
                <input
                  disabled={locked || v.method === "NONE"}
                  type="number"
                  required
                  min="2"
                  max="50"
                  step="1"
                  value={v.usefulLife || ""}
                  onChange={(e) => set("usefulLife", Number(e.target.value))}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-sm">
                事業年度の開始月
                <select
                  disabled={locked}
                  value={v.fiscalStartMonth}
                  onChange={(e) =>
                    set("fiscalStartMonth", Number(e.target.value))
                  }
                  className={`mt-1 ${selectClass}`}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option value={i + 1} key={i}>
                      {i + 1}月（{i === 0 ? "12" : i}月決算）
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                資産の勘定科目
                <select
                  disabled={locked}
                  required
                  value={v.assetAccountId}
                  onChange={(e) => set("assetAccountId", e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">選択してください</option>
                  {accounts
                    .filter((a) => a.kind === "ASSET")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.active ? "" : "（無効）"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                償却費の勘定科目
                <select
                  disabled={locked}
                  required
                  value={v.expenseAccountId}
                  onChange={(e) => set("expenseAccountId", e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">選択してください</option>
                  {accounts
                    .filter((a) => a.kind === "EXPENSE")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.active ? "" : "（無効）"}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-500">
              事業専用の有形固定資産（耐用年数2〜50年）に対応。償却後に1円を残す直接法です。建物・建物附属設備等の適用方法はご確認ください。過年度償却済み資産の移行、家事按分、無形資産、少額資産の特例、短期事業年度は未対応です。
            </p>
          </CardSection>
        </Card>
        <Card>
          <CardSection>
            <label className="block text-sm">
              メモ（設置場所・管理番号など）
              <textarea
                value={v.note}
                maxLength={2000}
                onChange={(e) => set("note", e.target.value)}
                className={`mt-1 ${textareaClass}`}
                rows={3}
              />
            </label>
          </CardSection>
        </Card>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <AppButton type="submit" disabled={busy}>
            {busy ? "保存中…" : "資産を保存"}
          </AppButton>
          <AppButtonLink
            href={
              v.version ? `/accounting/assets/${v.id}` : "/accounting/assets"
            }
            variant="secondary"
          >
            キャンセル
          </AppButtonLink>
        </div>
      </div>
      <aside>
        <Card className="xl:sticky xl:top-6">
          <CardSection>
            <p className="text-xs font-semibold text-slate-500">
              入力内容から自動計算
            </p>
            <h2 className="mt-2 text-lg font-semibold">初年度の償却見込み</h2>
            <p className="mt-6 text-3xl font-semibold tabular-nums">
              {parsed.success ? `¥${yen(total)}` : "—"}
            </p>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>開始年度</dt>
                <dd>{firstYear || "—"}年度</dd>
              </div>
              <div className="flex justify-between">
                <dt>償却率</dt>
                <dd>{rate}</dd>
              </div>
              <div className="flex justify-between">
                <dt>方法</dt>
                <dd>{methods[v.method]}</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-6 text-slate-500">
              使用開始月を1か月として計算。月ごとの端数を調整し、年額と一致させます。保存後に月別の予定と仕訳を確認できます。
            </p>
          </CardSection>
        </Card>
      </aside>
    </form>
  );
}
