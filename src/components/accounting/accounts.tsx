"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAccount } from "@/actions/accounting-actions";
import { kinds, type AccountRow } from "@/lib/accounting/model";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
const empty = { code: "", name: "", kind: "EXPENSE", active: true };
export function AccountManager({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [v, setV] = useState<{
    id?: string;
    code: string;
    name: string;
    kind: string;
    active: boolean;
  }>(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await saveAccount(v);
            setV(empty);
            setMessage("科目を保存しました。");
            router.refresh();
          } catch {
            setMessage(
              "保存できませんでした。コードの重複や、標準・使用済み科目の変更制限を確認してください。",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="text-sm">
          科目コード
          <input
            required
            maxLength={12}
            value={v.code}
            onChange={(e) => setV({ ...v, code: e.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-sm">
          科目名
          <input
            required
            maxLength={60}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-sm">
          分類
          <select
            value={v.kind}
            onChange={(e) => setV({ ...v, kind: e.target.value })}
            className={`mt-1 ${selectClass}`}
          >
            {Object.entries(kinds).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.active}
            onChange={(e) => setV({ ...v, active: e.target.checked })}
          />
          入力に使用する
        </label>
        <div className="flex gap-2">
          <AppButton type="submit" disabled={busy}>
            {v.id ? "科目を更新" : "科目を追加"}
          </AppButton>
          {v.id && (
            <AppButton variant="secondary" onClick={() => setV(empty)}>
              編集をやめる
            </AppButton>
          )}
        </div>
        <p role="status" className="text-sm text-slate-600">
          {message}
        </p>
      </form>
      <p className="text-xs text-slate-500">
        標準科目は自動仕訳にも使用します。コード・分類の変更や無効化はできません。使用済み科目のコード・分類も保護します。
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["コード", "科目名", "分類", "状態", "操作"].map((x) => (
                <th key={x} className="p-3">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="p-3">{a.code}</td>
                <td className="p-3">{a.name}</td>
                <td className="p-3">{kinds[a.kind as keyof typeof kinds]}</td>
                <td className="p-3">
                  {a.active ? "使用中" : "無効"}
                  {a.system ? " / 標準" : ""}
                </td>
                <td className="p-3">
                  <AppButton variant="ghost" onClick={() => setV(a)}>
                    編集
                  </AppButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
