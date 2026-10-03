"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  postDepreciation,
  cancelDepreciation,
  archiveAsset,
} from "@/actions/asset-actions";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { yen } from "@/lib/accounting/model";
import { monthEnd, type ScheduleRow } from "@/lib/assets/model";

export function AssetPosting({
  id,
  version,
  year,
  rows,
  yearEnd,
  today,
  defaultMonth,
  expenseName,
  assetName,
  blocked,
}: {
  id: string;
  version: string;
  year: number;
  rows: (ScheduleRow & { posted: boolean })[];
  yearEnd: string;
  today: string;
  defaultMonth: string;
  expenseName: string;
  assetName: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"MONTH" | "YEAR">("MONTH"),
    [month, setMonth] = useState(defaultMonth);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const pending = rows.filter(
    (r) => !r.posted && (mode === "YEAR" || r.month === month),
  );
  const amount = pending.reduce((s, r) => s + r.amount, 0),
    date = monthEnd(mode === "YEAR" ? yearEnd : month);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">償却費を仕訳に登録</h2>
      <p className="text-sm text-slate-500">
        対象期間と金額を確認して登録します。年度まとめて登録では、記帳済みの月を自動で除きます。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          登録単位
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "MONTH" | "YEAR");
              setMessage("");
              setError("");
            }}
            className={`mt-1 ${selectClass}`}
          >
            <option value="MONTH">1か月分</option>
            <option value="YEAR">年度の未登録分をまとめて</option>
          </select>
        </label>
        {mode === "MONTH" && (
          <label className="text-sm">
            対象月
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setError("");
                setMessage("");
              }}
              className={`mt-1 ${selectClass}`}
            >
              {rows.map((r) => (
                <option key={r.month} value={r.month}>
                  {r.month}
                  {r.posted
                    ? "（登録済み）"
                    : r.amount === 0
                      ? "（償却なし）"
                      : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <p>仕訳日：{date}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p>
            借方：{expenseName} <strong>¥{yen(amount)}</strong>
          </p>
          <p>
            貸方：{assetName} <strong>¥{yen(amount)}</strong>
          </p>
        </div>
      </div>
      {blocked && (
        <p className="text-sm text-amber-800">
          前の年度に未登録分があります。古い年度から順に登録してください。
        </p>
      )}
      {date > today && (
        <p className="text-sm text-slate-500">
          この期間はまだ終了していません。{date}以降に登録できます。
        </p>
      )}
      <AppButton
        disabled={busy || amount === 0 || date > today || blocked}
        onClick={async () => {
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const r = await postDepreciation({
              id,
              version,
              mode,
              month,
              year,
            });
            if (!r.ok) setError(r.error);
            else {
              setMessage(
                r.count
                  ? `${r.count}か月分の償却費を記帳しました。`
                  : "対象期間は登録済みです。",
              );
              router.refresh();
            }
          } catch {
            setError(
              "登録結果を確認できませんでした。画面を更新し、記帳済みか確認してください。",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "登録中…"
          : amount === 0
            ? "登録する償却費はありません"
            : `¥${yen(amount)}の仕訳を登録`}
      </AppButton>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
    </div>
  );
}
export function AssetHistoryControls({
  id,
  version,
  entryId,
  archived,
}: {
  id: string;
  version: string;
  entryId?: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="space-y-3">
      {entryId && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await cancelDepreciation({
                id,
                version,
                entryId,
                reason,
              });
              if (!r.ok) setError(r.error);
              else {
                setReason("");
                router.refresh();
              }
            } catch {
              setError("取り消せませんでした。画面を更新してください。");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="font-semibold">最後に登録した仕訳の取消</h3>
          <p className="text-xs text-slate-500">
            元の仕訳と取消履歴を残します。年度まとめて登録した場合は、その仕訳に含まれる全月が未登録に戻ります。
          </p>
          <label className="block text-sm">
            取消理由
            <input
              required
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <AppButton type="submit" variant="secondary" disabled={busy}>
            最後の仕訳を取り消す
          </AppButton>
        </form>
      )}
      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs text-slate-500">
          保管すると管理中の一覧から外れます。仕訳は残ります。売却・除却の会計処理は別途行ってください。
        </p>
        <AppButton
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await archiveAsset({
                id,
                version,
                archived: !archived,
              });
              if (!r.ok) setError(r.error);
              else router.refresh();
            } catch {
              setError("変更できませんでした。画面を更新してください。");
            } finally {
              setBusy(false);
            }
          }}
        >
          {archived ? "管理中に戻す" : "資産を保管する"}
        </AppButton>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
